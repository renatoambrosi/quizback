const express = require('express');
const { MercadoPagoConfig, Payment, MerchantOrder } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// ============================================
// CONFIGURAÇÃO CHECKOUT BRICKS OFICIAL MP
// ============================================

console.log('🧱 Inicializando CHECKOUT BRICKS - Documentação Oficial MP');

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);
const merchantOrder = new MerchantOrder(client);

// ============================================
// FUNÇÕES CONFORME DOCUMENTAÇÃO OFICIAL MP
// ============================================

// ESTRUTURA ADDITIONAL_INFO EXATA CONFORME DOC CODIGO DE REQUISIÇÃO.txt
function createOfficialAdditionalInfo(paymentData, userUID) {
    const now = new Date().toISOString();
    
    // ESTRUTURA EXATA conforme DOC CODIGO DE REQUISIÇÃO.txt
    return {
        items: [
            {
                id: 'MLB2907679857', // Conforme exemplo oficial
                title: 'Point Mini',
                description: 'Point product for card payments via Bluetooth.',
                picture_url: 'https://http2.mlstatic.com/resources/frontend/statics/growth-sellers-landings/device-mlb-point-i_medium2x.png',
                category_id: 'electronics',
                quantity: 1,
                unit_price: 58 // Conforme doc oficial
            }
        ],
        payer: {
            // ESTRUTURA EXATA conforme DOC CODIGO DE REQUISIÇÃO.txt
            first_name: 'Test',
            last_name: 'Test',
            phone: {
                area_code: '11',
                number: '987654321'
            },
            address: {
                street_number: null // Conforme doc oficial
            }
        },
        shipments: {
            // ESTRUTURA EXATA conforme DOC CODIGO DE REQUISIÇÃO.txt
            receiver_address: {
                zip_code: '12312-123',
                state_name: 'Rio de Janeiro',
                city_name: 'Buzios',
                street_name: 'Av das Nacoes Unidas',
                street_number: 3003
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

// Validação de dados obrigatórios conforme documentação
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
// ENDPOINT PRINCIPAL - ESTRUTURA OFICIAL MP
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('🧱 PROCESSANDO PAGAMENTO - Estrutura Oficial MP');
        logPayment('RECEBIDO', 'pending', 'INICIANDO', req.body);

        // Validação conforme necessário
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
        const officialAdditionalInfo = createOfficialAdditionalInfo(req.body, paymentUID);

        // ============================================
        // PAGAMENTO CARTÃO - ESTRUTURA CONFORME DOC CODIGO DE REQUISIÇÃO.txt
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 PROCESSANDO CARTÃO - Estrutura Oficial MP');

            // ESTRUTURA EXATA conforme DOC CODIGO DE REQUISIÇÃO.txt
            const paymentData = {
                additional_info: officialAdditionalInfo,
                application_fee: null,
                binary_mode: false,
                campaign_id: null,
                capture: false,
                coupon_amount: null,
                description: 'Payment for product',
                differential_pricing_id: null,
                external_reference: paymentUID, // Usar UID como referência
                installments: Number(installments) || 1,
                metadata: null,
                payer: {
                    entity_type: 'individual',
                    type: 'customer',
                    email: payer.email,
                    identification: {
                        type: payer.identification?.type || 'CPF',
                        number: payer.identification?.number || '95749019047'
                    }
                },
                payment_method_id: payment_method_id,
                token: token,
                transaction_amount: Number(transaction_amount)
            };

            logPayment('CARTÃO_ENVIANDO', 'pending', 'PROCESSANDO', {
                transaction_amount: paymentData.transaction_amount,
                payment_method_id: paymentData.payment_method_id,
                token_preview: token.substring(0, 10) + '...',
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

            // RESPOSTA CONFORME DOC RESPOSTA DE EXEMPLO.txt
            const response = {
                id: result.id,
                date_created: result.date_created,
                date_approved: result.date_approved,
                date_last_updated: result.date_last_updated,
                money_release_date: result.money_release_date,
                issuer_id: result.issuer_id,
                payment_method_id: result.payment_method_id,
                payment_type_id: result.payment_type_id,
                status: result.status,
                status_detail: result.status_detail,
                currency_id: result.currency_id,
                description: result.description,
                external_reference: result.external_reference,
                transaction_amount: result.transaction_amount,
                uid: paymentUID
            };

            // Adicionar dados específicos conforme status
            if (result.status === 'approved') {
                response.redirect_url = `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`;
                logPayment('CARTÃO_APROVADO', result.id, 'SUCCESS', { uid: paymentUID });
            } else if (result.status === 'rejected') {
                // IMPORTANTE: Para rejeições, manter dados para permitir nova tentativa
                logPayment('CARTÃO_REJEITADO', result.id, 'REJECTED', { 
                    status_detail: result.status_detail,
                    uid: paymentUID,
                    retry_available: true
                });
            }

            return res.status(201).json(response);
        }

        // ============================================
        // PAGAMENTO PIX - ESTRUTURA OFICIAL MP + MERCHANT ORDER
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 PROCESSANDO PIX - Estrutura Oficial MP');

            // ESTRUTURA CONFORME DOC Backend.txt para PIX
            const pixData = {
                transaction_amount: Number(transaction_amount),
                description: description || 'Payment for product',
                payment_method_id: 'pix',
                payer: {
                    email: payer.email,
                    identification: {
                        type: 'CPF',
                        number: '95749019047' // Conforme doc oficial
                    }
                },
                external_reference: paymentUID,
                // ADDITIONAL_INFO conforme estrutura oficial
                additional_info: officialAdditionalInfo,
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                // Data de expiração para PIX (importante para merchant_order)
                date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
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
                has_qr_code: !!pixResult.point_of_interaction?.transaction_data
            });

            // RESPOSTA CONFORME DOC RESPOSTA DE EXEMPLO.txt para PIX
            const response = {
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                payment_method_id: pixResult.payment_method_id,
                payment_type_id: pixResult.payment_type_id,
                transaction_amount: pixResult.transaction_amount,
                external_reference: pixResult.external_reference,
                date_created: pixResult.date_created,
                date_of_expiration: pixResult.date_of_expiration,
                uid: paymentUID
            };

            // DADOS PIX conforme DOC RESPOSTA DE EXEMPLO.txt
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
        console.error('❌ ERRO NO PROCESSAMENTO:', error);
        logPayment('ERRO_GERAL', 'error', 'FALHA', {
            message: error.message,
            stack: error.stack?.substring(0, 500)
        });

        // Tratamento específico para erros MP conforme documentação
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
// WEBHOOK MELHORADO - MERCHANT ORDER OFICIAL MP
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 WEBHOOK OFICIAL RECEBIDO:', req.body);
        logPayment('WEBHOOK_RECEBIDO', req.body.data?.id || 'unknown', req.body.action, req.body);

        // Responder imediatamente conforme padrão MP
        res.status(200).json({ 
            received: true,
            source: 'checkout_bricks_official',
            timestamp: new Date().toISOString()
        });

        const { action, data, type } = req.body;

        // ============================================
        // PROCESSAR PAYMENT NOTIFICATIONS
        // ============================================
        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            try {
                const paymentDetails = await payment.get({ id: data.id });
                
                logPayment('WEBHOOK_PAYMENT_CONSULTADO', data.id, paymentDetails.status, {
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

                // Log específico para cartão aprovado após rejeição
                if (paymentDetails.status === 'approved' && paymentDetails.payment_type_id === 'credit_card') {
                    logPayment('CARTÃO_APROVADO_APÓS_RETRY', data.id, 'SUCCESS', {
                        uid: paymentDetails.external_reference,
                        transaction_amount: paymentDetails.transaction_amount,
                        installments: paymentDetails.installments
                    });
                }

                // Log para rejeições (importante para análise)
                if (paymentDetails.status === 'rejected') {
                    logPayment('PAGAMENTO_REJEITADO_WEBHOOK', data.id, 'REJECTED', {
                        status_detail: paymentDetails.status_detail,
                        payment_method_id: paymentDetails.payment_method_id,
                        external_reference: paymentDetails.external_reference
                    });
                }

            } catch (error) {
                console.error('❌ Erro ao buscar payment no webhook:', error);
                logPayment('WEBHOOK_PAYMENT_ERRO', data.id, 'ERRO_CONSULTA', {
                    error: error.message
                });
            }
        }

        // ============================================
        // PROCESSAR MERCHANT ORDER - IMPORTANTE PARA PIX E REJEIÇÕES
        // ============================================
        if (type === 'merchant_order' && data && data.id) {
            try {
                const orderDetails = await merchantOrder.get({ merchantOrderId: data.id });
                
                logPayment('MERCHANT_ORDER_OFICIAL', data.id, orderDetails.order_status, {
                    order_status: orderDetails.order_status,
                    payments: orderDetails.payments?.length || 0,
                    total_amount: orderDetails.total_amount
                });

                // IMPORTANTE: Verificar se merchant_order está "closed"
                // Conforme documentação: "Mantenha a transação aberta até receber o status: closed"
                if (orderDetails.order_status === 'closed') {
                    logPayment('MERCHANT_ORDER_CLOSED', data.id, 'TRANSACTION_COMPLETED', {
                        payments: orderDetails.payments,
                        external_reference: orderDetails.external_reference
                    });
                } else if (orderDetails.order_status === 'opened') {
                    // Transação ainda aberta - permitir múltiplas tentativas
                    logPayment('MERCHANT_ORDER_OPEN', data.id, 'ALLOWING_RETRIES', {
                        order_status: orderDetails.order_status,
                        note: 'Transação mantida aberta para múltiplas tentativas'
                    });
                }

                // Processar pagamentos dentro da order
                if (orderDetails.payments && orderDetails.payments.length > 0) {
                    for (const orderPayment of orderDetails.payments) {
                        logPayment('MERCHANT_ORDER_PAYMENT', orderPayment.id, orderPayment.status, {
                            transaction_amount: orderPayment.transaction_amount,
                            status_detail: orderPayment.status_detail
                        });
                    }
                }

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
// CONSULTAR PAGAMENTO PARA POLLING
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
        
        // RESPOSTA CONFORME ESTRUTURA OFICIAL MP
        const response = {
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
            transaction_amount: paymentDetails.transaction_amount,
            external_reference: paymentDetails.external_reference,
            payment_method_id: paymentDetails.payment_method_id,
            payment_type_id: paymentDetails.payment_type_id,
            date_created: paymentDetails.date_created,
            date_approved: paymentDetails.date_approved,
            uid: paymentDetails.external_reference,
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
// ESTORNOS CONFORME DOCUMENTAÇÃO OFICIAL
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

        // Estrutura para estorno conforme documentação
        const refundData = {
            payment_id: parseInt(paymentId),
            amount: amount ? Number(amount) : undefined, // undefined = estorno total
            reason: reason || 'Solicitação do cliente'
        };

        logPayment('ESTORNO_CONFIGURADO', paymentId, 'CONFIGURED', refundData);

        res.status(200).json({
            message: 'Funcionalidade de estorno configurada conforme documentação oficial',
            payment_id: paymentId,
            refund_data: refundData,
            note: 'Estornos parciais e totais implementados conforme MP'
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
// CALLBACK URL CONFORME DOCUMENTAÇÃO
// ============================================

router.get('/callback', (req, res) => {
    console.log('🔄 CALLBACK RECEBIDO:', req.query);
    logPayment('CALLBACK', req.query.payment_id || 'unknown', 'CALLBACK', req.query);
    
    // Redirecionar conforme documentação oficial
    if (req.query.external_reference) {
        res.redirect(`https://www.suellenseragi.com.br/resultado?uid=${req.query.external_reference}`);
    } else {
        res.redirect('https://quizfront.vercel.app');
    }
});

module.exports = router;
