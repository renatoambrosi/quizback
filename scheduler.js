const cron = require('node-cron');
const { getMensagemConfig } = require('./db');
const { emitir, EVENTOS } = require('./monitor-events');
const { enviarViaGateway } = require('./whatsapp');

const GRUPO_SESSAO_JID = process.env.GRUPO_SESSAO_JID || '120363423552674236@g.us';

// ── HORÁRIOS (Railway roda em UTC, Brasília = UTC-3) ──
const HORARIOS = {
    quarta:       '00 10 * * 3',  // Quarta às 10h
    sexta:        '00 10 * * 5',  // Sexta às 10h
    sabado_1h:    '00 16 * * 6',  // Sábado 13h Brasília = 16h UTC
    sabado_15min: '45 16 * * 6',  // Sábado 13h45 Brasília = 16h45 UTC
};

async function enviarNoGrupo(mensagem, origem) {
    try {
        await enviarViaGateway(GRUPO_SESSAO_JID, mensagem, 'Grupo Sessão', false);
        console.log(`✅ Mensagem enfileirada para o grupo (${origem})`);
        emitir(EVENTOS.ENVIO_SUCESSO, { job: origem, nome: 'Grupo Sessão', telefone: GRUPO_SESSAO_JID });
    } catch (err) {
        console.error(`❌ Erro ao enfileirar mensagem do grupo (${origem}): ${err.message}`);
        emitir(EVENTOS.ENVIO_ERRO, { job: origem, erro: err.message });
    }
}

async function dispararMensagemGrupo(chave, origem) {
    const meetLink = process.env.GOOGLE_MEET_LINK || 'https://meet.google.com';
    let texto = await getMensagemConfig(chave);
    if (!texto) {
        console.error(`❌ Mensagem '${chave}' não encontrada no banco`);
        return;
    }
    texto = texto.replace(/\{meet_link\}/gi, meetLink);
    await enviarNoGrupo(texto, origem);
}

function iniciarScheduler() {
    console.log('⏰ Scheduler iniciado');

    cron.schedule(HORARIOS.quarta, async () => {
        console.log('⏰ Quarta 10h — enviando aquecimento no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'quarta' });
        await dispararMensagemGrupo('quarta', 'quarta');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'quarta' });
    });

    cron.schedule(HORARIOS.sexta, async () => {
        console.log('⏰ Sexta 10h — enviando aviso de amanhã no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sexta' });
        await dispararMensagemGrupo('sexta', 'sexta');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sexta' });
    });

    cron.schedule(HORARIOS.sabado_1h, async () => {
        console.log('⏰ Sábado 13h (Brasília) — enviando "falta 1 hora" no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_1h' });
        await dispararMensagemGrupo('sabado_1h', 'sabado_1h');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h' });
    });

    cron.schedule(HORARIOS.sabado_15min, async () => {
        console.log('⏰ Sábado 13h45 (Brasília) — enviando "faltam 15 minutos" no grupo...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_15min' });
        await dispararMensagemGrupo('sabado_15min', 'sabado_15min');
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_15min' });
    });
}

module.exports = { iniciarScheduler, dispararMensagemGrupo, enviarNoGrupo };
