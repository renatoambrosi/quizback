// ============================================
// SEND-QUEUE.JS — Gargalo único de envios
// Todo envio (scheduler + manual) passa aqui.
// 1 mensagem por minuto, na ordem de chegada.
// EXCEÇÃO: resultado do teste (whatsapp.js) —
// transacional, sai direto, fora desta fila.
// ============================================

const { emitir, EVENTOS } = require('./monitor-events');

const COOLDOWN = 60 * 1000; // 1 minuto

const fila = [];
let processando = false;
let ultimoEnvio = 0;

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Enfileira um envio.
 * @param {Function} tarefa   async () => void
 * @param {string}   origem   Label para o monitor
 * @param {string}   nome     Destinatário
 * @param {string}   telefone
 * @returns {Promise<{posicao: number, imediato: boolean}>}
 */
function enfileirar(tarefa, origem = 'manual', nome = '', telefone = '') {
    const imediato = fila.length === 0 && !processando && (Date.now() - ultimoEnvio) >= COOLDOWN;
    const posicao = fila.length + (processando ? 2 : 1);

    fila.push({ tarefa, origem, nome, telefone });

    emitir(EVENTOS.FILA_ATUALIZADA, {
        job: origem,
        total: fila.length,
        descricao: `Fila: ${fila.length} item(s) pendente(s)`
    });

    _processar();

    return { posicao, imediato };
}

async function _processar() {
    if (processando) return;
    if (!fila.length) return;

    processando = true;

    while (fila.length > 0) {
        const agora = Date.now();
        const espera = COOLDOWN - (agora - ultimoEnvio);

        if (espera > 0 && ultimoEnvio > 0) {
            const seg = Math.ceil(espera / 1000);
            emitir(EVENTOS.ENVIO_AGUARDANDO, {
                job: fila[0].origem,
                nome: fila[0].nome,
                segundos: seg
            });
            await sleep(espera);
        }

        const item = fila.shift();

        emitir(EVENTOS.FILA_ATUALIZADA, {
            job: item.origem,
            total: fila.length,
            descricao: `Fila: ${fila.length} item(s) restante(s)`
        });

        emitir(EVENTOS.ENVIO_INICIANDO, {
            job: item.origem,
            nome: item.nome,
            telefone: item.telefone
        });

        try {
            await item.tarefa();
            ultimoEnvio = Date.now();
            emitir(EVENTOS.ENVIO_SUCESSO, {
                job: item.origem,
                nome: item.nome,
                telefone: item.telefone
            });
        } catch (err) {
            ultimoEnvio = Date.now();
            emitir(EVENTOS.ENVIO_ERRO, {
                job: item.origem,
                nome: item.nome,
                telefone: item.telefone,
                erro: err.message
            });
            console.error(`❌ [send-queue] Erro ao enviar para ${item.nome}:`, err.message);
        }
    }

    processando = false;
}

function tamanhoFila() {
    return fila.length + (processando ? 1 : 0);
}

module.exports = { enfileirar, tamanhoFila };
