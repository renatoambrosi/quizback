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
const { emitir, EVENTOS } = require('./monitor-events');

const DELAY_ENTRE_ENVIOS = 60 * 1000; // 1 minuto

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

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
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'convites_reconvites', descricao: 'Verificando convites e reconvites' });

        // Convites iniciais
        const pendentes = await buscarPendentes();
        console.log(`📋 ${pendentes.length} convite(s) pendente(s)`);
        emitir(EVENTOS.FILA_ATUALIZADA, { job: 'convite', total: pendentes.length });

        for (const r of pendentes) {
            emitir(EVENTOS.ENVIO_INICIANDO, { job: 'convite', nome: r.nome, telefone: r.telefone });
            try {
                const nomeEncoded = encodeURIComponent(r.nome);
                const refEncoded = encodeURIComponent(r.telefone);
                const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.reconvite(r.nome, link));
                await marcarEnviado(r.id);
                await registrarMensagem(r.id, 'whatsapp_agendados', 'convite');
                console.log(`✅ Convite enviado para ${r.nome}`);
                emitir(EVENTOS.ENVIO_SUCESSO, { job: 'convite', nome: r.nome, telefone: r.telefone });
            } catch (err) {
                console.error(`❌ Erro convite ${r.nome}:`, err.message);
                emitir(EVENTOS.ENVIO_ERRO, { job: 'convite', nome: r.nome, telefone: r.telefone, erro: err.message });
            }
            emitir(EVENTOS.ENVIO_AGUARDANDO, { job: 'convite', segundos: 60 });
            await sleep(DELAY_ENTRE_ENVIOS);
        }

        // Reconvites (48h sem confirmação)
        const reconvites = await buscarParaReconvite();
        console.log(`📋 ${reconvites.length} reconvite(s) pendente(s)`);
        emitir(EVENTOS.FILA_ATUALIZADA, { job: 'reconvite', total: reconvites.length });

        for (const r of reconvites) {
            emitir(EVENTOS.ENVIO_INICIANDO, { job: 'reconvite', nome: r.nome, telefone: r.telefone });
            try {
                const nomeEncoded = encodeURIComponent(r.nome);
                const refEncoded = encodeURIComponent(r.telefone);
                const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.reconvite(r.nome, link));
                await registrarMensagem(r.id, 'whatsapp_agendados', 'reconvite');
                console.log(`✅ Reconvite enviado para ${r.nome}`);
                emitir(EVENTOS.ENVIO_SUCESSO, { job: 'reconvite', nome: r.nome, telefone: r.telefone });
            } catch (err) {
                console.error(`❌ Erro reconvite ${r.nome}:`, err.message);
                emitir(EVENTOS.ENVIO_ERRO, { job: 'reconvite', nome: r.nome, telefone: r.telefone, erro: err.message });
            }
            emitir(EVENTOS.ENVIO_AGUARDANDO, { job: 'reconvite', segundos: 60 });
            await sleep(DELAY_ENTRE_ENVIOS);
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'convites_reconvites' });
    });

    // ── 2. QUARTA — aquecimento ──
    cron.schedule(config.horarios.quarta, async () => {
        console.log('⏰ Quarta — enviando aquecimento...');
        const confirmados = await buscarConfirmadosParaSabado();
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'quarta', descricao: 'Aquecimento de quarta', total: confirmados.length });
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'quarta')) continue;
                emitir(EVENTOS.ENVIO_INICIANDO, { job: 'quarta', nome: r.nome, telefone: r.telefone });
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.quarta(r.nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'quarta');
                console.log(`✅ Quarta enviado para ${r.nome}`);
                emitir(EVENTOS.ENVIO_SUCESSO, { job: 'quarta', nome: r.nome, telefone: r.telefone });
            } catch (err) {
                console.error(`❌ Erro quarta ${r.nome}:`, err.message);
                emitir(EVENTOS.ENVIO_ERRO, { job: 'quarta', nome: r.nome, telefone: r.telefone, erro: err.message });
            }
            emitir(EVENTOS.ENVIO_AGUARDANDO, { job: 'quarta', segundos: 60 });
            await sleep(DELAY_ENTRE_ENVIOS);
        }
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'quarta' });
    });

    // ── 3. SEXTA — "é amanhã" ──
    cron.schedule(config.horarios.sexta, async () => {
        console.log('⏰ Sexta — enviando "é amanhã"...');
        const confirmados = await buscarConfirmadosParaSabado();
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sexta', descricao: 'Lembrete de sexta', total: confirmados.length });
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'sexta')) continue;
                emitir(EVENTOS.ENVIO_INICIANDO, { job: 'sexta', nome: r.nome, telefone: r.telefone });
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.sexta(r.nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sexta');
                console.log(`✅ Sexta enviado para ${r.nome}`);
                emitir(EVENTOS.ENVIO_SUCESSO, { job: 'sexta', nome: r.nome, telefone: r.telefone });
            } catch (err) {
                console.error(`❌ Erro sexta ${r.nome}:`, err.message);
                emitir(EVENTOS.ENVIO_ERRO, { job: 'sexta', nome: r.nome, telefone: r.telefone, erro: err.message });
            }
            emitir(EVENTOS.ENVIO_AGUARDANDO, { job: 'sexta', segundos: 60 });
            await sleep(DELAY_ENTRE_ENVIOS);
        }
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sexta' });
    });

    // ── 4. SÁBADO 13h — 1 hora antes ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enviando "1 hora"...');
        const confirmados = await buscarConfirmadosParaSabado();
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_1h', descricao: 'Sábado — 1 hora antes', total: confirmados.length });
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'sabado_1h')) continue;
                emitir(EVENTOS.ENVIO_INICIANDO, { job: 'sabado_1h', nome: r.nome, telefone: r.telefone });
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.sabadoUmaHora(r.nome, config.meetLink));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sabado_1h');
                console.log(`✅ Sábado 1h enviado para ${r.nome}`);
                emitir(EVENTOS.ENVIO_SUCESSO, { job: 'sabado_1h', nome: r.nome, telefone: r.telefone });
            } catch (err) {
                console.error(`❌ Erro sábado 1h ${r.nome}:`, err.message);
                emitir(EVENTOS.ENVIO_ERRO, { job: 'sabado_1h', nome: r.nome, telefone: r.telefone, erro: err.message });
            }
            emitir(EVENTOS.ENVIO_AGUARDANDO, { job: 'sabado_1h', segundos: 60 });
            await sleep(DELAY_ENTRE_ENVIOS);
        }
        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h' });
    });

}

module.exports = { iniciarScheduler, enviarWhatsApp };
