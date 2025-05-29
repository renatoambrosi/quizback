const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config();

const paymentRoutes = require('./routes/payments');

const app = express();
const PORT = process.env.PORT || 3000;

// ============================================
// MIDDLEWARES DE SEGURANÇA
// ============================================

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
}));

app.use(cors({
  origin: [
    'https://quizfront.vercel.app',
    'https://www.suellenseragi.com.br',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Idempotency-Key']
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================
// ROTAS
// ============================================

// Health Check
app.get('/health', (req, res) => {
  res.status(200).json({ 
    status: 'OK', 
    message: 'Backend Teste de Prosperidade funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Rotas de pagamento
app.use('/api', paymentRoutes);

// Rota de fallback
app.get('*', (req, res) => {
  res.status(404).json({ 
    error: 'Rota não encontrada',
    message: 'Backend do Teste de Prosperidade' 
  });
});

// ============================================
// TRATAMENTO DE ERROS GLOBAL
// ============================================

app.use((error, req, res, next) => {
  console.error('❌ Erro Global:', error);
  res.status(500).json({
    error: 'Erro interno do servidor',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Algo deu errado'
  });
});

// ============================================
// INICIALIZAÇÃO DO SERVIDOR
// ============================================

app.listen(PORT, () => {
  console.log(`
  🚀 ============================================
     BACKEND TESTE DE PROSPERIDADE ONLINE!
  ============================================
  🌐 Servidor: http://localhost:${PORT}
  🏥 Health: http://localhost:${PORT}/health
  💳 Pagamentos: http://localhost:${PORT}/api/process_payment
  🔔 Webhook: http://localhost:${PORT}/api/webhook
  ============================================
  `);
});
