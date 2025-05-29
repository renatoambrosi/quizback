// server.js - QuizBack Backend
const express = require('express');
const cors = require('cors');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: [
        'https://quizfront.vercel.app',
        'http://localhost:3000',
        'http://localhost:5173'
    ],
    credentials: true
}));
app.use(express.json());

// Log de todas as requisições
app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
        console.log('Body:', JSON.stringify(req.body, null, 2));
    }
    next();
});

// Configurar Mercado Pago
const client = new MercadoPagoConfig({ 
    accessToken: 'TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182'
});

const payment = new Payment(client);

// Função para gerar UUID
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c == 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

// Endpoint principal - teste
app.get('/', (req, res) => {
    res.json({ 
        message: '🚀 QuizBack API funcionando!',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        endpoints: {
            'POST /process_payment': 'Processar pagamentos',
            'GET /payment_status/:id': 'Consultar status do pagamento',
            'POST /webhook': 'Receber notificações do Mercado Pago',
            'GET /health': 'Health check do servidor'
        },
        frontend_url: 'https://quizfront.vercel.app',
        cors_enabled: true
    });
});

// Health check
app.get('/health', (req, res) => {
    res.json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
});

// Processar pagamentos
app.post('/process_payment', async (req, res) => {
    try {
        console.log('\n=== INICIANDO PROCESSAMENTO DE PAGAMENTO ===');
        console.log('Timestamp:', new Date().toISOString());
        console.log('Dados recebidos:', JSON.stringify(req.body, null, 2));

        // Extrair dados do request
        const {
            transaction_amount,
            token,
            description,
            installments,
            payment_method_id,
            issuer_id,
            payer,
            uid,
            external_reference
        } = req.body;

        // Validações obrigatórias
        if (!transaction_amount) {
            return res.status(400).json({
                error: 'transaction_amount é obrigatório',
                received: transaction_amount
            });
        }

        if (!payer?.email) {
            return res.status(400).json({
                error: 'payer.email é obrigatório',
                received: payer
            });
        }

        // Montar dados base do pagamento
        const paymentData = {
            transaction_amount: Number(transaction_amount),
            description: description || 'Pagamento Quiz Personalizado',
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
            external_reference: external_reference || uid || `quiz_${Date.now()}`,
            notification_url: 'https://quizback-production-98f5.up.railway.app/webhook',
            additional_info: {
                items: [{
                    id: 'QUIZ-001',
                    title: 'Quiz Personalizado - Suellen Seragi',
                    description: 'Resultado personalizado baseado no quiz',
                    quantity: 1,
                    unit_price: Number(transaction_amount),
                    category_id: 'services'
                }],
                payer: {
                    first_name: payer.first_name || '',
                    last_name: payer.last_name || '',
                    phone: {
                        area_code: payer.phone?.area_code || '',
                        number: payer.phone?.number || ''
                    }
                }
            }
        };

        // Adicionar dados específicos por método de pagamento
        if (payment_method_id === 'pix') {
            console.log('Processando pagamento PIX');
            paymentData.payment_method_id = 'pix';
        } else if (payment_method_id && payment_method_id.includes('bol')) {
            console.log('Processando pagamento Boleto');
            paymentData.payment_method_id = payment_method_id;
        } else if (token && payment_method_id) {
            console.log('Processando pagamento com Cartão');
            paymentData.token = token;
            paymentData.payment_method_id = payment_method_id;
            if (issuer_id) paymentData.issuer_id = issuer_id;
        } else {
            return res.status(400).json({
                error: 'Método de pagamento inválido',
                received: { payment_method_id, token: !!token }
            });
        }

        console.log('Dados finais para Mercado Pago:');
        console.log(JSON.stringify(paymentData, null, 2));

        // Criar pagamento no Mercado Pago
        const result = await payment.create({
            body: paymentData,
            requestOptions: { 
                idempotencyKey: generateUUID() 
            }
        });

        console.log('Resposta do Mercado Pago:');
        console.log(JSON.stringify(result, null, 2));

        // Preparar resposta padronizada
        const response = {
            id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            payment_method_id: result.payment_method_id,
            payment_type_id: result.payment_type_id,
            transaction_amount: result.transaction_amount,
            external_reference: result.external_reference,
            date_created: result.date_created,
            date_approved: result.date_approved
        };

        // Adicionar dados específicos para PIX
        if (result.point_of_interaction?.transaction_data) {
            response.pix_data = {
                qr_code: result.point_of_interaction.transaction_data.qr_code,
                qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
                ticket_url: result.point_of_interaction.transaction_data.ticket_url
            };
        }

        // Adicionar dados para boleto
        if (result.transaction_details?.external_resource_url) {
            response.boleto_url = result.transaction_details.external_resource_url;
        }

        console.log('=== PAGAMENTO CRIADO COM SUCESSO ===');
        console.log('Payment ID:', result.id);
        console.log('Status:', result.status);
        console.log('==========================================\n');

        res.status(201).json(response);

    } catch (error) {
        console.error('\n=== ERRO NO PROCESSAMENTO ===');
        console.error('Timestamp:', new Date().toISOString());
        console.error('Erro completo:', error);
        
        if (error.cause && error.cause.length > 0) {
            const apiError = error.cause[0];
            console.error('Erro específico da API:', apiError);
            
            res.status(400).json({
                error: 'Erro do Mercado Pago',
                message: apiError.description || error.message,
                code: apiError.code,
                details: apiError
            });
        } else {
            console.error('Stack trace:', error.stack);
            res.status(500).json({
                error: 'Erro interno do servidor',
                message: error.message
            });
        }
        console.error('===============================\n');
    }
});

