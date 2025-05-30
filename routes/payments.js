const express = require('express');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const router = express.Router();

// ============================================
// 🔧 CONFIGURAÇÃO MERCADO PAGO - PRODUÇÃO APENAS (ERRO 2006 CORRIGIDO)
// ============================================

// ✅ CORREÇÃO PRINCIPAL: Apenas credenciais de produção - SEM FALLBACK para TEST-
const accessToken = process.env.MERCADOPAGO_ACCESS_TOKEN;
const publicKey = process.env.MERCADOPAGO_PUBLIC_KEY;

// ✅ VALIDAÇÃO RIGOROSA DE CREDENCIAIS
if (!accessToken) {
    console.error('❌ MERCADOPAGO_ACCESS_TOKEN não configurado!');
    console.error('❌ Configure no Railway: Settings → Environment');
    process.exit(1);
}

if (!publicKey) {
    console.error('❌ MERCADOPAGO_PUBLIC_KEY não configurado!');
    console.error('❌ Configure no Railway: Settings → Environment');
    process.exit(1);
}

// ✅ CORREÇÃO ERRO 2006: Validar que estamos usando credenciais de PRODUÇÃO
if (accessToken.startsWith('TEST-')) {
    console.error('❌ ERRO CRÍTICO: Usando ACCESS_TOKEN de TESTE em produção!');
    console.error('❌ Configure credenciais de PRODUÇÃO (APP_USR-) no Railway');
    console.error('❌ Este erro causará: Card Token not found (2006)');
    console.error('❌ SOLUÇÃO: MERCADOPAGO_ACCESS_TOKEN=APP_USR-...');
}

if (publicKey.startsWith('TEST-')) {
    console.error('❌ ERRO CRÍTICO: Usando PUBLIC_KEY de TESTE em produção!');
    console.error('❌ Configure credenciais de PRODUÇÃO (APP_USR-) no Railway');
    console.error('❌ Este erro causará: Card Token not found (2006)');
    console.error('❌ SOLUÇÃO: MERCADOPAGO_PUBLIC_KEY=APP_USR-...');
}

// ✅ LOGS DETALHADOS para debug em produção
console.log('🔧 =================================');
console.log('🔧 CONFIGURAÇÃO MERCADO PAGO');
console.log('🔧 =================================');
console.log('🔑 Access Token:', accessToken ? accessToken.substring(0, 20) + '...' : 'NÃO CONFIGURADO');
console.log('🔑 Public Key:', publicKey ? publicKey.substring(0, 20) + '...' : 'NÃO CONFIGURADO');
console.log('🌐 Ambiente:', process.env.NODE_ENV || 'production');
console.log('🏭 Produção (Access)?', accessToken?.startsWith('APP_USR-') ? '✅ SIM' : '❌ NÃO');
console.log('🏭 Produção (Public)?', publicKey?.startsWith('APP_USR-') ? '✅ SIM' : '❌ NÃO');
console.log('🔧 =================================');

// ✅ INICIALIZAR MERCADO PAGO - APENAS COM CREDENCIAIS DE PRODUÇÃO
const client = new MercadoPagoConfig({
    accessToken: accessToken, // ✅ SEM FALLBACK PARA TEST-
    options: {
        timeout: 5000,
        idempotencyKey: uuidv4()
    }
});

const payment = new Payment(client);
const preference = new Preference(client);

// ============================================
// FUNÇÃO PARA VALIDAR ASSINATURA WEBHOOK
// ============================================

