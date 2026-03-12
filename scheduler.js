const cron = require('node-cron');
const axios = require('axios');
const config = require('./config');
const {
    buscarPendentes,
    buscarParaReconvite,
    buscarConfirmadosParaSabado,
    marcarEnviado,
    registrarMensagem,
    jaEnviou
} = require('./db');
const { enfileirar } = require('./send-queue');
const { emitir, EVENTOS } = require('./monitor-events');

// Envio direto ao Evolution — sem lógica de fila aqui
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

    // ── 1. CONVITE INICIAL + RECONVITE — Seg-Sab às 13h40 ──
    cron.schedule(config.horarios.envioConvite, async () => {
        console.log('⏰ 13h40 — Verificando convites e reconvites...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'convite+reconvite' });

        const pendentes = await buscarPendentes();
        console.log(`📋 ${pendentes.length} convite(s) pendente(s)`);

        for (const r of pendentes) {
            const nome = r.nome;
            const telefone = r.telefone;
            const nomeEncoded = encodeURIComponent(nome);
            const refEncoded = encodeURIComponent(telefone);
            const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.reconvite(nome, link));
                await marcarEnviado(r.id);
                await registrarMensagem(r.id, 'whatsapp_agendados', 'convite');
                console.log(`✅ Convite enviado para ${nome}`);
            }, 'convite', nome, telefone);
        }

        const reconvites = await buscarParaReconvite();
        console.log(`📋 ${reconvites.length} reconvite(s) pendente(s)`);

        for (const r of reconvites) {
            const nome = r.nome;
            const telefone = r.telefone;
            const nomeEncoded = encodeURIComponent(nome);
            const refEncoded = encodeURIComponent(telefone);
            const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.reconvite(nome, link));
                await registrarMensagem(r.id, 'whatsapp_agendados', 'reconvite');
                console.log(`✅ Reconvite enviado para ${nome}`);
            }, 'reconvite', nome, telefone);
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'convite+reconvite', total: pendentes.length + reconvites.length });
    });

    // ── 2. QUARTA — aquecimento ──
    cron.schedule(config.horarios.quarta, async () => {
        console.log('⏰ Quarta — enviando aquecimento...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'quarta' });

        const confirmados = await buscarConfirmadosParaSabado();
        let enfileirados = 0;

        for (const r of confirmados) {
            if (await jaEnviou(r.id, 'sessoes_agendadas', 'quarta')) continue;
            const nome = r.nome;
            const telefone = r.telefone;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.quarta(nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'quarta');
                console.log(`✅ Quarta enviado para ${nome}`);
            }, 'quarta', nome, telefone);
            enfileirados++;
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'quarta', total: enfileirados });
    });

    // ── 3. SEXTA — "é amanhã" ──
    cron.schedule(config.horarios.sexta, async () => {
        console.log('⏰ Sexta — enviando "é amanhã"...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sexta' });

        const confirmados = await buscarConfirmadosParaSabado();
        let enfileirados = 0;

        for (const r of confirmados) {
            if (await jaEnviou(r.id, 'sessoes_agendadas', 'sexta')) continue;
            const nome = r.nome;
            const telefone = r.telefone;

            enfileirar(async () => {
                await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, config.mensagens.sexta(nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sexta');
                console.log(`✅ Sexta enviado para ${nome}`);
            }, 'sexta', nome, telefone);
            enfileirados++;
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sexta', total: enfileirados });
    });

    // ── 4. SÁBADO 13h — 1 hora antes ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enviando "1 hora"...');
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
                console.log(`✅ Sábado 1h enviado para ${nome}`);
            }, 'sabado_1h', nome, telefone);
            enfileirados++;
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h', total: enfileirados });
    });
}

module.exports = { iniciarScheduler, enviarWhatsApp };
