const express = require('express');
const { MercadoPagoConfig, Payment, MerchantOrder } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// ============================================
// CONFIGURAÇÃO MELHORADA PARA CHECKOUT BRICKS
// ============================================

console.log('🧱 Inicializando CHECKOUT BRICKS com MELHORIAS COMPLETAS');

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);
const merchantOrder = new MerchantOrder(client);

// ============================================
// FUNÇÕES UTILITÁRIAS MELHORADAS
// ============================================

// NOVO: Função para criar additional_info conforme documentação MP
function createEnhancedAdditionalInfo(paymentData, userUID) {
    const now = new Date().toISOString();
    
    return {
        // IP do cliente (opcional, mas recomendado para anti-fraude)
        ip_address: "191.168.1.1", // Em produção, obter IP real do request
        
        // ITEMS - Estrutura COMPLETA conforme documentação
        items: [
            {
                id: "teste-prosperidade-001",
                title: "Teste de Prosperidade",
                description: "Acesso completo ao resultado personalizado do teste de prosperidade financeira",
                picture_url: "https://www.suellenseragi.com.br/assets/logo-teste-prosperidade.png",
                category_id: "services", // Categoria conforme MP
                quantity: 1,
                unit_price: 10,
                type: "digital_service",
                warranty: false
            }
        ],
        
        // PAYER - Dados COMPLETOS conforme documentação
        payer: {
            first_name: paymentData.additional_info?.payer?.first_name || "Cliente",
            last_name: paymentData.additional_info?.payer?.last_name || "Teste Prosperidade",
            phone: {
                area_code: paymentData.additional_info?.payer?.phone?.area_code || "11",
                number: paymentData.additional_info?.payer?.phone?.number || "999999999"
            },
            address: paymentData.additional_info?.payer?.address || {
                street_name: "Rua da Prosperidade",
                street_number: "123",
                neighborhood: "Centro",
                city: "São Paulo",
                state: "SP",
                zip_code: "01234-567"
            },
            registration_date: paymentData.additional_info?.payer?.registration_date || now,
            is_prime_user: paymentData.additional_info?.payer?.is_prime_user || "0",
            is_first_purchase_online: paymentData.additional_info?.payer?.is_first_purchase_online || "1",
            authentication_type: paymentData.additional_info?.payer?.authentication_type || "Native web"
        },
        
        // SHIPMENTS - Dados de entrega (para serviços digitais)
        shipments: {
            receiver_address: {
                street_name: "Entrega Digital",
                street_number: "0",
                zip_code: "00000-000",
                city_name: "Online",
                state_name: "Digital"
            }
        }
    };
}

// NOVO: Função para logs estruturados
function logPayment(action, paymentId, status, details = {}) {
    const timestamp = new Date().toISOString();
    console.log(`
🔍 ================================
📅 ${timestamp}
🎯 Ação: ${action}
💳 Payment ID: ${paymentId}
📊 Status: ${status}
📋 Detalhes: ${JSON.stringify(details, null, 2)}
🔍 ================================
    `);
}

// NOVO: Função para validar dados obrigatórios
function validatePaymentData(paymentData) {
    const errors = [];
    
    if (!paymentData.payer || !paymentData.payer.email) {
        errors.push('Email do pagador é obrigatório');
    }
    
    if (!paymentData.transaction_amount || paymentData.transaction_amount <= 0) {
        errors.push('Valor da transação deve ser maior que zero');
    }
    
    if (!paymentData.description || paymentData.description.trim() === '') {
        errors.push('Descrição do pagamento é obrigatória');
    }
    
    return errors;
}

