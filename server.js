const express = require('express');
const cors = require('cors');
require('dotenv').config();

// ============================================
// CONFIGURAÇÃO OFICIAL CHECKOUT BRICKS MP
// ============================================

console.log('🚀 Iniciando Servidor - Checkout Bricks Oficial MP');
console.log('📋 Documentação: Oficial Mercado Pago Checkout Bricks');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARES BÁSICOS (SEM DEPENDÊNCIAS EXTRAS)
// ============================================

// CORS configurado para Checkout Bricks
app.use(cors({
    origin: [
        'https://quizfront.vercel.app',
        'https://www.suellenseragi.com.br',
        'http://localhost:3000',
        'http://localhost:5173',
        'http://127.0.0.1:5500'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type', 
        'Authorization', 
        'X-Idempotency-Key',
        'X-Requested-With'
    ],
    credentials: true
}));

// Middlewares básicos
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Middleware de log estruturado para debugging
app.use((req, res, next) => {
    const timestamp = new Date().toISOString();
    console.log(`
🌐 ================================
📅 ${timestamp}
🔍 ${req.method} ${req.path}
🌍 IP: ${req.ip || req.connection.remoteAddress}
📋 User-Agent: ${req.get('User-Agent')?.substring(0, 100)}
🌐 ================================
    `);
    next();
});

// ============================================
// VALIDAÇÃO DE VARIÁVEIS AMBIENTE
// ============================================

function validateEnvironment() {
    const required = [
        'MERCADOPAGO_ACCESS_TOKEN',
        'BASE_URL'
    ];
    
    const missing = required.filter(env => !process.env[env]);
    
    if (missing.length > 0) {
        console.error('❌ ERRO: Variáveis de ambiente obrigatórias não encontradas:');
        missing.forEach(env => console.error(`   - ${env}`));
        console.error('🔧 Configure essas variáveis no Railway/Vercel');
        process.exit(1);
    }
    
    console.log('✅ Variáveis de ambiente validadas');
    console.log('🔑 Access Token:', process.env.MERCADOPAGO_ACCESS_TOKEN?.substring(0, 20) + '...');
    console.log('🌐 Base URL:', process.env.BASE_URL);
}

validateEnvironment();

// ============================================
// IMPORTAR ROTAS OFICIAL MP
// ============================================

const paymentsRouter = require('./routes/payments');

// ============================================
// ROTAS PRINCIPAIS
// ============================================

// Health check simples
app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'OK',
        service: 'Checkout Bricks - Mercado Pago',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: '2.0-oficial-mp-simplificado'
    });
});

// Status detalhado do sistema
app.get('/status', (req, res) => {
    const memoryUsage = process.memoryUsage();
    
    res.status(200).json({
        status: 'OK',
        service: 'Checkout Bricks Oficial MP',
        version: '2.0-oficial-mp-simplificado',
        environment: process.env.NODE_ENV || 'development',
        timestamp: new Date().toISOString(),
        uptime: Math.floor(process.uptime()),
        memory: {
            used: Math.round(memoryUsage.heapUsed / 1024 / 1024) + ' MB',
            total: Math.round(memoryUsage.heapTotal / 1024 / 1024) + ' MB'
        },
        config: {
            port: PORT,
            base_url: process.env.BASE_URL,
            has_access_token: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
            cors_origins: [
                'https://quizfront.vercel.app',
                'https://www.suellenseragi.com.br'
            ]
        }
    });
});

// Conectividade com Mercado Pago
app.get('/api/mp-health', async (req, res) => {
    try {
        const { MercadoPagoConfig } = require('mercadopago');
        const client = new MercadoPagoConfig({
            accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
            options: { timeout: 5000 }
        });
        
        res.status(200).json({
            mercadopago_connection: 'OK',
            sdk_version: 'latest',
            checkout_bricks: 'enabled',
            timestamp: new Date().toISOString()
        });
        
    } catch (error) {
        console.error('❌ Erro conexão MP:', error);
        res.status(500).json({
            mercadopago_connection: 'ERROR',
            error: error.message,
            timestamp: new Date().toISOString()
        });
    }
});

