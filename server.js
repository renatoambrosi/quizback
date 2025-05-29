import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const app = express();
const port = process.env.PORT || 3000;

// Configurar cliente Mercado Pago - EXATAMENTE como na documentação
const client = new MercadoPagoConfig({
  accessToken: 'TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182'
});

// CORS configurado para aceitar o frontend
app.use(cors({
  origin: [
    'https://quizfront.vercel.app',
    'http://localhost:3000',
    'http://localhost:5173'
  ],
  credentials: true
}));

app.use(express.json());

// Endpoint teste
app.get('/', (req, res) => {
  res.json({ 
    message: 'Backend QuizBack funcionando!',
    timestamp: new Date().toISOString()
  });
});

// Endpoint para processar pagamentos - SEGUINDO A DOCUMENTAÇÃO
app.post('/process_payment', async (req, res) => {
  const payment = new Payment(client);

  try {
    console.log('Dados recebidos:', req.body);

    // Extrair dados conforme a documentação
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

    // Validações obrigatórias conforme documentação
    if (!payer || !payer.email) {
      return res.status(400).json({
        error: 'payer.email é obrigatório'
      });
    }

    // Montar body EXATAMENTE conforme a documentação
    const paymentBody = {
      transaction_amount: transaction_amount || 10,
      description: description || 'Pagamento do quiz',
      installments: installments || 1,
      external_reference: external_reference || uid || 'quiz-' + Date.now(),
      
      // PAYER - conforme documentação
      payer: {
        email: payer.email,
        first_name: payer.first_name || '',
        last_name: payer.last_name || '',
        identification: {
          type: payer.identification?.type || 'CPF',
          number: payer.identification?.number || ''
        }
      },

      // ADDITIONAL_INFO - conforme documentação
      additional_info: {
        items: [
          {
            id: 'QUIZ-001',
            title: 'Resultado Personalizado',
            description: 'Pagamento referente ao resultado do quiz',
            category_id: 'digital_content',
            quantity: 1,
            unit_price: transaction_amount || 10
          }
        ],
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

    // Adicionar campos específicos por método de pagamento
    if (payment_method_id === 'pix') {
      // PIX - conforme documentação
      paymentBody.payment_method_id = 'pix';
    } else if (token && payment_method_id) {
      // CARTÃO - conforme documentação
      paymentBody.token = token;
      paymentBody.payment_method_id = payment_method_id;
      if (issuer_id) {
        paymentBody.issuer_id = issuer_id;
      }
    } else if (payment_method_id && payment_method_id.includes('bol')) {
      // BOLETO - conforme documentação
      paymentBody.payment_method_id = payment_method_id;
    }

    console.log('Enviando para Mercado Pago:', paymentBody);

    // Criar pagamento com X-Idempotency-Key OBRIGATÓRIO conforme documentação
    const result = await payment.create({
      body: paymentBody,
      requestOptions: {
        idempotencyKey: uuidv4()
      }
    });

    console.log('Resposta Mercado Pago:', {
      id: result.id,
      status: result.status,
      status_detail: result.status_detail
    });

    // Resposta conforme documentação
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

    // Adicionar dados específicos para PIX conforme documentação
    if (result.point_of_interaction?.transaction_data) {
      response.point_of_interaction = {
        transaction_data: {
          qr_code: result.point_of_interaction.transaction_data.qr_code,
          qr_code_base64: result.point_of_interaction.transaction_data.qr_code_base64,
          ticket_url: result.point_of_interaction.transaction_data.ticket_url
        }
      };
    }

    // Adicionar dados para boleto conforme documentação
    if (result.transaction_details?.external_resource_url) {
      response.transaction_details = {
        external_resource_url: result.transaction_details.external_resource_url
      };
    }

    res.status(201).json(response);

  } catch (error) {
    console.error('Erro completo:', error);
    
    // Tratamento de erros conforme documentação
    if (error.cause && error.cause.length > 0) {
      const apiError = error.cause[0];
      console.error('Erro da API Mercado Pago:', apiError);
      
      res.status(400).json({
        error: 'Erro do Mercado Pago',
        message: apiError.description || error.message,
        code: apiError.code
      });
    } else {
      res.status(500).json({
        error: 'Erro interno do servidor',
        message: error.message
      });
    }
  }
});

// Endpoint para consultar status do pagamento
app.get('/payment_status/:paymentId', async (req, res) => {
  const payment = new Payment(client);
  
  try {
    const result = await payment.get({ id: req.params.paymentId });
    
    res.json({
      id: result.id,
      status: result.status,
      status_detail: result.status_detail,
      payment_method_id: result.payment_method_id,
      transaction_amount: result.transaction_amount,
      date_approved: result.date_approved,
      external_reference: result.external_reference
    });
    
  } catch (error) {
    res.status(404).json({
      error: 'Pagamento não encontrado',
      message: error.message
    });
  }
});

// Webhook conforme documentação
app.post('/webhook', (req, res) => {
  console.log('Webhook recebido:', req.body);
  
  const { type, data } = req.body;
  
  if (type === 'payment') {
    console.log('Notificação de pagamento:', data.id);
    // Aqui você pode processar a notificação
  }
  
  // Sempre retornar 200 OK conforme documentação
  res.status(200).send('OK');
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
  console.log('Credenciais: TEST (ambiente de testes)');
});
