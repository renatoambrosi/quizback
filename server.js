// server.js - Versão Simplificada para Railway
const express = require('express');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const port = process.env.PORT || 3000;

// CORS super permissivo
app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.sendStatus(200);
    } else {
        next();
    }
});

// Parse JSON
app.use(express.json());

// Configurar Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: 'TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182'
});

const payment = new Payment(client);

// UUID simples
function generateUUID() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

// Teste básico
app.get('/', (req, res) => {
    res.json({ 
        message: 'QuizBack funcionando!',
        timestamp: new Date().toISOString(),
        status: 'OK'
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ status: 'OK' });
});

// Processar pagamentos
app.post('/process_payment', async (req, res) => {
    try {
        console.log('Recebido:', req.body);

        const {
            transaction_amount,
            token,
            payment_method_id,
            installments,
            issuer_id,
            payer,
            uid
        } = req.body;

        // Validação básica
        if (!transaction_amount || !payer?.email) {
            return res.status(400).json({
                error: 'Dados obrigatórios: transaction_amount e payer.email'
            });
        }

        // Dados do pagamento
        const paymentData = {
            transaction_amount: Number(transaction_amount),
            description: 'Quiz Personalizado',
            installments: Number(installments) || 1,
            payer: {
                email: payer.email,
                first_name: payer.first_name || '',
                last_name: payer.last_name || '',
                identification: {
                    type: payer.identification?.type || 'CPF',
                    number: payer.identification?.number || ''
                }
            },
            external_reference: uid || generateUUID()
        };

        // Adicionar dados específicos por método
        if (payment_method_id === 'pix') {
            paymentData.payment_method_id = 'pix';
        } else if (token && payment_method_id) {
            paymentData.token = token;
            paymentData.payment_method_id = payment_method_id;
            if (issuer_id) paymentData.issuer_id = issuer_id;
        } else {
            return res.status(400).json({
                error: 'Método de pagamento inválido'
            });
        }

        console.log('Enviando para MP:', paymentData);

        // Criar pagamento
        const result = await payment.create({
            body: paymentData,
            requestOptions: { 
                idempotencyKey: generateUUID() 
            }
        });

        console.log('Resposta MP:', result.status, result.id);

        // Resposta
        const response = {
            id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            payment_method_id: result.payment_method_id,
            transaction_amount: result.transaction_amount,
            external_reference: result.external_reference
        };

        // Dados PIX
        if (result.point_of_interaction?.transaction_data) {
            response.pix_data = result.point_of_interaction.transaction_data;
        }

        res.status(201).json(response);

    } catch (error) {
        console.error('Erro:', error);
        res.status(500).json({
            error: 'Erro ao processar pagamento',
            message: error.message
        });
    }
});

// Status do pagamento
app.get('/payment_status/:id', async (req, res) => {
    try {
        const result = await payment.get({ id: req.params.id });
        res.json({
            id: result.id,
            status: result.status,
            status_detail: result.status_detail
        });
    } catch (error) {
        res.status(404).json({ error: 'Pagamento não encontrado' });
    }
});

// Webhook
app.post('/webhook', (req, res) => {
    console.log('Webhook:', req.body);
    res.status(200).send('OK');
});

// 404
app.use('*', (req, res) => {
    res.status(404).json({ error: 'Endpoint não encontrado' });
});

// Iniciar servidor
app.listen(port, '0.0.0.0', () => {
    console.log(`QuizBack rodando na porta ${port}`);
});

module.exports = app;
