const express = require('express');
const { MercadoPagoConfig, Payment, Preference } = require('mercadopago');
const { v4: uuidv4 } = require('uuid');
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
// WEBHOOK PARA NOTIFICAÇÕES
// ============================================

router.post('/webhook', async (req, res) => {
  try {
    console.log('🔔 Webhook recebido:', req.body);

    const { action, data, type } = req.body;

    // Verificar se é notificação de pagamento
    if (action === 'payment.updated' && data && data.id) {
      const paymentId = data.id;
      
      try {
        // Buscar detalhes do pagamento
        const paymentDetails = await payment.get({ id: paymentId });
        
        console.log(`📋 Status do pagamento ${paymentId}:`, paymentDetails.status);
        
        // Se aprovado, você pode realizar ações adicionais aqui
        if (paymentDetails.status === 'approved') {
          const uid = paymentDetails.external_reference;
          console.log(`✅ Pagamento aprovado para UID: ${uid}`);
          
          // Aqui você pode:
          // - Atualizar banco de dados
          // - Enviar email de confirmação
          // - Liberar acesso ao resultado
        }

      } catch (error) {
        console.error('❌ Erro ao buscar detalhes do pagamento:', error);
      }
    }

    // Sempre responder com sucesso para o webhook
    res.status(200).json({ received: true });

  } catch (error) {
    console.error('❌ Erro no webhook:', error);
    res.status(500).json({ error: 'Erro interno do webhook' });
  }
});

// ============================================
// CONSULTAR STATUS DE PAGAMENTO
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
// CRIAR PREFERÊNCIA (PARA CONTA MERCADO PAGO)
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