// ============================================
// ENDPOINT PRINCIPAL - MELHORADO CONFORME DOC MP
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('🧱 PROCESSANDO PAGAMENTO COM MELHORIAS COMPLETAS');
        logPayment('RECEBIDO', 'pending', 'INICIANDO', req.body);

        // Validação aprimorada
        const validationErrors = validatePaymentData(req.body);
        if (validationErrors.length > 0) {
            logPayment('VALIDAÇÃO', 'none', 'ERRO', { errors: validationErrors });
            return res.status(400).json({
                error: 'Dados inválidos',
                message: validationErrors.join(', '),
                details: validationErrors
            });
        }

        const { 
            token,
            payment_method_id,
            transaction_amount,
            installments,
            description,
            payer,
            uid,
            issuer_id,
            additional_info
        } = req.body;

        const paymentUID = uid || uuidv4();
        const enhancedAdditionalInfo = createEnhancedAdditionalInfo(req.body, paymentUID);

        // ============================================
        // PAGAMENTO CARTÃO - ESTRUTURA COMPLETA MP
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 PROCESSANDO CARTÃO COM ESTRUTURA MELHORADA');

            const paymentData = {
                // Dados básicos obrigatórios
                transaction_amount: Number(transaction_amount),
                token: token,
                description: description || 'Teste de Prosperidade - Resultado Personalizado',
                installments: Number(installments) || 1,
                payment_method_id: payment_method_id,
                issuer_id: Number(issuer_id),
                
                // PAYER - Estrutura COMPLETA conforme documentação
                payer: {
                    email: payer.email,
                    first_name: enhancedAdditionalInfo.payer.first_name,
                    last_name: enhancedAdditionalInfo.payer.last_name,
                    identification: {
                        type: payer.identification?.type || 'CPF',
                        number: payer.identification?.number || '12345678909'
                    },
                    phone: enhancedAdditionalInfo.payer.phone,
                    address: enhancedAdditionalInfo.payer.address
                },
                
                // Referência externa (importante para rastreamento)
                external_reference: paymentUID,
                
                // ADDITIONAL_INFO - Estrutura COMPLETA conforme documentação
                additional_info: enhancedAdditionalInfo,
                
                // URLs e notificações
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                callback_url: `${process.env.BASE_URL}/api/callback`,
                
                // Statement descriptor (aparece na fatura do cartão)
                statement_descriptor: 'TESTE PROSPERIDADE',
                
                // Modo binário para aprovação instantânea
                binary_mode: false,
                
                // Dados extras para segurança
                processing_mode: 'aggregator',
                capture: true,
                
                // Metadata adicional
                metadata: {
                    user_uid: paymentUID,
                    integration_type: 'checkout_bricks',
                    version: '2.0',
                    timestamp: new Date().toISOString()
                }
            };

            logPayment('CARTÃO_ENVIANDO', 'pending', 'PROCESSANDO', {
                transaction_amount: paymentData.transaction_amount,
                payment_method_id: paymentData.payment_method_id,
                token_preview: token.substring(0, 10) + '...',
                issuer_id: paymentData.issuer_id,
                external_reference: paymentUID
            });

            const result = await payment.create({
                body: paymentData,
                requestOptions: {
                    idempotencyKey: uuidv4()
                }
            });

            logPayment('CARTÃO_RESULTADO', result.id, result.status, {
                status_detail: result.status_detail,
                payment_method_id: result.payment_method_id
            });

            const response = {
                id: result.id,
                status: result.status,
                status_detail: result.status_detail,
                payment_method_id: result.payment_method_id,
                payment_type_id: result.payment_type_id,
                transaction_amount: result.transaction_amount,
                uid: paymentUID,
                date_created: result.date_created,
                date_approved: result.date_approved
            };

            if (result.status === 'approved') {
                response.redirect_url = `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`;
                logPayment('CARTÃO_APROVADO', result.id, 'SUCCESS', { uid: paymentUID });
            }

            return res.status(201).json(response);
        }

        // ============================================
        // PAGAMENTO PIX - ESTRUTURA MELHORADA MP
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 PROCESSANDO PIX COM ESTRUTURA MELHORADA');

            const pixData = {
                // Dados básicos obrigatórios
                transaction_amount: Number(transaction_amount),
                description: description || 'Teste de Prosperidade - Resultado Personalizado',
                payment_method_id: 'pix',
                
                // PAYER - Estrutura COMPLETA conforme documentação
                payer: {
                    email: payer.email,
                    first_name: enhancedAdditionalInfo.payer.first_name,
                    last_name: enhancedAdditionalInfo.payer.last_name,
                    identification: {
                        type: 'CPF',
                        number: '12345678909'
                    },
                    phone: enhancedAdditionalInfo.payer.phone,
                    address: enhancedAdditionalInfo.payer.address
                },
                
                // Referência externa
                external_reference: paymentUID,
                
                // ADDITIONAL_INFO - Estrutura COMPLETA
                additional_info: enhancedAdditionalInfo,
                
                // URLs e notificações
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                callback_url: `${process.env.BASE_URL}/api/callback`,
                
                // Data de expiração (importante para PIX)
                date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
                
                // Metadata adicional
                metadata: {
                    user_uid: paymentUID,
                    integration_type: 'checkout_bricks_pix',
                    version: '2.0',
                    timestamp: new Date().toISOString()
                }
            };

            logPayment('PIX_ENVIANDO', 'pending', 'PROCESSANDO', {
                transaction_amount: pixData.transaction_amount,
                external_reference: paymentUID,
                expiration: pixData.date_of_expiration
            });

            const pixResult = await payment.create({
                body: pixData,
                requestOptions: {
                    idempotencyKey: uuidv4()
                }
            });

            logPayment('PIX_CRIADO', pixResult.id, pixResult.status, {
                status_detail: pixResult.status_detail,
                point_of_interaction: !!pixResult.point_of_interaction
            });

            const response = {
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                payment_method_id: pixResult.payment_method_id,
                payment_type_id: pixResult.payment_type_id,
                transaction_amount: pixResult.transaction_amount,
                uid: paymentUID,
                date_created: pixResult.date_created,
                date_of_expiration: pixResult.date_of_expiration
            };

            // Dados do PIX para QR Code
            if (pixResult.point_of_interaction?.transaction_data) {
                response.qr_code = pixResult.point_of_interaction.transaction_data.qr_code;
                response.qr_code_base64 = pixResult.point_of_interaction.transaction_data.qr_code_base64;
                response.ticket_url = pixResult.point_of_interaction.transaction_data.ticket_url;
                
                logPayment('PIX_QR_GERADO', pixResult.id, 'QR_READY', {
                    qr_code_length: response.qr_code?.length || 0,
                    has_base64: !!response.qr_code_base64,
                    has_ticket: !!response.ticket_url
                });
            }

            return res.status(201).json(response);
        }

        return res.status(400).json({
            error: 'Método de pagamento não suportado',
            message: 'Use cartão de crédito ou PIX'
        });

    } catch (error) {
        console.error('❌ ERRO COMPLETO NO CHECKOUT BRICKS:', error);
        logPayment('ERRO_GERAL', 'error', 'FALHA', {
            message: error.message,
            stack: error.stack?.substring(0, 500)
        });

        // Tratamento específico para erros de Bricks
        if (error.cause && error.cause.length > 0) {
            const mpError = error.cause[0];
            
            logPayment('ERRO_MP', 'error', 'MERCADO_PAGO', {
                code: mpError.code,
                description: mpError.description
            });

            return res.status(400).json({
                error: 'Erro do Mercado Pago',
                message: mpError.description || mpError.message,
                code: mpError.code,
                details: mpError
            });
        }

        return res.status(500).json({
            error: 'Erro interno do servidor',
            message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
            timestamp: new Date().toISOString()
        });
    }
});