// Consultar status do pagamento
app.get('/payment_status/:paymentId', async (req, res) => {
    try {
        const { paymentId } = req.params;
        
        console.log(`Consultando status do pagamento: ${paymentId}`);
        
        const result = await payment.get({ id: paymentId });
        
        const response = {
            id: result.id,
            status: result.status,
            status_detail: result.status_detail,
            payment_method_id: result.payment_method_id,
            transaction_amount: result.transaction_amount,
            date_approved: result.date_approved,
            date_created: result.date_created,
            external_reference: result.external_reference
        };

        console.log(`Status encontrado: ${result.status}`);
        res.json(response);
        
    } catch (error) {
        console.error('Erro ao consultar status:', error);
        res.status(404).json({
            error: 'Pagamento não encontrado',
            message: error.message,
            payment_id: req.params.paymentId
        });
    }
});

// Webhook para notificações do Mercado Pago
app.post('/webhook', (req, res) => {
    console.log('\n=== WEBHOOK RECEBIDO ===');
    console.log('Timestamp:', new Date().toISOString());
    console.log('Headers:', req.headers);
    console.log('Body:', JSON.stringify(req.body, null, 2));
    
    const { type, data } = req.body;
    
    if (type === 'payment') {
        console.log(`Notificação de pagamento recebida: ${data.id}`);
        
        // Aqui você pode:
        // 1. Consultar o status atual do pagamento
        // 2. Atualizar seu banco de dados
        // 3. Enviar emails de confirmação
        // 4. Disparar outras ações
        
        // Exemplo de como consultar o pagamento:
        // payment.get({ id: data.id })
        //   .then(result => {
        //     console.log('Status atualizado:', result.status);
        //   })
        //   .catch(console.error);
    }
    
    console.log('=========================\n');
    
    // Sempre responder 200 OK para o Mercado Pago
    res.status(200).send('OK');
});

// Middleware de tratamento de erros
app.use((error, req, res, next) => {
    console.error('Erro não tratado:', error);
    res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message,
        timestamp: new Date().toISOString()
    });
});

// Middleware para rotas não encontradas
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Endpoint não encontrado',
        path: req.originalUrl,
        method: req.method,
        available_endpoints: [
            'GET /',
            'GET /health',
            'POST /process_payment',
            'GET /payment_status/:id',
            'POST /webhook'
        ]
    });
});

// Iniciar servidor
app.listen(port, () => {
    console.log('=================================');
    console.log('🚀 QuizBack API iniciada!');
    console.log(`📡 Porta: ${port}`);
    console.log(`🌐 URL: https://quizback-production-98f5.up.railway.app`);
    console.log(`🎯 Frontend: https://quizfront.vercel.app`);
    console.log(`⏰ Iniciado em: ${new Date().toISOString()}`);
    console.log('=================================\n');
});

module.exports = app;
