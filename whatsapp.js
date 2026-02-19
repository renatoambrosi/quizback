const axios = require('axios');

const EVOLUTION_URL = process.env.EVOLUTION_URL;
const EVOLUTION_API_KEY = process.env.EVOLUTION_API_KEY;
const EVOLUTION_INSTANCE = process.env.EVOLUTION_INSTANCE;
const GOOGLE_SHEET_URL = process.env.GOOGLE_SHEET_URL;

async function buscarDadosCliente(uid) {
    try {
        const response = await axios.get(`${GOOGLE_SHEET_URL}?uid=${uid}`);
        const data = response.data;

        if (!data.found) {
            console.log(`❌ UID ${uid} não encontrado na planilha`);
            return null;
        }

        // respostas[0] = utm_source, respostas[1] = utm_medium, respostas[2] = utm_campaign
        // respostas[3] = nome (coluna 7 = índice 3 do array respostas)
        // respostas[4] = telefone (coluna 8 = índice 4 do array respostas)
        const nome = data.respostas[3];
        const telefone = data.respostas[4];

        console.log(`✅ Cliente encontrado: ${nome} - ${telefone}`);
        return { nome, telefone };

    } catch (error) {
        console.error('❌ Erro ao buscar dados na planilha:', error.message);
        return null;
    }
}

async function enviarMensagemAprovacao(uid) {
    try {
        if (!EVOLUTION_URL || !EVOLUTION_API_KEY || !EVOLUTION_INSTANCE) {
            console.log('📱 WhatsApp não configurado - variáveis faltando');
            return;
        }

        const cliente = await buscarDadosCliente(uid);
        if (!cliente) return;

        const { nome, telefone } = cliente;

        // Formatar número
        const numeroFormatado = telefone.replace(/\D/g, '');
        const numeroFinal = numeroFormatado.startsWith('55')
            ? numeroFormatado
            : `55${numeroFormatado}`;

        const mensagem = `Olá, ${nome}!🤩\n\n✨Tenho novidades...\n🔎O resultado do seu Teste de Prosperidade já está disponível!\n\nEstá animado(a) para você ver o que ele revela sobre o seu momento atual e os próximos passos da sua jornada?\n\n👉 Acesse seu resultado aqui:\nhttps://www.suellenseragi.com.br/resultado1?uid=${uid}\n\nDepois me conta o que achou!`;

        const response = await axios.post(
            `${EVOLUTION_URL}/message/sendText/${EVOLUTION_INSTANCE}`,
            {
                number: numeroFinal,
                text: mensagem
            },
            {
                headers: {
                    'apikey': EVOLUTION_API_KEY,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ WhatsApp enviado para ${nome} (${numeroFinal})`);
        return response.data;

    } catch (error) {
        console.error('❌ Erro ao enviar WhatsApp:', error.message);
    }
}

module.exports = { enviarMensagemAprovacao };
