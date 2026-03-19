const express = require('express');
const router = express.Router();
const path = require('path');
const axios = require('axios');
const config = require('../config');
const {
    listarLeads, listarSessoes, listarMensagensEnviadas, listarCancelados, listarPassados,
    atualizarLead, atualizarSessao,
    deletarLead, deletarSessao, deletarPassado, deletarCancelado,
    cancelarLead, moverParaPassados,
    reativarCancelado, reativarPassado,
    adicionarLead, adicionarSessao,
    registrarMensagem, registrarLead,
} = require('../db');
const { emitir, EVENTOS, registrarCliente } = require('../monitor-events');
const { enviarViaGateway, formatarTelefone } = require('../whatsapp');

function gatewayHeaders() {
    return { 'x-gateway-token': process.env.GATEWAY_TOKEN };
}

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

// ── PAINEL ──

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

// ── LEADS ──

router.put('/admin/lead/:id', autenticar, async (req, res) => {
    try {
        await atualizarLead(req.params.id, req.body);
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

router.post('/admin/cancelar/:id', autenticar, async (req, res) => {
    try {
        await cancelarLead(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/mover-passado/:id', autenticar, async (req, res) => {
    try {
        await moverParaPassados(req.params.id);
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

// ── SESSOES ──

router.put('/admin/sessao/:id', autenticar, async (req, res) => {
    try {
        await atualizarSessao(req.params.id, req.body);
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

// ── CANCELADOS ──

router.post('/admin/reativar-cancelado/:id', autenticar, async (req, res) => {
    try {
        await reativarCancelado(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/admin/cancelados/:id', autenticar, async (req, res) => {
    try {
        await deletarCancelado(req.params.id);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PASSADOS ──

router.post('/admin/reativar-passado/:id', autenticar, async (req, res) => {
    try {
        await reativarPassado(req.params.id);
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

// ── ENVIO MANUAL ──

router.post('/admin/enviar', autenticar, async (req, res) => {
    try {
        const { nome, telefone, etapa } = req.body;
        const numero = formatarTelefone(telefone);
        const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(numero)}`;

        let mensagem = '';
        switch (etapa) {
            case 'convite':      mensagem = config.mensagens.convite(nome, link); break;
            case 'confirmacao':  mensagem = config.mensagens.confirmacao(nome, config.grupoSessaoLink); break;
            default: return res.status(400).json({ error: 'Etapa inválida' });
        }

        const resp = await enviarViaGateway(numero, mensagem, nome, false);
        res.json({ success: true, etapa, nome, posicao: resp?.posicao || 1 });
    } catch (err) {
        console.error('❌ Erro envio manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── FILA — proxy para o gateway ──

router.get('/admin/fila', autenticar, async (req, res) => {
    try {
        const resp = await axios.get(`${process.env.GATEWAY_URL}/fila`, { headers: gatewayHeaders(), timeout: 5000 });
        res.json(resp.data);
    } catch (err) {
        res.status(500).json({ error: 'Gateway indisponível', detalhe: err.message });
    }
});

router.delete('/admin/fila/:id', autenticar, async (req, res) => {
    try {
        const resp = await axios.delete(`${process.env.GATEWAY_URL}/fila/${req.params.id}`, { headers: gatewayHeaders(), timeout: 5000 });
        res.json(resp.data);
    } catch (err) {
        const status = err.response?.status || 500;
        res.status(status).json({ error: err.response?.data?.error || err.message });
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
