const cron = require('node-cron');
const config = require('./config');
const { emitir, EVENTOS } = require('./monitor-events');
const { enviarViaGateway } = require('./whatsapp');
const axios = require('axios');

// ── ENVIAR MENSAGEM PARA O GRUPO VIA EVOLUTION API ──
async function enviarNoGrupo(mensagem, origem) {
    const evolutionUrl = process.env.EVOLUTION_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = encodeURIComponent(process.env.EVOLUTION_INSTANCE);
    const jid = config.grupoSessaoJid;

    try {
        await axios.post(
            `${evolutionUrl}/message/sendText/${instance}`,
            {
                number: jid,
                text: mensagem,
            },
            {
                headers: { apikey: apiKey, 'Content-Type': 'application/json' },
                timeout: 10000,
            }
        );
        console.log(`✅ Mensagem enviada no grupo (${origem})`);
        emitir(EVENTOS.ENVIO_SUCESSO, { job: origem, nome: 'Grupo Sessão', telefone: jid });
    } catch (err) {
        const detalhe = err.response?.data ? JSON.stringify(err.response.data) : err.message;
        console.error(`❌ Erro ao enviar no grupo (${origem}): ${detalhe}`);
        emitir(EVENTOS.ENVIO_ERRO, { job: origem, erro: detalhe });
    }
}

function iniciarScheduler() {
    console.log('⏰ Scheduler iniciado');

    // ── QUARTA às 10h — aquecimento no grupo ──
    cron.schedule(config.horarios.quarta, async () => {
        console.log('⏰ Quarta 10h — enviando aquecimento no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'quarta' });
        await enviarNoGrupo(config.mensagens.quarta(), 'quarta');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'quarta' });
    });

    // ── SEXTA às 10h — "é amanhã" no grupo ──
    cron.schedule(config.horarios.sexta, async () => {
        console.log('⏰ Sexta 10h — enviando aviso de amanhã no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sexta' });
        await enviarNoGrupo(config.mensagens.sexta(), 'sexta');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sexta' });
    });

    // ── SÁBADO 13h — falta 1 hora no grupo ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enviando "falta 1 hora" no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_1h' });
        await enviarNoGrupo(config.mensagens.sabadoUmaHora(config.meetLink), 'sabado_1h');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h' });
    });

    // ── SÁBADO 13h45 — faltam 15 minutos no grupo ──
    cron.schedule(config.horarios.sabadoQuinzeMin, async () => {
        console.log('⏰ Sábado 13h45 — enviando "faltam 15 minutos" no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_15min' });
        await enviarNoGrupo(config.mensagens.sabadoQuinzeMin(config.meetLink), 'sabado_15min');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_15min' });
    });
}

module.exports = { iniciarScheduler };
