const cron = require('node-cron');
const config = require('./config');
const {
    buscarPendentes,
    buscarConfirmadosParaSabado,
    moverTodosNaoConfirmadosParaPassados,
    marcarEnviado,
    registrarMensagem,
    jaEnviou
} = require('./db');
const { emitir, EVENTOS } = require('./monitor-events');
const { enviarViaGateway, formatarTelefone } = require('./whatsapp');

// ── ENVIAR VIA GATEWAY (fila normal) ──
async function enviarNaFila(telefone, mensagem, nome, origem) {
    const numero = formatarTelefone(telefone);
    await enviarViaGateway(numero, mensagem, nome, false); // false = vai para a fila
    emitir(EVENTOS.ENVIO_SUCESSO, { job: origem, nome, telefone: numero });
}

function iniciarScheduler() {
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

            try {
                await enviarNaFila(telefone, config.mensagens.reconvite(nome, link), nome, 'convite');
                await marcarEnviado(r.id);
                await registrarMensagem(r.id, 'whatsapp_agendados', 'convite');
                console.log(`📥 Convite enfileirado para ${nome}`);
            } catch (err) {
                console.error(`❌ Erro ao enfileirar convite para ${nome}:`, err.message);
            }
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'convite', total: pendentes.length });
    });

    // ── 2. SÁBADO 13h — link 1 hora antes ──
    cron.schedule(config.horarios.sabadoUmaHora, async () => {
        console.log('⏰ Sábado 13h — enfileirando link Meet...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'sabado_1h' });

        const confirmados = await buscarConfirmadosParaSabado();
        let enfileirados = 0;

        for (const r of confirmados) {
            if (await jaEnviou(r.id, 'sessoes_agendadas', 'sabado_1h')) continue;
            const nome = r.nome;
            const telefone = r.telefone;

            try {
                await enviarNaFila(telefone, config.mensagens.sabadoUmaHora(nome, config.meetLink), nome, 'sabado_1h');
                await registrarMensagem(r.id, 'sessoes_agendadas', 'sabado_1h');
                console.log(`📥 Link Meet enfileirado para ${nome}`);
                enfileirados++;
            } catch (err) {
                console.error(`❌ Erro ao enfileirar link Meet para ${nome}:`, err.message);
            }
        }

        emitir(EVENTOS.SCHEDULER_FIM, { job: 'sabado_1h', total: enfileirados });
    });

    // ── 3. SÁBADO 14h — fecha janela ──
    cron.schedule('00 14 * * 6', async () => {
        console.log('⏰ Sábado 14h — fechando janela...');
        emitir(EVENTOS.SCHEDULER_INICIO, { job: 'fechar_janela' });
        try {
            const total = await moverTodosNaoConfirmadosParaPassados();
            emitir(EVENTOS.SCHEDULER_FIM, { job: 'fechar_janela', total });
        } catch (err) {
            console.error('❌ Erro ao fechar janela:', err.message);
        }
    });
}

module.exports = { iniciarScheduler };
