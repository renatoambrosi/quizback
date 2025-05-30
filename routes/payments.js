const express = require('express');
const { MercadoPagoConfig, Payment, Preference, MerchantOrder } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const router = express.Router();

// ============================================
// CONFIGURAÇÃO MERCADO PAGO
// ============================================

const client = new MercadoPagoConfig({
  accessToken: process.env.MERCADOPAGO_ACCESS_TOKEN || 'TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182',
  options: {
    timeout: 5000,
    idempotencyKey: uuidv4()
  }
});

const payment = new Payment(client);
const preference = new Preference(client);
const merchantOrder = new MerchantOrder(client); // ← NOVO: Para merchant orders

// ============================================
// CONTROLE DE TRANSAÇÕES EM MEMÓRIA
// ============================================

// Cache simples para controlar transações (em produção usar Redis/BD)
const transactionCache = new Map();

// Função para salvar status da transação
function saveTransactionStatus(uid, status, paymentId = null, merchantOrderId = null) {
  const existing = transactionCache.get(uid) || {};
  transactionCache.set(uid, {
    ...existing,
    uid,
    status,
    paymentId,
    merchantOrderId,
    lastUpdate: new Date().toISOString(),
    ...(paymentId && { paymentId }),
    ...(merchantOrderId && { merchantOrderId })
  });
  
  console.log(`💾 Transação salva: UID=${uid}, Status=${status}, PaymentID=${paymentId}`);
}

// Função para verificar se transação já foi processada
function isTransactionProcessed(uid) {
  const transaction = transactionCache.get(uid);
  return transaction && ['approved', 'closed', 'completed'].includes(transaction.status);
}

// ============================================
// FUNÇÃO PARA VALIDAR ASSINATURA WEBHOOK
// ============================================