function validateWebhookSignature(req) {
    try {
        // Obter headers necessários
        const xSignature = req.headers['x-signature'];
        const xRequestId = req.headers['x-request-id'];
        
        if (!xSignature) {
            console.log('⚠️ Webhook sem assinatura - pode ser teste');
            return true; // Aceitar para testes locais
        }

        // Extrair timestamp e hash da assinatura
        const parts = xSignature.split(',');
        let ts = null;
        let hash = null;

        parts.forEach(part => {
            const [key, value] = part.split('=');
            if (key.trim() === 'ts') ts = value.trim();
            if (key.trim() === 'v1') hash = value.trim();
        });

        // Obter dados da notificação
        const dataId = req.query['data.id'] || req.body?.data?.id || '';
        
        // Chave secreta (será obtida do painel após configuração)
        const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
        
        if (!secret) {
            console.log('⚠️ MERCADOPAGO_WEBHOOK_SECRET não configurado');
            return true; // Aceitar até configurar
        }

        // Criar manifest string conforme documentação
        const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
        
        // Gerar HMAC SHA256
        const expectedSignature = crypto
            .createHmac('sha256', secret)
            .update(manifest)
            .digest('hex');

        // Comparar assinaturas
        const isValid = expectedSignature === hash;
        
        console.log(`🔐 Validação webhook: ${isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
        
        return isValid;

    } catch (error) {
        console.error('❌ Erro na validação da assinatura:', error);
        return false;
    }
}

// ============================================
// PROCESSAR PAGAMENTOS (PRODUÇÃO APENAS)
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('💳 ===================================');
        console.log('💳 PROCESSANDO PAGAMENTO (PRODUÇÃO)');
        console.log('💳 ===================================');
        console.log('💳 Dados recebidos:', {
            payment_method_id: req.body.payment_method_id,
            transaction_amount: req.body.transaction_amount,
            uid: req.body.uid,
            has_token: !!req.body.token,
            token_preview: req.body.token ? req.body.token.substring(0, 15) + '...' : 'N/A',
            issuer_id: req.body.issuer_id,
            installments: req.body.installments
        });

        const { 
            token,
            payment_method_id,
            transaction_amount,
            installments,
            description,
            payer,
            uid,
            issuer_id
        } = req.body;

        // ✅ VALIDAÇÕES BÁSICAS RIGOROSAS
        if (!transaction_amount || transaction_amount <= 0) {
            console.error('❌ Valor inválido:', transaction_amount);
            return res.status(400).json({
                error: 'Valor inválido',
                message: 'O valor do pagamento deve ser maior que zero'
            });
        }

        if (!payer || !payer.email) {
            console.error('❌ Email do pagador ausente');
            return res.status(400).json({
                error: 'Dados do pagador inválidos',
                message: 'Email do pagador é obrigatório'
            });
        }

        // UID para rastreamento (se não vier, gera um)
        const paymentUID = uid || uuidv4();
        const idempotencyKey = uuidv4();

        console.log('🆔 UID do pagamento:', paymentUID);
        console.log('🔑 Idempotency Key:', idempotencyKey);

        // ============================================
        // PAGAMENTO PIX
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 ===========================');
            console.log('🟢 PROCESSANDO PIX (PRODUÇÃO)');
            console.log('🟢 ===========================');

            const pixPaymentData = {
                transaction_amount: Number(transaction_amount),
                description: description || 'Teste de Prosperidade',
                payment_method_id: 'pix',
                payer: {
                    email: payer.email,
                    ...(payer.identification && {
                        identification: {
                            type: payer.identification.type || 'CPF',
                            number: payer.identification.number
                        }
                    })
                },
                external_reference: paymentUID,
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                metadata: {
                    uid: paymentUID,
                    teste_prosperidade: true,
                    ambiente: 'producao',
                    timestamp: new Date().toISOString()
                }
            };

            console.log('📤 Dados PIX para Mercado Pago:', pixPaymentData);

            const pixResult = await payment.create({
                body: pixPaymentData,
                requestOptions: { idempotencyKey }
            });

            console.log('✅ PIX criado com sucesso (PRODUÇÃO):', {
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                uid: paymentUID
            });

            return res.status(201).json({
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                payment_method_id: pixResult.payment_method_id,
                transaction_amount: pixResult.transaction_amount,
                uid: paymentUID,
                qr_code: pixResult.point_of_interaction?.transaction_data?.qr_code,
                qr_code_base64: pixResult.point_of_interaction?.transaction_data?.qr_code_base64,
                ticket_url: pixResult.point_of_interaction?.transaction_data?.ticket_url,
                date_of_expiration: pixResult.date_of_expiration
            });
        }

        // ============================================
        // PAGAMENTO CARTÃO DE CRÉDITO
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 ==============================');
            console.log('💳 PROCESSANDO CARTÃO (PRODUÇÃO)');
            console.log('💳 ==============================');

            // ✅ CORREÇÃO ERRO 2006: Validação rigorosa do token
            if (!token || typeof token !== 'string' || token.length < 10) {
                console.error('❌ Token inválido recebido:', {
                    token_exists: !!token,
                    token_type: typeof token,
                    token_length: token ? token.length : 0,
                    token_preview: token ? token.substring(0, 10) + '...' : 'N/A'
                });
                
                return res.status(400).json({
                    error: 'Token inválido',
                    message: 'Token do cartão é obrigatório e deve ser válido',
                    details: 'Verifique se as credenciais frontend/backend são da mesma conta'
                });
            }

            // ✅ DADOS DO PAGAMENTO COM CARTÃO
            const cardPaymentData = {
                transaction_amount: Number(transaction_amount),
                token: token,
                description: description || 'Teste de Prosperidade',
                installments: Number(installments) || 1,
                payment_method_id: payment_method_id,
                ...(issuer_id && { issuer_id: Number(issuer_id) }),
                payer: {
                    email: payer.email,
                    ...(payer.identification && {
                        identification: {
                            type: payer.identification.type || 'CPF',
                            number: payer.identification.number
                        }
                    })
                },
                external_reference: paymentUID,
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                statement_descriptor: 'TESTE PROSPERIDADE',
                metadata: {
                    uid: paymentUID,
                    teste_prosperidade: true,
                    ambiente: 'producao',
                    timestamp: new Date().toISOString()
                }
            };

            console.log('📤 Dados CARTÃO para Mercado Pago (PRODUÇÃO):', {
                transaction_amount: cardPaymentData.transaction_amount,
                payment_method_id: cardPaymentData.payment_method_id,
                installments: cardPaymentData.installments,
                token_preview: token.substring(0, 15) + '...',
                external_reference: paymentUID,
                issuer_id: cardPaymentData.issuer_id,
                payer_email: cardPaymentData.payer.email
            });

            // ✅ CRIAR PAGAMENTO NO MERCADO PAGO
            const cardResult = await payment.create({
                body: cardPaymentData,
                requestOptions: { idempotencyKey }
            });

            console.log('✅ =============================');
            console.log('✅ PAGAMENTO CARTÃO CRIADO (PRODUÇÃO)');
            console.log('✅ =============================');
            console.log('✅ Resultado:', {
                id: cardResult.id,
                status: cardResult.status,
                status_detail: cardResult.status_detail,
                uid: paymentUID,
                transaction_amount: cardResult.transaction_amount,
                payment_method_id: cardResult.payment_method_id
            });

            // ✅ RESPOSTA BASEADA NO STATUS
            const response = {
                id: cardResult.id,
                status: cardResult.status,
                status_detail: cardResult.status_detail,
                payment_method_id: cardResult.payment_method_id,
                transaction_amount: cardResult.transaction_amount,
                uid: paymentUID
            };

            if (cardResult.status === 'approved') {
                response.redirect_url = `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`;
                console.log('🎉 PAGAMENTO APROVADO! Redirecionando para:', response.redirect_url);
            }

            return res.status(201).json(response);
        }

        // ✅ MÉTODO DE PAGAMENTO NÃO SUPORTADO
        console.error('❌ Método de pagamento não suportado:', {
            payment_method_id,
            has_token: !!token
        });
        
        return res.status(400).json({
            error: 'Método de pagamento não suportado',
            message: 'Apenas cartão de crédito e PIX são aceitos'
        });

    } catch (error) {
        console.error('❌ ===============================');
        console.error('❌ ERRO AO PROCESSAR PAGAMENTO (PRODUÇÃO)');
        console.error('❌ ===============================');
        console.error('❌ Erro completo:', error);

        // ✅ CORREÇÃO ERRO 2006: Tratamento específico de erros
        if (error.cause && error.cause.length > 0) {
            const mpError = error.cause[0];
            
            console.error('🔍 Erro detalhado do Mercado Pago:', {
                code: mpError.code,
                description: mpError.description,
                data: mpError.data
            });

            // ✅ TRATAMENTO ESPECÍFICO DO ERRO 2006
            if (mpError.code === 2006) {
                console.error('🚨 ===============================');
                console.error('🚨 ERRO 2006: Card Token not found');
                console.error('🚨 ===============================');
                console.error('🔧 CAUSA: Token criado em ambiente diferente do processamento');
                console.error('🔧 SOLUÇÃO: Verificar credenciais frontend/backend:');
                console.error('🔧 FRONTEND deve usar: APP_USR-d6a5ce3d-f58e-4ad8-9ae8-22ff5ff2bb14');
                console.error('🔧 BACKEND deve usar: APP_USR-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182');
                console.error('🔧 IMPORTANTE: Ambas devem ser da MESMA conta Mercado Pago!');
                console.error('🚨 ===============================');
                
                return res.status(400).json({
                    error: 'Token do cartão inválido (Erro 2006)',
                    message: 'O token do cartão não foi encontrado. Isso indica incompatibilidade entre credenciais.',
                    code: mpError.code,
                    details: 'Verifique se as credenciais de produção frontend/backend são da mesma conta',
                    solution: 'Configure credenciais APP_USR- no Railway e frontend'
                });
            }

            // ✅ OUTROS ERROS DO MERCADO PAGO
            return res.status(400).json({
                error: 'Erro do Mercado Pago',
                message: mpError.description || mpError.message,
                code: mpError.code
            });
        }

        // ✅ ERRO GENÉRICO
        return res.status(500).json({
            error: 'Erro interno',
            message: 'Não foi possível processar o pagamento'
        });
    }
});

// ============================================
// WEBHOOK PARA PRODUÇÃO
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 ===========================');
        console.log('🔔 WEBHOOK RECEBIDO (PRODUÇÃO)');
        console.log('🔔 ===========================');
        console.log('🔔 Body:', req.body);
        console.log('🔔 Query:', req.query);
        console.log('🔔 Headers importantes:', {
            'x-signature': req.headers['x-signature'],
            'x-request-id': req.headers['x-request-id']
        });

        // ✅ VALIDAR ASSINATURA CONFORME DOCUMENTAÇÃO
        const isValidSignature = validateWebhookSignature(req);
        
        if (!isValidSignature) {
            console.error('❌ Assinatura webhook inválida - possível fraude');
            return res.status(401).json({ 
                error: 'Assinatura inválida',
                message: 'Webhook rejeitado por segurança' 
            });
        }

        // Obter dados da notificação (padrão Webhooks)
        const { action, data, type } = req.body;

        // ✅ RESPONDER IMEDIATAMENTE CONFORME DOCUMENTAÇÃO
        res.status(200).json({ 
            received: true,
            timestamp: new Date().toISOString(),
            processed: true
        });

        // ============================================
        // PROCESSAR NOTIFICAÇÃO DE PAGAMENTO
        // ============================================

        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            const paymentId = data.id;
            
            try {
                console.log(`📋 Buscando detalhes do pagamento ${paymentId} (PRODUÇÃO)...`);
                
                const paymentDetails = await payment.get({ id: paymentId });
                
                console.log(`📊 ===========================`);
                console.log(`📊 STATUS PAGAMENTO ${paymentId} (PRODUÇÃO)`);
                console.log(`📊 ===========================`);
                console.log(`📊 Status:`, paymentDetails.status);
                console.log(`📊 Status Detail:`, paymentDetails.status_detail);
                console.log(`📊 UID:`, paymentDetails.external_reference);
                console.log(`📊 Valor:`, paymentDetails.transaction_amount);
                console.log(`📊 Método:`, paymentDetails.payment_method_id);
                console.log(`📊 ===========================`);
                
                // ============================================
                // AÇÕES BASEADAS NO STATUS DO PAGAMENTO
                // ============================================
                
                if (paymentDetails.status === 'approved') {
                    const uid = paymentDetails.external_reference;
                    const amount = paymentDetails.transaction_amount;
                    const method = paymentDetails.payment_method_id;
                    
                    console.log(`🎉 ===============================`);
                    console.log(`🎉 PAGAMENTO APROVADO (PRODUÇÃO)!`);
                    console.log(`🎉 ===============================`);
                    console.log(`🎉 💰 Valor: R$ ${amount}`);
                    console.log(`🎉 💳 Método: ${method}`);
                    console.log(`🎉 🆔 UID: ${uid}`);
                    console.log(`🎉 🔗 Resultado: https://www.suellenseragi.com.br/resultado?uid=${uid}`);
                    console.log(`🎉 ===============================`);
                    
                    // 🎯 AQUI VOCÊ PODE ADICIONAR SUAS AÇÕES DE PRODUÇÃO:
                    // - Salvar no banco de dados
                    // - Enviar email de confirmação
                    // - Liberar acesso ao resultado
                    // - Integrar com outros sistemas
                    // - Analytics/tracking
                    
                } else if (paymentDetails.status === 'pending') {
                    const uid = paymentDetails.external_reference;
                    console.log(`⏳ Pagamento pendente para UID: ${uid} (PRODUÇÃO)`);
                    
                } else if (['rejected', 'cancelled'].includes(paymentDetails.status)) {
                    const uid = paymentDetails.external_reference;
                    console.log(`❌ Pagamento ${paymentDetails.status} para UID: ${uid} (PRODUÇÃO)`);
                }

            } catch (error) {
                console.error('❌ Erro ao buscar detalhes do pagamento (PRODUÇÃO):', error);
            }
        } else {
            console.log('ℹ️ Notificação ignorada - não é payment.updated:', { action, type });
        }

    } catch (error) {
        console.error('❌ Erro no processamento do webhook (PRODUÇÃO):', error);
        
        // ⚠️ MESMO COM ERRO, RESPONDER 200 PARA EVITAR REENVIOS
        if (!res.headersSent) {
            res.status(200).json({ 
                received: true, 
                error: 'Erro interno processamento' 
            });
        }
    }
});