// ============================================
// WEBHOOK MELHORADO PARA BRICKS
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 WEBHOOK MELHORADO RECEBIDO:', req.body);
        logPayment('WEBHOOK_RECEBIDO', req.body.data?.id || 'unknown', req.body.action, req.body);

        // Responder imediatamente (padrão MP)
        res.status(200).json({ 
            received: true,
            source: 'checkout_bricks_improved',
            timestamp: new Date().toISOString()
        });

        const { action, data, type } = req.body;

        // Processar notificações de pagamento
        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            try {
                const paymentDetails = await payment.get({ id: data.id });
                
                logPayment('WEBHOOK_CONSULTADO', data.id, paymentDetails.status, {
                    status_detail: paymentDetails.status_detail,
                    external_reference: paymentDetails.external_reference,
                    payment_method_id: paymentDetails.payment_method_id
                });

                // Log específico para PIX aprovado
                if (paymentDetails.status === 'approved' && paymentDetails.payment_method_id === 'pix') {
                    logPayment('PIX_APROVADO_WEBHOOK', data.id, 'SUCCESS', {
                        uid: paymentDetails.external_reference,
                        transaction_amount: paymentDetails.transaction_amount,
                        date_approved: paymentDetails.date_approved
                    });
                }

                // Log específico para cartão aprovado
                if (paymentDetails.status === 'approved' && paymentDetails.payment_type_id === 'credit_card') {
                    logPayment('CARTÃO_APROVADO_WEBHOOK', data.id, 'SUCCESS', {
                        uid: paymentDetails.external_reference,
                        transaction_amount: paymentDetails.transaction_amount,
                        installments: paymentDetails.installments
                    });
                }

            } catch (error) {
                console.error('❌ Erro ao buscar detalhes do pagamento no webhook:', error);
                logPayment('WEBHOOK_ERRO', data.id, 'ERRO_CONSULTA', {
                    error: error.message
                });
            }
        }

        // Processar notificações de merchant_order (importantes para PIX)
        if (type === 'merchant_order' && data && data.id) {
            try {
                const orderDetails = await merchantOrder.get({ merchantOrderId: data.id });
                
                logPayment('MERCHANT_ORDER', data.id, orderDetails.status, {
                    order_status: orderDetails.order_status,
                    payments: orderDetails.payments?.length || 0
                });

            } catch (error) {
                console.error('❌ Erro ao buscar merchant order:', error);
                logPayment('MERCHANT_ORDER_ERRO', data.id, 'ERRO_CONSULTA', {
                    error: error.message
                });
            }
        }

    } catch (error) {
        console.error('❌ Erro geral no webhook:', error);
        logPayment('WEBHOOK_ERRO_GERAL', 'error', 'FALHA', {
            message: error.message
        });
        
        if (!res.headersSent) {
            res.status(200).json({ 
                received: true,
                error: 'Erro interno no webhook'
            });
        }
    }
});

