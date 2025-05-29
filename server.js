import express from 'express';
import cors from 'cors';
import { v4 as uuidv4 } from 'uuid';
import { MercadoPagoConfig, Payment } from 'mercadopago';

const app = express();
const port = process.env.PORT || 3000;

// Configurar Mercado Pago - SUAS CREDENCIAIS DE TESTE
const client = new MercadoPagoConfig({
  accessToken: 'TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182'
});

app.use(cors());
app.use(express.json());

// Endpoint raiz
app.get('/', (req, res) => {
  res.json({ message: 'Backend funcionando' });
});

// EXATAMENTE como na documentação Backend.txt que você forneceu
app.post('/process_payment', async (req, res) => {
  const payment = new Payment(client);
  
  try {
    const result = await payment.create({ 
      body: req.body,
      requestOptions: {
        idempotencyKey: uuidv4()
      }
    });
    
    res.json(result);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});
