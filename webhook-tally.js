javascript
// webhook-tally.js

const express = require('express');
const axios = require('axios');
const app = express();

app.use(express.json());

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_API_KEY = process.env.SUPABASE_API_KEY;
const TABELA = process.env.SUPABASE_TABLE;

function testeFinalizado(perguntas) {
  return perguntas.length === 30 && perguntas.every(p => p && p.trim() !== '');
}

app.post('/webhook-tally', async (req, res) => {
  try {
    const body = req.body;

    const nome = body['Qual o seu nome?'] || '';
    const email = body['Qual o seu e-mail'] || '';
    const whatsapp = body['Qual seu WhatsApp?'] || '';
    const uid = body['Submission ID'] || '';
    const data_registro_inicial = body['Submitted at'] || new Date().toISOString();

    const perguntas = Array.from({length: 30}, (_, i) => body[`Q${i+1}`] || '');

    const concluiu_o_teste = testeFinalizado(perguntas);
    const iniciou_o_teste = true;

    const payload = {
      nome,
      email,
      whatsapp,
      uid,
      data_registro_inicial,
      iniciou_o_teste,
      concluiu_o_teste
    };

    await axios.post(`${SUPABASE_URL}/rest/v1/${TABELA}`, payload, {
      headers: {
        apikey: SUPABASE_API_KEY,
        Authorization: `Bearer ${SUPABASE_API_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=minimal'
      }
    });

    res.status(200).json({ok: true, info: 'Lead armazenado com sucesso!'});
  } catch (err) {
    console.error(err);
    res.status(500).json({ok: false, erro: err.message});
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Servidor webhook rodando na porta ${port}`));