// ============================================
// NOVO: CONSULTAR PAGAMENTO PARA POLLING
// ============================================

router.get('/payment/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        console.log(`🔍 CONSULTANDO PAGAMENTO: ${paymentId}`);
        
        const paymentDetails = await payment.get({ id: paymentId });
        
        logPayment('CONSULTA_POLLING', paymentId, paymentDetails.status, {
            status_detail: paymentDetails.status_detail,
            payment_method_id: paymentDetails.payment_method_id
        });
        
        const response = {
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
            transaction_amount: paymentDetails.transaction_amount,
            uid: paymentDetails.external_reference,
            payment_method_id: paymentDetails.payment_method_id,
            payment_type_id: paymentDetails.payment_type_id,
            date_created: paymentDetails.date_created,
            date_approved: paymentDetails.date_approved,
            source: 'polling_consultation'
        };

        // Adicionar dados do PIX se disponíveis
        if (paymentDetails.payment_method_id === 'pix' && paymentDetails.point_of_interaction?.transaction_data) {
            response.qr_code = paymentDetails.point_of_interaction.transaction_data.qr_code;
            response.qr_code_base64 = paymentDetails.point_of_interaction.transaction_data.qr_code_base64;
            response.ticket_url = paymentDetails.point_of_interaction.transaction_data.ticket_url;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Erro ao consultar pagamento:', error);
        logPayment('CONSULTA_ERRO', req.params.id, 'ERRO', {
            message: error.message
        });
        
        res.status(404).json({
            error: 'Pagamento não encontrado',
            message: 'Verifique o ID do pagamento',
            payment_id: req.params.id
        });
    }
});

// ============================================
// NOVO: ESTORNOS PARCIAIS E TOTAIS
// ============================================

router.post('/refund/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { amount, reason } = req.body;

        console.log(`💰 PROCESSANDO ESTORNO: ${paymentId}`);
        logPayment('ESTORNO_INICIADO', paymentId, 'PROCESSING', { amount, reason });

        // Buscar detalhes do pagamento original
        const originalPayment = await payment.get({ id: paymentId });
        
        if (originalPayment.status !== 'approved') {
            return res.status(400).json({
                error: 'Pagamento não pode ser estornado',
                message: 'Apenas pagamentos aprovados podem ser estornados',
                status: originalPayment.status
            });
        }

        // Criar refund
        const refundData = {
            payment_id: parseInt(paymentId),
            amount: amount ? Number(amount) : undefined, // undefined = estorno total
            reason: reason || 'Solicitação do cliente'
        };

        // Nota: Estornos requerem SDK específico - aqui é a estrutura
        // Em produção, usar: const refund = new Refund(client);
        
        logPayment('ESTORNO_SIMULADO', paymentId, 'SIMULATED', refundData);

        res.status(200).json({
            message: 'Funcionalidade de estorno configurada',
            payment_id: paymentId,
            refund_data: refundData,
            note: 'Implementar com SDK específico de Refunds'
        });

    } catch (error) {
        console.error('❌ Erro no estorno:', error);
        logPayment('ESTORNO_ERRO', req.params.paymentId, 'ERROR', {
            message: error.message
        });
        
        res.status(500).json({
            error: 'Erro ao processar estorno',
            message: error.message
        });
    }
});

// ============================================
// NOVO: CALLBACK URL (para alguns métodos de pagamento)
// ============================================

router.get('/callback', (req, res) => {
    console.log('🔄 CALLBACK RECEBIDO:', req.query);
    logPayment('CALLBACK', req.query.payment_id || 'unknown', 'CALLBACK', req.query);
    
    // Redirecionar para resultado com UID se disponível
    if (req.query.external_reference) {
        res.redirect(`https://www.suellenseragi.com.br/resultado?uid=${req.query.external_reference}`);
    } else {
        res.redirect('https://quizfront.vercel.app');
    }
});

module.exports = router;