// Informações do ambiente
app.get('/api/environment', (req, res) => {
    res.status(200).json({
        environment: process.env.NODE_ENV || 'development',
        base_url: process.env.BASE_URL,
        webhook_url: `${process.env.BASE_URL}/api/webhook`,
        has_credentials: {
            access_token: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
            public_key: !!process.env.MERCADOPAGO_PUBLIC_KEY,
            webhook_secret: !!process.env.MERCADOPAGO_WEBHOOK_SECRET
        },
        cors_configured: true,
        simplified_version: true,
        timestamp: new Date().toISOString()
    });
});

// ============================================
// APLICAR ROTAS PAGAMENTO (SEM RATE LIMITING)
// ============================================

// Rotas de pagamento oficial MP
app.use('/api', paymentsRouter);

// ============================================
// ROTA RAIZ
// ============================================

app.get('/', (req, res) => {
    res.status(200).json({
        message: 'Backend Checkout Bricks - Mercado Pago Oficial',
        version: '2.0-oficial-mp-simplificado',
        documentation: 'Baseado na documentação oficial MP',
        status: 'active',
        endpoints: {
            health: '/health',
            status: '/status',
            payment: '/api/process_payment',
            webhook: '/api/webhook',
            refund: '/api/refund/:paymentId',
            consultation: '/api/payment/:id'
        },
        frontend_url: 'https://quizfront.vercel.app',
        result_url: 'https://www.suellenseragi.com.br',
        timestamp: new Date().toISOString()
    });
});

// ============================================
// MIDDLEWARE DE ERRO GLOBAL
// ============================================

app.use((error, req, res, next) => {
    const timestamp = new Date().toISOString();
    
    console.error(`
❌ ================================
📅 ${timestamp}
🚨 ERRO GLOBAL CAPTURADO
🔍 Rota: ${req.method} ${req.path}
🌍 IP: ${req.ip}
📋 Erro: ${error.message}
📊 Stack: ${error.stack?.substring(0, 500)}
❌ ================================
    `);

    // Não expor detalhes do erro em produção
    const errorResponse = {
        error: 'Erro interno do servidor',
        message: process.env.NODE_ENV === 'development' ? error.message : 'Erro interno',
        timestamp: timestamp,
        path: req.path,
        method: req.method
    };

    res.status(500).json(errorResponse);
});

// ============================================
// MIDDLEWARE 404
// ============================================

app.use('*', (req, res) => {
    console.log(`⚠️ Rota não encontrada: ${req.method} ${req.originalUrl}`);
    
    res.status(404).json({
        error: 'Rota não encontrada',
        message: `A rota ${req.method} ${req.originalUrl} não existe`,
        available_endpoints: {
            health: '/health',
            status: '/status',
            payment: '/api/process_payment',
            webhook: '/api/webhook'
        },
        timestamp: new Date().toISOString()
    });
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('🛑 Recebido SIGTERM, finalizando servidor graciosamente...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('🛑 Recebido SIGINT, finalizando servidor graciosamente...');
    process.exit(0);
});

// Capturar erros não tratados
process.on('uncaughtException', (error) => {
    console.error('💥 ERRO NÃO CAPTURADO:', error);
    console.error('Stack:', error.stack);
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('💥 PROMISE REJEITADA NÃO TRATADA:', reason);
    console.error('Promise:', promise);
    process.exit(1);
});

// Iniciar servidor
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 ================================
✅ SERVIDOR INICIADO COM SUCESSO
🌐 Porta: ${PORT}
🔗 URL: ${process.env.BASE_URL || `http://localhost:${PORT}`}
📋 Ambiente: ${process.env.NODE_ENV || 'development'}
🧱 Checkout Bricks: ATIVO
📄 Documentação: Oficial Mercado Pago
⏰ Timestamp: ${new Date().toISOString()}
🚀 ================================
    `);
    
    // Log das rotas importantes
    console.log('📍 ROTAS PRINCIPAIS:');
    console.log(`   🏥 Health: ${process.env.BASE_URL}/health`);
    console.log(`   📊 Status: ${process.env.BASE_URL}/status`);
    console.log(`   💳 Payment: ${process.env.BASE_URL}/api/process_payment`);
    console.log(`   🔔 Webhook: ${process.env.BASE_URL}/api/webhook`);
    console.log(`   🔍 Frontend: https://quizfront.vercel.app`);
    console.log(`   🎯 Resultado: https://www.suellenseragi.com.br`);
    console.log('');
});

// Configurar timeout do servidor
server.timeout = 30000; // 30 segundos

module.exports = app;
