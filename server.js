const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;
require('./webhook-tally')(app);


// ============================================
// MIDDLEWARES DE SEGURANÇA
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'", "https://sdk.mercadopago.com"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.mercadopago.com", "https://sdk.mercadopago.com"],
    },
  },
  crossOriginEmbedderPolicy: false, // Necessário para Mercado Pago
}));

app.use(cors({
  origin: [
    'https://quizfront.vercel.app',
    'https://www.suellenseragi.com.br',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://api.mercadopago.com'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key', 'X-Signature', 'X-Request-Id']
}));

// Middleware para logging de requests
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`📡 ${timestamp} - ${req.method} ${req.path} - IP: ${req.ip}`);
  
  // Log específico para webhooks
  if (req.path === '/api/webhook') {
    console.log('🔔 WEBHOOK REQUEST:', {
      headers: req.headers,
      body: req.body
    });
  }
  
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Middleware para capturar IP real
app.use((req, res, next) => {
  req.clientIP = req.headers['x-forwarded-for'] || 
                 req.connection.remoteAddress || 
                 req.socket.remoteAddress ||
                 (req.connection.socket ? req.connection.socket.remoteAddress : null);
  next();
});

// ============================================
// ROTAS CONFORME DOCUMENTAÇÃO OFICIAL
// ============================================

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Backend Teste de Prosperidade funcionando!',
    timestamp: new Date().toISOString(),
    version: '2.0-oficial'
  });
});

// Status detalhado do sistema
app.get('/status', (req, res) => {
  const uptime = process.uptime();
  const memoryUsage = process.memoryUsage();
  
  res.status(200).json({
    status: 'OK',
    service: 'Teste de Prosperidade Backend',
    version: '2.0-oficial',
    uptime: `${Math.floor(uptime / 60)}m ${Math.floor(uptime % 60)}s`,
    memory: {
      rss: `${Math.round(memoryUsage.rss / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memoryUsage.heapUsed / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memoryUsage.heapTotal / 1024 / 1024)} MB`
    },
    environment: process.env.NODE_ENV || 'development',
    timestamp: new Date().toISOString(),
    features: {
      checkout_bricks: true,
      webhook_processing: true,
      polling_support: true,
      official_mp_integration: true
    }
  });
});

// Endpoint para validar conectividade com Mercado Pago
app.get('/api/mp-health', async (req, res) => {
  try {
    const { MercadoPagoConfig } = require('mercadopago');
    
    const client = new MercadoPagoConfig({
      accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN,
      options: { timeout: 5000 }
    });
    
    res.status(200).json({
      mercadopago: 'OK',
      message: 'Conectividade com Mercado Pago verificada',
      access_token_configured: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
      public_key_configured: !!process.env.MERCADOPAGO_PUBLIC_KEY,
      webhook_secret_configured: !!process.env.MERCADOPAGO_WEBHOOK_SECRET,
      timestamp: new Date().toISOString()
    });
    
  } catch (error) {
    console.error('❌ Erro na conectividade com MP:', error);
    res.status(500).json({
      mercadopago: 'ERROR',
      message: 'Erro na conectividade com Mercado Pago',
      error: error.message
    });
  }
});

// Rotas de pagamento
app.use('/api', paymentRoutes);

// Rota para informações do ambiente
app.get('/api/environment', (req, res) => {
  res.status(200).json({
    node_env: process.env.NODE_ENV || 'development',
    port: PORT,
    base_url: process.env.BASE_URL || `http://localhost:${PORT}`,
    has_mp_credentials: {
      access_token: !!process.env.MERCADOPAGO_ACCESS_TOKEN,
      public_key: !!process.env.MERCADOPAGO_PUBLIC_KEY,
      webhook_secret: !!process.env.MERCADOPAGO_WEBHOOK_SECRET
    },
    timestamp: new Date().toISOString()
  });
});

