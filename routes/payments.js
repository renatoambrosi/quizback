const express = require('express');
const { MercadoPagoConfig, Payment } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// ============================================
// CONFIGURAÇÃO ESPECÍFICA PARA CHECKOUT BRICKS
// ============================================

console.log('🧱 Inicializando para CHECKOUT BRICKS');

// Configuração específica para Bricks (conforme documentação)
const client = new MercadoPagoConfig({
    accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
    options: {
        timeout: 5000
    }
});

const payment = new Payment(client);

// ============================================
// ENDPOINT ESPECÍFICO PARA BRICKS
// ============================================

router.post('/process_payment', async (req, res) => {
    try {
        console.log('🧱 Processando pagamento via CHECKOUT BRICKS');
        console.log('📥 Dados recebidos do Brick:', req.body);

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

        // Validações específicas para Bricks
        if (!payer || !payer.email) {
            return res.status(400).json({
                error: 'Dados do pagador inválidos',
                message: 'Email do pagador é obrigatório para Checkout Bricks'
            });
        }

        const paymentUID = uid || uuidv4();

        // ============================================
        // PAGAMENTO CARTÃO VIA BRICKS
        // ============================================

        if (payment_method_id && token) {
            console.log('💳 Processando cartão via CHECKOUT BRICKS');

            // Estrutura específica para Bricks (conforme documentação)
            const paymentData = {
                transaction_amount: Number(transaction_amount),
                token: token,
                description: description || 'Teste de Prosperidade',
                installments: Number(installments) || 1,
                payment_method_id: payment_method_id,
                issuer_id: Number(issuer_id),
                payer: {
                    email: payer.email,
                    identification: {
                        type: payer.identification?.type || 'CPF',
                        number: payer.identification?.number || '12345678909'
                    }
                },
                external_reference: paymentUID,
                // Dados específicos para Bricks
                additional_info: {
                    items: [
                        {
                            id: 'teste-prosperidade',
                            title: 'Teste de Prosperidade',
                            description: 'Resultado personalizado do teste',
                            quantity: 1,
                            unit_price: Number(transaction_amount)
                        }
                    ],
                    payer: {
                        first_name: payer.firstName || 'Nome',
                        last_name: payer.lastName || 'Sobrenome'
                    }
                },
                notification_url: `${process.env.BASE_URL}/api/webhook`,
                statement_descriptor: 'TESTE PROSPERIDADE'
            };

            console.log('📤 Enviando para Mercado Pago (BRICKS):', {
                transaction_amount: paymentData.transaction_amount,
                payment_method_id: paymentData.payment_method_id,
                token_preview: token.substring(0, 10) + '...',
                issuer_id: paymentData.issuer_id,
                external_reference: paymentUID
            });

            // Criar pagamento via Bricks API
            const result = await payment.create({
                body: paymentData,
                requestOptions: {
                    idempotencyKey: uuidv4()
                }
            });

            console.log('✅ Resposta Mercado Pago (BRICKS):', {
                id: result.id,
                status: result.status,
                status_detail: result.status_detail
            });

            const response = {
                id: result.id,
                status: result.status,
                status_detail: result.status_detail,
                payment_method_id: result.payment_method_id,
                transaction_amount: result.transaction_amount,
                uid: paymentUID
            };

            if (result.status === 'approved') {
                response.redirect_url = `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`;
            }

            return res.status(201).json(response);
        }

        // ============================================
        // PAGAMENTO PIX VIA BRICKS
        // ============================================

        if (payment_method_id === 'pix') {
            console.log('🟢 Processando PIX via CHECKOUT BRICKS');

            const pixData = {
                transaction_amount: Number(transaction_amount),
                description: description || 'Teste de Prosperidade',
                payment_method_id: 'pix',
                payer: {
                    email: payer.email,
                    identification: {
                        type: 'CPF',
                        number: '12345678909'
                    }
                },
                external_reference: paymentUID,
                notification_url: `${process.env.BASE_URL}/api/webhook`
            };

            const pixResult = await payment.create({
                body: pixData,
                requestOptions: {
                    idempotencyKey: uuidv4()
                }
            });

            console.log('✅ PIX criado via BRICKS:', pixResult.id);

            return res.status(201).json({
                id: pixResult.id,
                status: pixResult.status,
                status_detail: pixResult.status_detail,
                payment_method_id: pixResult.payment_method_id,
                transaction_amount: pixResult.transaction_amount,
                uid: paymentUID,
                qr_code: pixResult.point_of_interaction?.transaction_data?.qr_code,
                qr_code_base64: pixResult.point_of_interaction?.transaction_data?.qr_code_base64,
                ticket_url: pixResult.point_of_interaction?.transaction_data?.ticket_url
            });
        }

        return res.status(400).json({
            error: 'Método de pagamento não suportado por Checkout Bricks'
        });

    } catch (error) {
        console.error('❌ Erro no CHECKOUT BRICKS:', error);

        // Tratamento específico para erros de Bricks
        if (error.cause && error.cause.length > 0) {
            const mpError = error.cause[0];
            
            console.error('🧱 Erro específico do Bricks:', {
                code: mpError.code,
                description: mpError.description
            });

            return res.status(400).json({
                error: 'Erro do Checkout Bricks',
                message: mpError.description || mpError.message,
                code: mpError.code
            });
        }

        return res.status(500).json({
            error: 'Erro interno no Checkout Bricks',
            message: error.message
        });
    }
});

// ============================================
// WEBHOOK PARA BRICKS
// ============================================

router.post('/webhook', async (req, res) => {
    try {
        console.log('🔔 Webhook recebido (CHECKOUT BRICKS):', req.body);

        // Responder imediatamente
        res.status(200).json({ 
            received: true,
            source: 'checkout_bricks'
        });

        const { action, data } = req.body;

        if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
            try {
                const paymentDetails = await payment.get({ id: data.id });
                
                console.log(`🧱 Status pagamento Bricks ${data.id}:`, {
                    status: paymentDetails.status,
                    uid: paymentDetails.external_reference
                });

                if (paymentDetails.status === 'approved') {
                    console.log(`✅ BRICKS: Pagamento aprovado! UID: ${paymentDetails.external_reference}`);
                }

            } catch (error) {
                console.error('❌ Erro ao buscar detalhes do pagamento Bricks:', error);
            }
        }

    } catch (error) {
        console.error('❌ Erro no webhook Bricks:', error);
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
        const paymentDetails = await payment.get({ id: req.params.id });
        
        res.status(200).json({
            id: paymentDetails.id,
            status: paymentDetails.status,
            status_detail: paymentDetails.status_detail,
            transaction_amount: paymentDetails.transaction_amount,
            uid: paymentDetails.external_reference,
            payment_method_id: paymentDetails.payment_method_id,
            source: 'checkout_bricks'
        });

    } catch (error) {
        console.error('❌ Erro ao consultar pagamento Bricks:', error);
        res.status(404).json({
            error: 'Pagamento não encontrado'
        });
    }
});

module.exports = router;
