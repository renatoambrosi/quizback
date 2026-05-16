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

// ── CONTADOR EM MEMÓRIA DE CONVITES PENDENTES ──
// Cada item: { uid, nome, telefone, agendado_para (timestamp ms) }
// Visível no admin via getConvitesPendentes()
const convitesPendentes = new Map();

function getConvitesPendentes() {
    const agora = Date.now();
    return Array.from(convitesPendentes.values())
        .filter(c => c.agendado_para > agora)
        .map(c => ({
            uid: c.uid,
            nome: c.nome,
            telefone: c.telefone,
            agendado_para: new Date(c.agendado_para).toISOString(),
            minutos_restantes: Math.round((c.agendado_para - agora) / 60000)
        }))
        .sort((a, b) => new Date(a.agendado_para) - new Date(b.agendado_para));
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
    // SEMPRE ENVIA — não é afetado pelo toggle de pausa.
    // Após enviar o resultado, registra o lead e agenda o convite em 30 minutos.
    // O CONVITE checa a flag 'envios_sessao_pausados' antes de disparar.
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

            // Registra lead com status aguardando_convite
            try {
                const { registrarLead } = require('./db');
                await registrarLead(uid, cliente.nome, numeroFinal, null);
            } catch (err) {
                console.error('❌ Erro ao registrar lead:', err.message);
            }

            // ── AGENDA CONVITE EM 30 MINUTOS ──
            // Disparo respeita o toggle 'envios_sessao_pausados' no momento do envio.
            const TRINTA_MIN = 30 * 60 * 1000;
            const agendadoPara = Date.now() + TRINTA_MIN;

            convitesPendentes.set(uid, {
                uid,
                nome: cliente.nome,
                telefone: numeroFinal,
                agendado_para: agendadoPara
            });
            console.log(`⏳ Convite agendado para ${cliente.nome} em 30 minutos (UID: ${uid})`);

            setTimeout(async () => {
                try {
                    // Verifica flag de pausa no momento do disparo
                    const { enviosSessaoPausados, getMensagemConfig, atualizarStatusLead } = require('./db');
                    const pausado = await enviosSessaoPausados();

                    if (pausado) {
                        console.log(`⏸️  Convite para ${cliente.nome} CANCELADO — envios da sessão pausados pelo admin`);
                        convitesPendentes.delete(uid);
                        return;
                    }

                    const textoConvite = await getMensagemConfig('convite');
                    if (!textoConvite) {
                        console.error('❌ Mensagem de convite não encontrada no banco');
                        convitesPendentes.delete(uid);
                        return;
                    }
                    const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(cliente.nome)}&ref=${encodeURIComponent(numeroFinal)}`;
                    const mensagemConvite = textoConvite
                        .replace(/\{nome\}/gi, cliente.nome)
                        .replace(/\{link\}/gi, link);
                    await enviarViaGateway(numeroFinal, mensagemConvite, cliente.nome, false);
                    await atualizarStatusLead(uid, 'convite_enviado');
                    console.log(`✅ Convite enviado para ${cliente.nome} (${numeroFinal})`);
                } catch (err) {
                    console.error(`❌ Erro ao enviar convite para ${cliente.nome}:`, err.message);
                } finally {
                    convitesPendentes.delete(uid);
                }
            }, TRINTA_MIN);

        } catch (error) {
            console.error('❌ Erro WhatsApp:', error.message);
        }
    }
}

module.exports = WhatsAppNotifier;
module.exports.enviarViaGateway = enviarViaGateway;
module.exports.formatarTelefone = formatarTelefone;
module.exports.getConvitesPendentes = getConvitesPendentes;
