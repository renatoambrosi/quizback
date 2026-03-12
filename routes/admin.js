const express = require('express');
const router = express.Router();
const path = require('path');
const config = require('../config');
const {
    listarLeads, listarSessoes, listarMensagensEnviadas, listarCancelados, listarPassados,
    atualizarLead, atualizarSessao,
    deletarLead, deletarSessao, deletarPassado,
    cancelarLead, moverParaConfirmados,
    reativarCancelado, reativarPassado,
    adicionarLead, adicionarSessao,
    registrarMensagem
} = require('../db');
const { enviarWhatsApp } = require('../scheduler');
const { enfileirar, tamanhoFila } = require('../send-queue');
const { emitir, EVENTOS, registrarCliente } = require('../monitor-events');

function autenticar(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Acesso negado');
    }
    const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Usuário ou senha incorretos');
}

router.get('/admin', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '../admin.html'));
});

router.get('/admin/dados', autenticar, async (req, res) => {
    try {
        const [leads, sessoes, mensagens, cancelados, passados] = await Promise.all([
            listarLeads(), listarSessoes(), listarMensagensEnviadas(), listarCancelados(), listarPassados()
        ]);
        res.json({ leads, sessoes, mensagens, cancelados, passados });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/admin/lead/:id', autenticar, async (req, res) => {
    try {
        await atualizarLead(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/admin/sessao/:id', autenticar, async (req, res) => {
    try {
        await atualizarSessao(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/lead/:id', autenticar, async (req, res) => {
    try {
        await deletarLead(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/sessao/:id', autenticar, async (req, res) => {
    try {
        await deletarSessao(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/passado/:id', autenticar, async (req, res) => {
    try {
        await deletarPassado(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/cancelar/:id', autenticar, async (req, res) => {
    try {
        await cancelarLead(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/mover/:id', autenticar, async (req, res) => {
    try {
        const sessaoId = await moverParaConfirmados(req.params.id);
        res.json({ success: true, sessaoId });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reativar cancelado → semana vigente (convite já feito, enviado=TRUE)
router.post('/admin/reativar-cancelado/:id', autenticar, async (req, res) => {
    try {
        await reativarCancelado(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Reativar passado → semana vigente (convite já feito, enviado=TRUE)
router.post('/admin/reativar-passado/:id', autenticar, async (req, res) => {
    try {
        await reativarPassado(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/adicionar-lead', autenticar, async (req, res) => {
    try {
        const { nome, telefone, email } = req.body;
        if (!nome || !telefone) return res.status(400).json({ error: 'Nome e telefone obrigatórios' });
        const id = await adicionarLead(null, nome, telefone, email);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/adicionar-sessao', autenticar, async (req, res) => {
    try {
        const { nome, telefone, data_sessao } = req.body;
        if (!nome || !telefone || !data_sessao) return res.status(400).json({ error: 'Nome, telefone e data obrigatórios' });
        const id = await adicionarSessao(nome, telefone, data_sessao);
        res.json({ success: true, id });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// Envio manual — passa pela fila (exceto resultado do teste que usa whatsapp.js diretamente)
router.post('/admin/enviar', autenticar, async (req, res) => {
    try {
        const { tipo, id, nome, telefone, etapa } = req.body;
        const evolutionUrl = process.env.EVOLUTION_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE;
        const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(telefone)}`;

        let mensagem = '';
        switch (etapa) {
            case 'convite':   mensagem = config.mensagens.reconvite(nome, link); break;
            case 'link_meet': mensagem = config.mensagens.linkMeet(nome, config.meetLink); break;
            case 'confirmacao': mensagem = config.mensagens.confirmacao(nome, 'próximo sábado'); break;
            case 'sabado_1h': mensagem = config.mensagens.sabadoUmaHora(nome, config.meetLink); break;
            default: return res.status(400).json({ error: 'Etapa inválida' });
        }

        const info = enfileirar(async () => {
            await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, mensagem);
            await registrarMensagem(id, tipo, etapa);
            console.log(`✅ Envio manual: ${etapa} para ${nome}`);

            // Se convite para cancelado → reativa automaticamente
            if (etapa === 'convite' && tipo === 'cancelados') {
                const { reativarCancelado } = require('../db');
                await reativarCancelado(id).catch(e => console.error('Erro reativar cancelado:', e.message));
            }
            // Se convite para passado → reativa automaticamente
            if (etapa === 'convite' && tipo === 'passados') {
                const { reativarPassado } = require('../db');
                await reativarPassado(id).catch(e => console.error('Erro reativar passado:', e.message));
            }
        }, etapa, nome, telefone);

        res.json({ success: true, etapa, nome, posicao: info.posicao, imediato: info.imediato });
    } catch (err) {
        console.error('❌ Erro envio manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// SSE — monitor em tempo real
router.get('/admin/monitor/stream', autenticar, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    registrarCliente(res);
});

module.exports = router;
