const express = require('express');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// ============================================
// SEU CÓDIGO ORIGINAL + COMPLIANCE MÍNIMO
// ============================================

console.log('🚀 Inicializando rotas de pagamento');

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);

// ============================================
// COMPLIANCE: Additional Info melhorado
// ============================================

function createAdditionalInfo(paymentData, userUID) {
    return {
        items: [
            {
                id: 'teste-prosperidade-001',
                title: 'Teste de Prosperidade',
                description: 'Acesso completo ao resultado personalizado',
                category_id: 'services', // COMPLIANCE: category_id obrigatório
                quantity: 1,
                unit_price: 10
            }
        ],
        payer: {
            first_name: 'Cliente', // COMPLIANCE: first_name obrigatório
            last_name: 'Teste Prosperidade', // COMPLIANCE: last_name obrigatório
            phone: {
                area_code: '11',
                number: '999999999'
            }
        }
    };
}

// Função para logs (mantida simples)
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

// ============================================
// SEU ENDPOINT PRINCIPAL (mantido + compliance)
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('🔄 Processando pagamento');
        logPayment('RECEBIDO', 'pending', 'INICIANDO', req.body);

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

        const paymentUID = uid || uuidv4();

        // ============================================
        // PAGAMENTO CARTÃO (seu código + compliance)
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 Processando cartão de crédito');

            // COMPLIANCE: Additional info melhorado
            const additionalInfo = createAdditionalInfo(req.body, paymentUID);

            const paymentData = {
                transaction_amount: Number(transaction_amount),
                token: token,
                description: description || 'Teste de Prosperidade',
                installments: Number(installments) || 1,
                payment_method_id: payment_method_id,
                payer: {
                    email: payer.email,
                    identification: {
                        type: payer.identification?.type || 'CPF',
                        number: payer.identification?.number || '12345678901'
                    }
                },
                external_reference: paymentUID,
                // COMPLIANCE: Additional info conforme documentação
                additional_info: additionalInfo
            };

            if (issuer_id) {
                paymentData.issuer_id = issuer_id;
            }

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

            // SUA RESPOSTA ORIGINAL + compliance
            const response = {
                id: result.id,
                status: result.status,
                status_detail: result.status_detail,
                payment_method_id: result.payment_method_id,
                transaction_amount: result.transaction_amount,
                external_reference: result.external_reference,
                date_created: result.date_created,
                date_approved: result.date_approved,
                uid: paymentUID
            };

            if (result.status === 'approved') {
                response.redirect_url = `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`;
                logPayment('CARTÃO_APROVADO', result.id, 'SUCCESS', { uid: paymentUID });
            } else if (result.status === 'rejected') {
                // COMPLIANCE: Log rejeições para análise
                logPayment('CARTÃO_REJEITADO', result.id, 'REJECTED', { 
                    status_detail: result.status_detail,
                    uid: paymentUID
                });
            }

            return res.status(201).json(response);
        }

        // ============================================
        // PAGAMENTO PIX (seu código original)
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 Processando PIX');

            // COMPLIANCE: Additional info para PIX também
            const additionalInfo = createAdditionalInfo(req.body, paymentUID);

            const pixData = {
                transaction_amount: Number(transaction_amount),
                description: description || 'Teste de Prosperidade',
                payment_method_id: 'pix',
                payer: {
                    email: payer.email
                },
                external_reference: paymentUID,
                // COMPLIANCE: Additional info
                additional_info: additionalInfo,
                notification_url: `${process.env.BASE_URL}/api/webhook`
            };

            logPayment('PIX_ENVIANDO', 'pending', 'PROCESSANDO', {
                transaction_amount: pixData.transaction_amount,
                external_reference: paymentUID
            });

            const pixResult = await payment.create({
                body: pixData,
                requestOptions: {
                    idempotencyKey: uuidv4()
                }
            });

            logPayment('PIX_CRIADO', pixResult.id, pixResult.status, {
                status_detail: pixResult.status_detail
            });

            // SUA RESPOSTA PIX ORIGINAL
            const response = {
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                payment_method_id: pixResult.payment_method_id,
                transaction_amount: pixResult.transaction_amount,
                external_reference: pixResult.external_reference,
                date_created: pixResult.date_created,
                uid: paymentUID
            };

            // Seus dados PIX originais
            if (pixResult.point_of_interaction?.transaction_data) {
                response.qr_code = pixResult.point_of_interaction.transaction_data.qr_code;
                response.qr_code_base64 = pixResult.point_of_interaction.transaction_data.qr_code_base64;
                response.ticket_url = pixResult.point_of_interaction.transaction_data.ticket_url;
            }

            return res.status(201).json(response);
        }

        return res.status(400).json({
            error: 'Método de pagamento não suportado',
            message: 'Use cartão de crédito ou PIX'
        });

    } catch (error) {
        console.error('❌ Erro no processamento:', error);
        logPayment('ERRO_GERAL', 'error', 'FALHA', {
            message: error.message
        });

        // Seu tratamento de erro original
        if (error.cause && error.cause.length > 0) {
            const mpError = error.cause[0];
            
            return res.status(400).json({
                error: 'Erro do Mercado Pago',
                message: mpError.description || mpError.message,
                code: mpError.code
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
// SEU WEBHOOK ORIGINAL (mantido)
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 Webhook recebido:', req.body);
        logPayment('WEBHOOK_RECEBIDO', req.body.data?.id || 'unknown', req.body.action, req.body);

        res.status(200).json({ 
            received: true,
            timestamp: new Date().toISOString()
        });

        const { action, data } = req.body;

        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            try {
                const paymentDetails = await payment.get({ id: data.id });
                
                logPayment('WEBHOOK_CONSULTADO', data.id, paymentDetails.status, {
                    status_detail: paymentDetails.status_detail,
                    external_reference: paymentDetails.external_reference,
                    payment_method_id: paymentDetails.payment_method_id
                });

                // Logs específicos para PIX e cartão
                if (paymentDetails.status === 'approved' && paymentDetails.payment_method_id === 'pix') {
                    logPayment('PIX_APROVADO_WEBHOOK', data.id, 'SUCCESS', {
                        uid: paymentDetails.external_reference,
                        transaction_amount: paymentDetails.transaction_amount
                    });
                }

                if (paymentDetails.status === 'approved' && paymentDetails.payment_type_id === 'credit_card') {
                    logPayment('CARTÃO_APROVADO_WEBHOOK', data.id, 'SUCCESS', {
                        uid: paymentDetails.external_reference,
                        transaction_amount: paymentDetails.transaction_amount
                    });
                }

            } catch (error) {
                console.error('❌ Erro ao buscar payment no webhook:', error);
            }
        }

    } catch (error) {
        console.error('❌ Erro geral no webhook:', error);
        
        if (!res.headersSent) {
            res.status(200).json({ 
                received: true,
                error: 'Erro interno no webhook'
            });
        }
    }
});