// ============================================
// CONSULTAR STATUS DE PAGAMENTO
// ============================================

router.get('/payment/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        console.log(`🔍 Consultando pagamento ${id} (PRODUÇÃO)...`);
        
        const paymentDetails = await payment.get({ id });
        
        console.log(`📋 Pagamento ${id} encontrado:`, {
            status: paymentDetails.status,
            uid: paymentDetails.external_reference
        });
        
        res.status(200).json({
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
            transaction_amount: paymentDetails.transaction_amount,
            uid: paymentDetails.external_reference,
            payment_method_id: paymentDetails.payment_method_id,
            date_created: paymentDetails.date_created,
            date_approved: paymentDetails.date_approved
        });

    } catch (error) {
        console.error('❌ Erro ao consultar pagamento (PRODUÇÃO):', error);
        res.status(404).json({
            error: 'Pagamento não encontrado',
            message: 'ID de pagamento inválido'
        });
    }
});

// ============================================
// CRIAR PREFERÊNCIA
// ============================================

router.post('/create_preference', async (req, res) => {
    try {
        const { uid, amount = 10, payer_email } = req.body;
        
        const paymentUID = uid || uuidv4();

        console.log(`🛍️ Criando preferência para UID: ${paymentUID} (PRODUÇÃO)`);

        const preferenceData = {
            items: [
                {
                    id: 'teste-prosperidade',
                    title: 'Teste de Prosperidade',
                    description: 'Acesso ao resultado personalizado do seu teste',
                    quantity: 1,
                    currency_id: 'BRL',
                    unit_price: Number(amount)
                }
            ],
            payer: {
                email: payer_email || 'test@test.com'
            },
            back_urls: {
                success: `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`,
                failure: `https://quizfront.vercel.app/erro?uid=${paymentUID}`,
                pending: `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`
            },
            auto_return: 'approved',
            external_reference: paymentUID,
            notification_url: `${process.env.BASE_URL}/api/webhook`,
            statement_descriptor: 'TESTE PROSPERIDADE',
            metadata: {
                uid: paymentUID,
                teste_prosperidade: true,
                ambiente: 'producao'
            }
        };

        const result = await preference.create({ body: preferenceData });

        console.log(`✅ Preferência criada: ${result.id} (PRODUÇÃO)`);

        res.status(201).json({
            id: result.id,
            init_point: result.init_point,
            sandbox_init_point: result.sandbox_init_point,
            uid: paymentUID
        });

    } catch (error) {
        console.error('❌ Erro ao criar preferência (PRODUÇÃO):', error);
        res.status(500).json({
            error: 'Erro ao criar preferência',
            message: error.message
        });
    }
});

module.exports = router;