function validateWebhookSignature(req) {
  try {
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    
    if (!xSignature) {
      console.log('⚠️ Webhook sem assinatura - pode ser teste');
      return true;
    }

    const parts = xSignature.split(',');
    let ts = null;
    let hash = null;

    parts.forEach(part => {
      const [key, value] = part.split('=');
      if (key.trim() === 'ts') ts = value.trim();
      if (key.trim() === 'v1') hash = value.trim();
    });

    const dataId = req.query['data.id'] || req.body?.data?.id || '';
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    
    if (!secret) {
      console.log('⚠️ MERCADOPAGO_WEBHOOK_SECRET não configurado');
      return true;
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    const isValid = expectedSignature === hash;
    console.log(`🔐 Validação webhook: ${isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
    
    return isValid;

  } catch (error) {
    console.error('❌ Erro na validação da assinatura:', error);
    return false;
  }
}

// ============================================
// PROCESSAR PAGAMENTOS (MELHORADO)
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
      selectedPaymentMethod
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

    const paymentUID = uid || uuidv4();
    
    // ✅ VERIFICAR SE TRANSAÇÃO JÁ FOI PROCESSADA
    if (isTransactionProcessed(paymentUID)) {
      console.log(`⚠️ Transação ${paymentUID} já foi processada - bloqueando duplicação`);
      return res.status(409).json({
        error: 'Transação já processada',
        message: 'Esta transação já foi finalizada',
        uid: paymentUID
      });
    }

    // Salvar como "processando"
    saveTransactionStatus(paymentUID, 'processing');

    const idempotencyKey = uuidv4();

    // ============================================
    // PAGAMENTO PIX (MELHORADO)
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
        notification_url: `${process.env.BASE_URL || 'https://quizback-production-b442.up.railway.app'}/api/webhook`,
        // ✅ NOVO: Configurar expiração para evitar transações pendentes
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(), // 30 minutos
        metadata: {
          uid: paymentUID,
          teste_prosperidade: true,
          timestamp: new Date().toISOString()
        }
      };

      const pixResult = await payment.create({
        body: pixPaymentData,
        requestOptions: { idempotencyKey }
      });

      console.log('✅ PIX criado:', pixResult.id);
      
      // Salvar status
      saveTransactionStatus(paymentUID, 'pending', pixResult.id);

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
    // PAGAMENTO CARTÃO DE CRÉDITO (MELHORADO)
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
        notification_url: `${process.env.BASE_URL || 'https://quizback-production-b442.up.railway.app'}/api/webhook`,
        statement_descriptor: 'TESTE PROSPERIDADE',
        // ✅ NOVO: Captura automática para evitar problemas
        capture: true,
        metadata: {
          uid: paymentUID,
          teste_prosperidade: true,
          timestamp: new Date().toISOString()
        }
      };

      const cardResult = await payment.create({
        body: cardPaymentData,
        requestOptions: { idempotencyKey }
      });

      console.log('✅ Pagamento cartão criado:', cardResult.id);

      // Salvar status baseado no resultado
      saveTransactionStatus(paymentUID, cardResult.status, cardResult.id);

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

    return res.status(400).json({
      error: 'Método de pagamento não suportado',
      message: 'Apenas cartão de crédito e PIX são aceitos'
    });

  } catch (error) {
    console.error('❌ Erro ao processar pagamento:', error);

    if (error.cause && error.cause.length > 0) {
      const mpError = error.cause[0];
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
// WEBHOOK MELHORADO COM MERCHANT ORDER
// ============================================

router.post('/webhook', async (req, res) => {
  try {
    console.log('🔔 Webhook recebido:', {
      body: req.body,
      query: req.query,
      headers: {
        'x-signature': req.headers['x-signature'],
        'x-request-id': req.headers['x-request-id']
      }
    });

    // Validar assinatura
    const isValidSignature = validateWebhookSignature(req);
    
    if (!isValidSignature) {
      console.error('❌ Assinatura webhook inválida');
      return res.status(401).json({ 
        error: 'Assinatura inválida',
        message: 'Webhook rejeitado por segurança' 
      });
    }

    // ✅ RESPONDER IMEDIATAMENTE
    res.status(200).json({ 
      received: true,
      timestamp: new Date().toISOString(),
      processed: true
    });

    const { action, data, type } = req.body;

    // ============================================
    // PROCESSAR MERCHANT ORDER (NOVO)
    // ============================================

    if (action === 'merchant_order' && data && data.id) {
      try {
        console.log(`📦 Processando Merchant Order: ${data.id}`);
        
        const orderDetails = await merchantOrder.get({ merchantOrderId: data.id });
        
        console.log(`📊 Status Merchant Order ${data.id}:`, {
          status: orderDetails.status,
          order_status: orderDetails.order_status,
          external_reference: orderDetails.external_reference,
          total_amount: orderDetails.total_amount
        });

        const uid = orderDetails.external_reference;
        
        if (orderDetails.order_status === 'closed') {
          console.log(`✅ MERCHANT ORDER CLOSED para UID: ${uid}`);
          saveTransactionStatus(uid, 'closed', null, data.id);
          
          // ✅ AQUI VOCÊ PODE LIBERAR O ACESSO DEFINITIVO
          console.log(`🎯 Acesso liberado para: https://www.suellenseragi.com.br/resultado?uid=${uid}`);
        }

      } catch (error) {
        console.error('❌ Erro ao processar Merchant Order:', error);
      }
    }

    // ============================================
    // PROCESSAR PAGAMENTO (MELHORADO)
    // ============================================

    if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
      const paymentId = data.id;
      
      try {
        console.log(`📋 Buscando detalhes do pagamento ${paymentId}...`);
        
        const paymentDetails = await payment.get({ id: paymentId });
        const uid = paymentDetails.external_reference;
        
        console.log(`📊 Status do pagamento ${paymentId}:`, {
          status: paymentDetails.status,
          status_detail: paymentDetails.status_detail,
          external_reference: uid,
          transaction_amount: paymentDetails.transaction_amount,
          payment_method_id: paymentDetails.payment_method_id
        });

        // ✅ VERIFICAR SE JÁ FOI PROCESSADO (evitar duplicação)
        if (isTransactionProcessed(uid)) {
          console.log(`⚠️ Pagamento ${paymentId} já processado para UID: ${uid}`);
          return;
        }
        
        // ============================================
        // AÇÕES BASEADAS NO STATUS
        // ============================================
        
        if (paymentDetails.status === 'approved') {
          console.log(`✅ PAGAMENTO APROVADO!`);
          console.log(`   💰 Valor: R$ ${paymentDetails.transaction_amount}`);
          console.log(`   💳 Método: ${paymentDetails.payment_method_id}`);
          console.log(`   🆔 UID: ${uid}`);
          console.log(`   🔗 Resultado: https://www.suellenseragi.com.br/resultado?uid=${uid}`);
          
          // Salvar como aprovado
          saveTransactionStatus(uid, 'approved', paymentId);
          
          // ✅ SE FOR CARTÃO, PODE LIBERAR ACESSO IMEDIATAMENTE
          if (paymentDetails.payment_method_id !== 'pix') {
            saveTransactionStatus(uid, 'completed', paymentId);
            console.log(`🎯 Acesso liberado imediatamente: ${uid}`);
          }
          
        } else if (paymentDetails.status === 'pending') {
          console.log(`⏳ Pagamento pendente para UID: ${uid}`);
          saveTransactionStatus(uid, 'pending', paymentId);
          
        } else if (['rejected', 'cancelled'].includes(paymentDetails.status)) {
          console.log(`❌ Pagamento ${paymentDetails.status} para UID: ${uid}`);
          saveTransactionStatus(uid, paymentDetails.status, paymentId);
        }

      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do pagamento:', error);
      }
    } else {
      console.log('ℹ️ Notificação ignorada:', { action, type });
    }

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    
    if (!res.headersSent) {
      res.status(200).json({ 
        received: true, 
        error: 'Erro interno processamento' 
      });
    }
  }
});