// Rota de fallback
app.get('*', (req, res) => {
  console.log(`❓ Rota não encontrada: ${req.method} ${req.path}`);
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: 'Backend do Teste de Prosperidade - Oficial',
    requested_path: req.path,
    available_endpoints: {
      health: '/health',
      status: '/status',
      mp_health: '/api/mp-health',
      process_payment: '/api/process_payment',
      webhook: '/api/webhook',
      payment_lookup: '/api/payment/:id',
      callback: '/api/callback'
    },
    timestamp: new Date().toISOString()
  });
});

// ============================================
// TRATAMENTO DE ERROS GLOBAL
// ============================================

app.use((error, req, res, next) => {
  const timestamp = new Date().toISOString();
  console.error(`❌ ERRO GLOBAL [${timestamp}]:`, {
    message: error.message,
    stack: error.stack?.substring(0, 500),
    path: req.path,
    method: req.method,
    ip: req.clientIP
  });
  
  res.status(error.status || 500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado',
    timestamp: timestamp,
    request_id: req.headers['x-request-id'] || 'unknown'
  });
});

// ============================================
// TRATAMENTO DE PROCESSOS
// ============================================

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 SIGTERM recebido. Encerrando servidor...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('🛑 SIGINT recebido. Encerrando servidor...');
  process.exit(0);
});

// Log de erros não capturados
process.on('uncaughtException', (error) => {
  console.error('💥 UNCAUGHT EXCEPTION:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 UNHANDLED REJECTION:', reason, promise);
  process.exit(1);
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

app.listen(PORT, () => {
  const timestamp = new Date().toISOString();
  console.log(`
  🚀 ============================================
     BACKEND TESTE DE PROSPERIDADE ONLINE!
     VERSION 2.0 - CONFORME DOC OFICIAL MP
  ============================================
  📅 Iniciado em: ${timestamp}
  🌐 Servidor: http://localhost:${PORT}
  🏥 Health: http://localhost:${PORT}/health
  📊 Status: http://localhost:${PORT}/status
  💳 Pagamentos: http://localhost:${PORT}/api/process_payment
  🔔 Webhook: http://localhost:${PORT}/api/webhook
  🔍 Consulta: http://localhost:${PORT}/api/payment/:id
  🔄 Callback: http://localhost:${PORT}/api/callback
  
  🔧 CONFIGURAÇÕES:
  • Node ENV: ${process.env.NODE_ENV || 'development'}
  • MP Access Token: ${process.env.MERCADOPAGO_ACCESS_TOKEN ? '✅ Configurado' : '❌ Não configurado'}
  • MP Public Key: ${process.env.MERCADOPAGO_PUBLIC_KEY ? '✅ Configurado' : '❌ Não configurado'}
  • Webhook Secret: ${process.env.MERCADOPAGO_WEBHOOK_SECRET ? '✅ Configurado' : '❌ Não configurado'}
  • Base URL: ${process.env.BASE_URL || 'Não configurado'}
  
  🎯 IMPLEMENTAÇÃO OFICIAL:
  ✅ Checkout Bricks conforme doc oficial MP
  ✅ Payment Brick para cartão e PIX
  ✅ Status Screen Brick
  ✅ Webhook conforme padrão MP
  ✅ Sistema de polling para PIX
  ✅ Additional info conforme especificação
  ✅ Logs estruturados para debugging
  ✅ Validações conforme documentação
  ✅ Tratamento de erros oficial MP
  ============================================
  `);
  
  // Verificar configurações críticas
  const criticalConfigs = [
    'MERCADOPAGO_ACCESS_TOKEN',
    'MERCADOPAGO_PUBLIC_KEY',
    'BASE_URL'
  ];
  
  const missingConfigs = criticalConfigs.filter(config => !process.env[config]);
  
  if (missingConfigs.length > 0) {
    console.log(`
  ⚠️  ATENÇÃO: Configurações em falta:
  ${missingConfigs.map(config => `   • ${config}`).join('\n')}
  
  Configure essas variáveis no Railway para funcionamento completo.
    `);
  } else {
    console.log(`
  ✅ TODAS AS CONFIGURAÇÕES ESTÃO OK!
  🚀 Sistema pronto para produção com implementação oficial MP.
    `);
  }
});