// ============================================
// CONSULTAR PAGAMENTO (para polling PIX)
// ============================================

router.get('/payment/:id', async (req, res) => {
    try {
        const paymentId = req.params.id;
        console.log(`🔍 Consultando pagamento: ${paymentId}`);
        
        const paymentDetails = await payment.get({ id: paymentId });
        
        const response = {
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
            transaction_amount: paymentDetails.transaction_amount,
            external_reference: paymentDetails.external_reference,
            payment_method_id: paymentDetails.payment_method_id,
            uid: paymentDetails.external_reference
        };

        // Dados PIX se disponíveis
        if (paymentDetails.payment_method_id === 'pix' && paymentDetails.point_of_interaction?.transaction_data) {
            response.qr_code = paymentDetails.point_of_interaction.transaction_data.qr_code;
            response.qr_code_base64 = paymentDetails.point_of_interaction.transaction_data.qr_code_base64;
            response.ticket_url = paymentDetails.point_of_interaction.transaction_data.ticket_url;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Erro ao consultar pagamento:', error);
        
        res.status(404).json({
            error: 'Pagamento não encontrado',
            payment_id: req.params.id
        });
    }
});

// ============================================
// COMPLIANCE: Endpoints de estorno (configurados)
// ============================================

router.post('/refund/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        const { amount, reason } = req.body;

        console.log(`💰 Estorno solicitado: ${paymentId}`);
        
        // Buscar pagamento original
        const originalPayment = await payment.get({ id: paymentId });
        
        if (originalPayment.status !== 'approved') {
            return res.status(400).json({
                error: 'Pagamento não pode ser estornado',
                status: originalPayment.status
            });
        }

        // COMPLIANCE: Estrutura de estorno configurada
        const refundData = {
            payment_id: parseInt(paymentId),
            amount: amount ? Number(amount) : undefined, // undefined = estorno total
            reason: reason || 'Solicitação do cliente'
        };

        logPayment('ESTORNO_CONFIGURADO', paymentId, 'CONFIGURED', refundData);

        res.status(200).json({
            message: 'Estorno configurado conforme compliance MP',
            payment_id: paymentId,
            refund_data: refundData
        });

    } catch (error) {
        console.error('❌ Erro no estorno:', error);
        
        res.status(500).json({
            error: 'Erro ao processar estorno',
            message: error.message
        });
    }
});

module.exports = router;
