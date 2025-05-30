const express = require('express');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto'); // ← NOVO: Para validação de assinatura
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

// ============================================
// FUNÇÃO PARA VALIDAR ASSINATURA WEBHOOK
// ============================================

function validateWebhookSignature(req) {
  try {
    // Obter headers necessários
    const xSignature = req.headers['x-signature'];
    const xRequestId = req.headers['x-request-id'];
    
    if (!xSignature) {
      console.log('⚠️ Webhook sem assinatura - pode ser teste');
      return true; // Aceitar para testes locais
    }

    // Extrair timestamp e hash da assinatura
    const parts = xSignature.split(',');
    let ts = null;
    let hash = null;

    parts.forEach(part => {
      const [key, value] = part.split('=');
      if (key.trim() === 'ts') ts = value.trim();
      if (key.trim() === 'v1') hash = value.trim();
    });

    // Obter dados da notificação
    const dataId = req.query['data.id'] || req.body?.data?.id || '';
    
    // Chave secreta (será obtida do painel após configuração)
    const secret = process.env.MERCADOPAGO_WEBHOOK_SECRET;
    
    if (!secret) {
      console.log('⚠️ MERCADOPAGO_WEBHOOK_SECRET não configurado');
      return true; // Aceitar até configurar
    }

    // Criar manifest string conforme documentação
    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    
    // Gerar HMAC SHA256
    const expectedSignature = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    // Comparar assinaturas
    const isValid = expectedSignature === hash;
    
    console.log(`🔐 Validação webhook: ${isValid ? 'VÁLIDA' : 'INVÁLIDA'}`);
    
    return isValid;

  } catch (error) {
    console.error('❌ Erro na validação da assinatura:', error);
    return false;
  }
}

// ============================================
// PROCESSAR PAGAMENTOS (MANTIDO IGUAL)
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

    // UID para rastreamento (se não vier, gera um)
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
        notification_url: `${process.env.BASE_URL || 'https://quizback-production-b442.up.railway.app'}/api/webhook`,
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
        metadata: {
          uid: paymentUID,
          teste_prosperidade: true
        }
      };

      const cardResult = await payment.create({
        body: cardPaymentData,
        requestOptions: { idempotencyKey }
      });

      console.log('✅ Pagamento cartão criado:', cardResult.id);

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
// WEBHOOK MELHORADO COM VALIDAÇÃO DE ASSINATURA
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

    // ✅ VALIDAR ASSINATURA CONFORME DOCUMENTAÇÃO
    const isValidSignature = validateWebhookSignature(req);
    
    if (!isValidSignature) {
      console.error('❌ Assinatura webhook inválida - possível fraude');
      return res.status(401).json({ 
        error: 'Assinatura inválida',
        message: 'Webhook rejeitado por segurança' 
      });
    }

    // Obter dados da notificação (padrão Webhooks)
    const { action, data, type } = req.body;

    // ✅ RESPONDER IMEDIATAMENTE CONFORME DOCUMENTAÇÃO
    // O Mercado Pago aguarda resposta HTTP 200/201 em até 22 segundos
    res.status(200).json({ 
      received: true,
      timestamp: new Date().toISOString(),
      processed: true
    });

    // ============================================
    // PROCESSAR NOTIFICAÇÃO DE PAGAMENTO
    // ============================================

    if ((action === 'payment.updated' || action === 'payment.created') && data && data.id) {
      const paymentId = data.id;
      
      try {
        console.log(`📋 Buscando detalhes do pagamento ${paymentId}...`);
        
        // ✅ BUSCAR DADOS COMPLETOS CONFORME DOCUMENTAÇÃO
        const paymentDetails = await payment.get({ id: paymentId });
        
        console.log(`📊 Status do pagamento ${paymentId}:`, {
          status: paymentDetails.status,
          status_detail: paymentDetails.status_detail,
          external_reference: paymentDetails.external_reference,
          transaction_amount: paymentDetails.transaction_amount,
          payment_method_id: paymentDetails.payment_method_id
        });
        
        // ============================================
        // AÇÕES BASEADAS NO STATUS DO PAGAMENTO
        // ============================================
        
        if (paymentDetails.status === 'approved') {
          const uid = paymentDetails.external_reference;
          const amount = paymentDetails.transaction_amount;
          const method = paymentDetails.payment_method_id;
          
          console.log(`✅ PAGAMENTO APROVADO!`);
          console.log(`   💰 Valor: R$ ${amount}`);
          console.log(`   💳 Método: ${method}`);
          console.log(`   🆔 UID: ${uid}`);
          console.log(`   🔗 Resultado: https://www.suellenseragi.com.br/resultado?uid=${uid}`);
          
          // 🎯 AQUI VOCÊ PODE ADICIONAR SUAS AÇÕES:
          // - Salvar no banco de dados
          // - Enviar email de confirmação
          // - Liberar acesso ao resultado
          // - Integrar com outros sistemas
          
        } else if (paymentDetails.status === 'pending') {
          const uid = paymentDetails.external_reference;
          console.log(`⏳ Pagamento pendente para UID: ${uid}`);
          
        } else if (['rejected', 'cancelled'].includes(paymentDetails.status)) {
          const uid = paymentDetails.external_reference;
          console.log(`❌ Pagamento ${paymentDetails.status} para UID: ${uid}`);
        }

      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do pagamento:', error);
      }
    } else {
      console.log('ℹ️ Notificação ignorada - não é payment.updated:', { action, type });
    }

  } catch (error) {
    console.error('❌ Erro no processamento do webhook:', error);
    
    // ⚠️ MESMO COM ERRO, RESPONDER 200 PARA EVITAR REENVIOS
    if (!res.headersSent) {
      res.status(200).json({ 
        received: true, 
        error: 'Erro interno processamento' 
      });
    }
  }
});

// ============================================
// CONSULTAR STATUS DE PAGAMENTO (MANTIDO IGUAL)
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
// CRIAR PREFERÊNCIA (MANTIDO IGUAL)
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

module.exports = router;