// ============================================
// CONSULTAR STATUS DE TRANSAÇÃO (NOVO)
// ============================================

router.get('/transaction/:uid', (req, res) => {
  try {
    const { uid } = req.params;
    const transaction = transactionCache.get(uid);
    
    if (!transaction) {
      return res.status(404).json({
        error: 'Transação não encontrada',
        uid: uid
      });
    }
    
    res.status(200).json({
      uid: transaction.uid,
      status: transaction.status,
      paymentId: transaction.paymentId,
      merchantOrderId: transaction.merchantOrderId,
      lastUpdate: transaction.lastUpdate,
      isCompleted: ['approved', 'closed', 'completed'].includes(transaction.status)
    });

  } catch (error) {
    console.error('❌ Erro ao consultar transação:', error);
    res.status(500).json({
      error: 'Erro interno',
      message: 'Não foi possível consultar a transação'
    });
  }
});

// ============================================
// LISTAR TRANSAÇÕES (DEBUG)
// ============================================

router.get('/transactions', (req, res) => {
  try {
    const transactions = Array.from(transactionCache.values())
      .sort((a, b) => new Date(b.lastUpdate) - new Date(a.lastUpdate))
      .slice(0, 50); // Últimas 50 transações
    
    res.status(200).json({
      total: transactionCache.size,
      transactions: transactions
    });

  } catch (error) {
    console.error('❌ Erro ao listar transações:', error);
    res.status(500).json({
      error: 'Erro interno',
      message: 'Não foi possível listar as transações'
    });
  }
});

// ============================================
// CONSULTAR PAGAMENTO (MANTIDO)
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
      error: 'Pagamento não encontrado',
      message: 'ID de pagamento inválido'
    });
  }
});

// ============================================
// CRIAR PREFERÊNCIA (MANTIDO)
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
        failure: `https://quizfront.vercel.app/erro?uid=${paymentUID}`,
        pending: `https://www.suellenseragi.com.br/resultado?uid=${paymentUID}`
      },
      auto_return: 'approved',
      external_reference: paymentUID,
      notification_url: `${process.env.BASE_URL || 'https://quizback-production-b442.up.railway.app'}/api/webhook`,
      statement_descriptor: 'TESTE PROSPERIDADE',
      // ✅ NOVO: Configurar expiração
      expires: true,
      expiration_date_to: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 horas
      metadata: {
        uid: paymentUID,
        teste_prosperidade: true
      }
    };

    const result = await preference.create({ body: preferenceData });

    res.status(201).json({
      id: result.id,
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
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

// ============================================
// LIMPEZA AUTOMÁTICA (OPCIONAL)
// ============================================

// Limpar transações antigas a cada hora
setInterval(() => {
  const now = Date.now();
  const oneHourAgo = now - (60 * 60 * 1000);
  
  for (const [uid, transaction] of transactionCache.entries()) {
    const transactionTime = new Date(transaction.lastUpdate).getTime();
    
    if (transactionTime < oneHourAgo && ['rejected', 'cancelled', 'expired'].includes(transaction.status)) {
      transactionCache.delete(uid);
      console.log(`🧹 Transação ${uid} removida do cache (${transaction.status})`);
    }
  }
}, 60 * 60 * 1000); // A cada hora

module.exports = router;
