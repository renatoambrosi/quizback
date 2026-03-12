const cron = require('node-cron');
const axios = require('axios');
const config = require('./config');
const {
    buscarPendentes,
    buscarConfirmadosParaSabado,
    moverTodosNaoConfirmadosParaPassados,
    marcarEnviado,
    registrarMensagem,
    jaEnviou
} = require('./db');
const { enfileirar } = require('./send-queue');
const { emitir, EVENTOS } = require('./monitor-events');

async function enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, mensagem) {
    const instanceEncoded = encodeURIComponent(instance);
    await axios.post(
        `${evolutionUrl}/message/sendText/${instanceEncoded}`,
        { number: telefone, text: mensagem },
        { headers: { 'apikey': apiKey, 'Content-Type': 'application/json' } }
    );
}

function iniciarScheduler(evolutionUrl, apiKey, instance) {
    console.log('⏰ Scheduler de WhatsApp iniciado');

    // ── 1. CONVITE — Seg-Sab às 13h40 ──
    cron.schedule(config.horarios.envioConvite, async () => {
        console.log('⏰ 13h40 — Verificando convites...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'convite' });

        const pendentes = await buscarPendentes();
        console.log(`📋 ${pendentes.length} convite(s) pendente(s)`);

        for (const r of pendentes) {
            const nome = r.nome;
            const telefone = r.telefone;
            const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(telefone)}`;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.reconvite(nome, link));
                await marcarEnviado(r.id);
                await registrarMensagem(r.id, 'whatsapp_agendados', 'convite');
                console.log(`✅ Convite enviado para ${nome}`);
            }, 'convite', nome, telefone);
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'convite', total: pendentes.length });
    });

    // ── 2. SÁBADO 13h — link 1 hora antes ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enviando link Meet...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_1h' });

        const confirmados = await buscarConfirmadosParaSabado();
        let enfileirados = 0;

        for (const r of confirmados) {
            if (await jaEnviou(r.id, 'sessoes_agendadas', 'sabado_1h')) continue;
            const nome = r.nome;
            const telefone = r.telefone;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.sabadoUmaHora(nome, config.meetLink));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sabado_1h');
                console.log(`✅ Link Meet enviado para ${nome}`);
            }, 'sabado_1h', nome, telefone);
            enfileirados++;
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h', total: enfileirados });
    });

    // ── 3. SÁBADO 14h — fecha janela, move não-confirmados para passados ──
    cron.schedule('00 14 * * 6', async () => {
        console.log('⏰ Sábado 14h — fechando janela, movendo não-confirmados para passados...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'fechar_janela' });
        try {
            const total = await moverTodosNaoConfirmadosParaPassados();
            emitir(EVENTOS.SCHEDULER_FIM, { job: 'fechar_janela', total });
        } catch (err) {
            console.error('❌ Erro ao fechar janela:', err.message);
        }
    });
}

module.exports = { iniciarScheduler, enviarWhatsApp };
