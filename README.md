# 🚀 Backend Teste de Prosperidade

Backend Node.js para processar pagamentos do Teste de Prosperidade com Mercado Pago.

## 📁 Estrutura do Projeto

```
projeto/
├── server.js              # Servidor principal
├── routes/
│   └── payments.js        # Rotas de pagamento
├── package.json           # Dependências
├── .env                   # Variáveis de ambiente (criar)
├── .env.example           # Template das variáveis
├── .gitignore             # Arquivos ignorados pelo Git
└── README.md              # Este arquivo
```

## ⚡ Como fazer o deploy no Railway

### 1. **Criar repositório no GitHub**
- Faça upload de todos os arquivos
- **IMPORTANTE**: Crie a pasta `routes/` e coloque o `payments.js` dentro

### 2. **Conectar no Railway**
- Vá em [railway.app](https://railway.app)
- "New Project" → "Deploy from GitHub repo"
- Selecione seu repositório

### 3. **Configurar variáveis de ambiente**
No Railway, vá em Settings → Environment:
```
NODE_ENV=production
PORT=3000
BASE_URL=https://quizback-production-b442.up.railway.app
MERCADOPAGO_ACCESS_TOKEN=TEST-6089081814401202-052318-ae2d7c2749034ba7ff38076cc4945619-1108475182
MERCADOPAGO_PUBLIC_KEY=TEST-d1dd4fcc-3ec9-4935-88e2-8784c22f4626
```

### 4. **Deploy automático** 🚀

## 🔧 Endpoints Disponíveis

- `GET /health` - Health check
- `POST /api/process_payment` - Processar pagamentos
- `POST /api/webhook` - Receber notificações Mercado Pago
- `GET /api/payment/:id` - Consultar status de pagamento
- `POST /api/create_preference` - Criar preferência

## 💳 Métodos de Pagamento Suportados

- ✅ **Cartão de crédito** (1x parcela)
- ✅ **PIX** (com QR Code)
- ✅ Redirecionamento automático com UID
- ✅ Webhooks para confirmação

## 🌐 URLs de Integração

- **Backend**: https://quizback-production-b442.up.railway.app
- **Frontend**: https://quizfront.vercel.app
- **Resultado**: https://www.suellenseragi.com.br/resultado?uid=XXXXX

## 🔐 Fluxo de Pagamento

1. Frontend envia dados + UID para `/api/process_payment`
2. Backend processa pagamento no Mercado Pago
3. Se aprovado, redireciona para resultado com UID
4. Webhook confirma pagamento aprovado

## 🛠️ Tecnologias

- Node.js + Express
- Mercado Pago SDK
- CORS + Helmet (segurança)
- UUID para rastreamento
