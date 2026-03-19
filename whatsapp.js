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
    // Após enviar o resultado, registra o lead e agenda o convite em 15 minutos
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
            console.log(`✅ Resultado enviado para ${cliente.nome} (${numeroFinal})`);

            // Registra lead no banco
            try {
                const { registrarLead } = require('./db');
                await registrarLead(uid, cliente.nome, numeroFinal, null);
            } catch (err) {
                console.error('❌ Erro ao registrar lead:', err.message);
            }

            // Agenda convite em 15 minutos (via fila)
            const QUINZE_MIN = 15 * 60 * 1000;
            console.log(`⏳ Convite agendado para ${cliente.nome} em 15 minutos`);
            setTimeout(async () => {
                try {
                    const config = require('./config');
                    const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(cliente.nome)}&ref=${encodeURIComponent(numeroFinal)}`;
                    const convite = config.mensagens.convite(cliente.nome, link);
                    await enviarViaGateway(numeroFinal, convite, cliente.nome, false); // via fila
                    console.log(`✅ Convite enviado para ${cliente.nome} (${numeroFinal})`);
                } catch (err) {
                    console.error(`❌ Erro ao enviar convite para ${cliente.nome}:`, err.message);
                }
            }, QUINZE_MIN);

        } catch (error) {
            console.error('❌ Erro WhatsApp:', error.message);
        }
    }
}

module.exports = WhatsAppNotifier;
module.exports.enviarViaGateway = enviarViaGateway;
module.exports.formatarTelefone = formatarTelefone;
