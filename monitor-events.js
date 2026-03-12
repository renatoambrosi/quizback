// ============================================
// MONITOR-EVENTS.JS — Canal SSE para o painel
// ============================================

const clients = new Set();

// Tipos de evento
const EVENTOS = {
    SCHEDULER_INICIO:   'scheduler_inicio',
    SCHEDULER_FIM:      'scheduler_fim',
    ENVIO_INICIANDO:    'envio_iniciando',
    ENVIO_SUCESSO:      'envio_sucesso',
    ENVIO_ERRO:         'envio_erro',
    ENVIO_AGUARDANDO:   'envio_aguardando',
    INSTANCIA_STATUS:   'instancia_status',
    FILA_ATUALIZADA:    'fila_atualizada',
};

function emitir(tipo, dados = {}) {
    const payload = JSON.stringify({
        tipo,
        ts: new Date().toISOString(),
        ...dados
    });
    for (const res of clients) {
        try {
            res.write(`data: ${payload}\n\n`);
        } catch (_) {
            clients.delete(res);
        }
    }
}

function registrarCliente(res) {
    clients.add(res);
    res.on('close', () => clients.delete(res));
}

module.exports = { emitir, registrarCliente, EVENTOS };
