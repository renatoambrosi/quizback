const axios = require('axios');

// ── HELPER ──
function formatarTelefone(telefone) {
    const num = String(telefone).replace(/\D/g, '');
    if (num.startsWith('55')) return num;
    if (num.startsWith('0')) return `55${num.slice(1)}`;
    return `55${num}`;
}

async function enviarViaGateway(telefone, mensagem, nome, imediato = false) {
    const url = process.env.GATEWAY_URL;
    const token = process.env.GATEWAY_TOKEN;

    if (!url || !token) throw new Error('GATEWAY_URL ou GATEWAY_TOKEN não configurados');

    await axios.post(
        `${url}/enviar`,
        { telefone, mensagem, nome: nome || telefone, origem: 'quizback', imediato },
        { headers: { 'x-gateway-token': token, 'Content-Type': 'application/json' }, timeout: 10000 }
    );
}

class WhatsAppNotifier {
    constructor() {
        this.sheetUrl = process.env.GOOGLE_SHEET_URL;
    }

    async buscarCliente(uid) {
        const response = await axios.get(`${this.sheetUrl}?uid=${uid}`);
        if (!response.data.found) return null;
        return {
            nome: response.data.respostas[0],
            telefone: response.data.respostas[1]
        };
    }

    // ── RESULTADO DO TESTE — IMEDIATO (pula a fila) ──
    async enviarMensagemAprovacao(uid) {
        try {
            console.log(`📱 WhatsApp iniciando para UID: ${uid}`);
            const cliente = await this.buscarCliente(uid);
            if (!cliente) { console.log('📱 Cliente não encontrado'); return; }

            const numeroFinal = formatarTelefone(cliente.telefone);
            console.log(`📱 Número final: ${numeroFinal}`);

            const mensagem =
                `Olá, ${cliente.nome}!🤩\n\n✨Tenho novidades...\n` +
                `🔎O resultado do seu Teste de Prosperidade já está disponível!\n\n` +
                `Está animado(a) para você ver o que ele revela sobre o seu momento atual e os próximos passos da sua jornada?\n\n` +
                `👉 Acesse seu resultado aqui:\nhttps://www.suellenseragi.com.br/resultado4?uid=${uid}`;

            // imediato = true — pessoa acabou de pagar, não pode esperar fila
            await enviarViaGateway(numeroFinal, mensagem, cliente.nome, true);
            console.log(`✅ WhatsApp enviado para ${cliente.nome} (${numeroFinal})`);
        } catch (error) {
            console.error('❌ Erro WhatsApp:', error.message);
        }
    }
}

module.exports = WhatsAppNotifier;
module.exports.enviarViaGateway = enviarViaGateway;
module.exports.formatarTelefone = formatarTelefone;
