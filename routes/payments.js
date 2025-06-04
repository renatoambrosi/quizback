const express = require('express');
const { MercadoPagoConfig, Payment, MerchantOrder } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();
const SimpleEmailSender = require('../email-sender');
const emailSender = new SimpleEmailSender();

// ============================================
// CONFIGURAÇÃO OFICIAL MERCADO PAGO
// ============================================

console.log('🧱 Inicializando Checkout Bricks - Configuração Oficial MP');

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);
const merchantOrder = new MerchantOrder(client);

// ============================================
// FUNÇÕES UTILITÁRIAS CONFORME DOC OFICIAL
// ============================================

// Função para criar additional_info conforme documentação oficial MP
function createAdditionalInfo(paymentData, userUID) {
    const now = new Date().toISOString();
    
    return {
        // ITEMS - Estrutura conforme doc oficial MP
        items: [
            {
                id: "teste-prosperidade-001",
                title: "Teste de Prosperidade",
                description: "Acesso ao resultado personalizado do teste de prosperidade",
                category_id: "services",
                quantity: 1,
                unit_price: 10,
                picture_url: "https://www.suellenseragi.com.br/logo.png"
            }
        ],
        
        // PAYER - Estrutura conforme doc oficial MP
        payer: {
            first_name: paymentData.additional_info?.payer?.first_name || "Cliente",
            last_name: paymentData.additional_info?.payer?.last_name || "Teste",
            phone: {
                area_code: paymentData.additional_info?.payer?.phone?.area_code || "11",
                number: paymentData.additional_info?.payer?.phone?.number || "999999999"
            },
            registration_date: paymentData.additional_info?.payer?.registration_date || now,
            is_prime_user: paymentData.additional_info?.payer?.is_prime_user || "0",
            is_first_purchase_online: paymentData.additional_info?.payer?.is_first_purchase_online || "1",
            authentication_type: paymentData.additional_info?.payer?.authentication_type || "Native web"
        },
        
        // SHIPMENTS - Estrutura conforme doc oficial MP
        shipments: {
            receiver_address: {
                zip_code: "01234-567",
                state_name: "São Paulo",
                city_name: "São Paulo",
                street_name: "Entrega Digital",
                street_number: "0"
            }
        }
    };
}

// Função para logs estruturados
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

// Função para validar dados obrigatórios
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
// ENDPOINT PRINCIPAL - CONFORME DOC OFICIAL MP
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('🧱 PROCESSANDO PAGAMENTO - Checkout Bricks Oficial');
        logPayment('RECEBIDO', 'pending', 'INICIANDO', req.body);

        // Validação conforme documentação
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
        const enhancedAdditionalInfo = createAdditionalInfo(req.body, paymentUID);

        // ============================================
        // PAGAMENTO CARTÃO - CONFORME DOC OFICIAL MP
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 PROCESSANDO CARTÃO - Estrutura Oficial MP');

            const paymentData = {
                transaction_amount: Number(transaction_amount),
                token: token,
                description: description || 'Teste de Prosperidade - Resultado Personalizado',
                installments: Number(installments) || 1,
                payment_method_id: payment_method_id,
                issuer_id: Number(issuer_id),
                
                // PAYER conforme documentação oficial
                payer: {
                    email: payer.email,
                    identification: {
                        type: payer.identification?.type || 'CPF',
                        number: payer.identification?.number || '12345678909'
                    }
                },
                
                external_reference: paymentUID,
                additional_info: enhancedAdditionalInfo,
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                statement_descriptor: 'TESTE PROSPERIDADE',
                binary_mode: false,
                
                metadata: {
                    user_uid: paymentUID,
                    integration_type: 'checkout_bricks',
                    version: '2.0'
                }
            };

            logPayment('CARTÃO_ENVIANDO', 'pending', 'PROCESSANDO', {
                transaction_amount: paymentData.transaction_amount,
                payment_method_id: paymentData.payment_method_id,
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
        // PAGAMENTO PIX - CONFORME DOC OFICIAL MP
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 PROCESSANDO PIX - Estrutura Oficial MP');

            const pixData = {
                transaction_amount: Number(transaction_amount),
                description: description || 'Teste de Prosperidade - Resultado Personalizado',
                payment_method_id: 'pix',
                
                // PAYER conforme documentação oficial
                payer: {
                    email: payer.email,
                    identification: {
                        type: 'CPF',
                        number: '12345678909'
                    }
                },
                
                external_reference: paymentUID,
                additional_info: enhancedAdditionalInfo,
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                
                // Data de expiração conforme doc oficial (30 minutos)
                date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
                
                metadata: {
                    user_uid: paymentUID,
                    customer_email: payer.email,  // ← SALVAR EMAIL DO FORMULÁRIO
                    integration_type: 'checkout_bricks_pix',
                    version: '2.0'
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

            // Dados do PIX conforme doc oficial
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
        console.error('❌ ERRO CHECKOUT BRICKS:', error);
        logPayment('ERRO_GERAL', 'error', 'FALHA', {
            message: error.message,
            stack: error.stack?.substring(0, 500)
        });

        // Tratamento específico para erros MP conforme doc oficial
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
// WEBHOOK CONFORME DOC OFICIAL MP
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 WEBHOOK OFICIAL MP RECEBIDO:', req.body);
        logPayment('WEBHOOK_RECEBIDO', req.body.data?.id || 'unknown', req.body.action, req.body);

        // Responder imediatamente (padrão MP oficial)
        res.status(200).json({ 
            received: true,
            source: 'checkout_bricks_oficial',
            timestamp: new Date().toISOString()
        });

        const { action, data, type } = req.body;

        // Processar notificações de pagamento conforme doc oficial
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
                const customerEmail = paymentDetails.metadata?.customer_email;
                await emailSender.sendPixSuccessEmail(customerEmail, paymentDetails.external_reference);
    
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

        // Processar notificações de merchant_order conforme doc oficial
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
// CONSULTAR PAGAMENTO PARA POLLING - CONFORME DOC OFICIAL
// ============================================

router.get('/payment/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        console.log(`🔍 CONSULTANDO PAGAMENTO OFICIAL: ${paymentId}`);
        
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

        // Adicionar dados do PIX se disponíveis conforme doc oficial
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
// CALLBACK URL CONFORME DOC OFICIAL
// ============================================

router.get('/callback', (req, res) => {
    console.log('🔄 CALLBACK OFICIAL RECEBIDO:', req.query);
    logPayment('CALLBACK', req.query.payment_id || 'unknown', 'CALLBACK', req.query);
    
    // Redirecionar para resultado com UID se disponível
    if (req.query.external_reference) {
        res.redirect(`https://www.suellenseragi.com.br/resultado?uid=${req.query.external_reference}`);
    } else {
        res.redirect('https://quizfront.vercel.app');
    }
});

module.exports = router;
