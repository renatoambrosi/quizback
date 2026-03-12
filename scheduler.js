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

        // Convites iniciais
        const pendentes = await buscarPendentes();
        console.log(`📋 ${pendentes.length} convite(s) pendente(s)`);
        for (const r of pendentes) {
            try {
                const nomeEncoded = encodeURIComponent(r.nome);
                const refEncoded = encodeURIComponent(r.telefone);
                const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.reconvite(r.nome, link));
                await marcarEnviado(r.id);
                await registrarMensagem(r.id, 'whatsapp_agendados', 'convite');
                console.log(`✅ Convite enviado para ${r.nome}`);
            } catch (err) {
                console.error(`❌ Erro convite ${r.nome}:`, err.message);
            }
            await sleep(DELAY_ENTRE_ENVIOS);
        }

        // Reconvites (48h sem confirmação)
        const reconvites = await buscarParaReconvite();
        console.log(`📋 ${reconvites.length} reconvite(s) pendente(s)`);
        for (const r of reconvites) {
            try {
                const nomeEncoded = encodeURIComponent(r.nome);
                const refEncoded = encodeURIComponent(r.telefone);
                const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.reconvite(r.nome, link));
                await registrarMensagem(r.id, 'whatsapp_agendados', 'reconvite');
                console.log(`✅ Reconvite enviado para ${r.nome}`);
            } catch (err) {
                console.error(`❌ Erro reconvite ${r.nome}:`, err.message);
            }
            await sleep(DELAY_ENTRE_ENVIOS);
        }
    });

    // ── 2. QUARTA — aquecimento ──
    cron.schedule(config.horarios.quarta, async () => {
        console.log('⏰ Quarta — enviando aquecimento...');
        const confirmados = await buscarConfirmadosParaSabado();
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'quarta')) continue;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.quarta(r.nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'quarta');
                console.log(`✅ Quarta enviado para ${r.nome}`);
            } catch (err) {
                console.error(`❌ Erro quarta ${r.nome}:`, err.message);
            }
            await sleep(DELAY_ENTRE_ENVIOS);
        }
    });

    // ── 3. SEXTA — "é amanhã" ──
    cron.schedule(config.horarios.sexta, async () => {
        console.log('⏰ Sexta — enviando "é amanhã"...');
        const confirmados = await buscarConfirmadosParaSabado();
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'sexta')) continue;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.sexta(r.nome));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sexta');
                console.log(`✅ Sexta enviado para ${r.nome}`);
            } catch (err) {
                console.error(`❌ Erro sexta ${r.nome}:`, err.message);
            }
            await sleep(DELAY_ENTRE_ENVIOS);
        }
    });

    // ── 4. SÁBADO 13h — 1 hora antes ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enviando "1 hora"...');
        const confirmados = await buscarConfirmadosParaSabado();
        for (const r of confirmados) {
            try {
                if (await jaEnviou(r.id, 'sessoes_agendadas', 'sabado_1h')) continue;
                await enviarWhatsApp(evolutionUrl, apiKey, instance, r.telefone, config.mensagens.sabadoUmaHora(r.nome, config.meetLink));
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sabado_1h');
                console.log(`✅ Sábado 1h enviado para ${r.nome}`);
            } catch (err) {
                console.error(`❌ Erro sábado 1h ${r.nome}:`, err.message);
            }
            await sleep(DELAY_ENTRE_ENVIOS);
        }
    });


}

module.exports = { iniciarScheduler, enviarWhatsApp };
