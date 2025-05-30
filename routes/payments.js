const express = require('express');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// ============================================
// CONFIGURAÇÃO SIMPLES - PRODUÇÃO
// ============================================

const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN
});

const payment = new Payment(client);
const preference = new Preference(client);

// ============================================
// PROCESSAR PAGAMENTOS
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('💳 Processando pagamento:', req.body);

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

        // Validações básicas
        if (!transaction_amount || transaction_amount <= 0) {
            return res.status(400).json({
                error: 'Valor inválido',
                message: 'O valor do pagamento deve ser maior que zero'
            });
        }

        if (!payer || !payer.email) {
            return res.status(400).json({
                error: 'Dados do pagador inválidos',
                message: 'Email do pagador é obrigatório'
            });
        }

        // UID para rastreamento
        const paymentUID = uid || uuidv4();
        const idempotencyKey = uuidv4();

        // ============================================
        // PAGAMENTO PIX
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 Processando pagamento PIX');

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
                    teste_prosperidade: true
                }
            };

            const pixResult = await payment.create({
                body: pixPaymentData,
                requestOptions: { idempotencyKey }
            });

            console.log('✅ PIX criado:', pixResult.id);

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
            console.log('💳 Processando pagamento com cartão');

            if (!token) {
                return res.status(400).json({
                    error: 'Token inválido',
                    message: 'Token do cartão é obrigatório'
                });
            }

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
                    teste_prosperidade: true
                }
            };

            console.log('📤 Enviando pagamento para Mercado Pago');

            const cardResult = await payment.create({
                body: cardPaymentData,
                requestOptions: { idempotencyKey }
            });

            console.log('✅ Pagamento cartão criado:', cardResult.id, cardResult.status);

            // Resposta baseada no status
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
            }

            return res.status(201).json(response);
        }

        // Método de pagamento não suportado
        return res.status(400).json({
            error: 'Método de pagamento não suportado',
            message: 'Apenas cartão de crédito e PIX são aceitos'
        });

    } catch (error) {
        console.error('❌ Erro ao processar pagamento:', error);

        // Erros específicos do Mercado Pago
        if (error.cause && error.cause.length > 0) {
            const mpError = error.cause[0];
            console.error('🔍 Erro Mercado Pago:', mpError);
            
            return res.status(400).json({
                error: 'Erro do Mercado Pago',
                message: mpError.description || mpError.message,
                code: mpError.code
            });
        }

        return res.status(500).json({
            error: 'Erro interno',
            message: 'Não foi possível processar o pagamento'
        });
    }
});

// ============================================
// WEBHOOK
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 Webhook recebido:', req.body);

        // Responder imediatamente
        res.status(200).json({ 
            received: true,
            timestamp: new Date().toISOString()
        });

        const { action, data } = req.body;

        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            const paymentId = data.id;
            
            try {
                const paymentDetails = await payment.get({ id: paymentId });
                
                console.log(`📊 Status do pagamento ${paymentId}:`, {
                    status: paymentDetails.status,
                    uid: paymentDetails.external_reference,
                    amount: paymentDetails.transaction_amount
                });
                
                if (paymentDetails.status === 'approved') {
                    const uid = paymentDetails.external_reference;
                    console.log(`✅ PAGAMENTO APROVADO! UID: ${uid}`);
                }

            } catch (error) {
                console.error('❌ Erro ao buscar detalhes do pagamento:', error);
            }
        }

    } catch (error) {
        console.error('❌ Erro no webhook:', error);
        
        if (!res.headersSent) {
            res.status(200).json({ received: true });
        }
    }
});

// ============================================
// CONSULTAR PAGAMENTO
// ============================================

router.get('/payment/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const paymentDetails = await payment.get({ id });
        
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
        console.error('❌ Erro ao consultar pagamento:', error);
        res.status(404).json({
            error: 'Pagamento não encontrado'
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
                failure: `https://quizfront.vercel.app`,
                pending: `https://quizfront.vercel.app`
            },
            auto_return: 'approved',
            external_reference: paymentUID,
            notification_url: `${process.env.BASE_URL}/api/webhook`,
            statement_descriptor: 'TESTE PROSPERIDADE',
            metadata: {
                uid: paymentUID,
                teste_prosperidade: true
            }
        };

        const result = await preference.create({ body: preferenceData });

        res.status(201).json({
            id: result.id,
            init_point: result.init_point,
            uid: paymentUID
        });

    } catch (error) {
        console.error('❌ Erro ao criar preferência:', error);
        res.status(500).json({
            error: 'Erro ao criar preferência',
            message: error.message
        });
    }
});

module.exports = router;
