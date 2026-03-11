const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const config = require('../config');
const {
    listarLeads, listarSessoes, listarMensagensEnviadas, listarCancelados,
    atualizarLead, atualizarSessao,
    deletarLead, deletarSessao,
    cancelarLead, moverParaConfirmados,
    adicionarLead, adicionarSessao,
    registrarMensagem, jaEnviou
} = require('../db');
const { enviarWhatsApp } = require('../scheduler');

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
        const [leads, sessoes, mensagens, cancelados] = await Promise.all([
            listarLeads(), listarSessoes(), listarMensagensEnviadas(), listarCancelados()
        ]);
        res.json({ leads, sessoes, mensagens, cancelados });
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

router.post('/admin/enviar', autenticar, async (req, res) => {
    try {
        const { tipo, id, nome, telefone, etapa } = req.body;
        const evolutionUrl = process.env.EVOLUTION_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE;
        const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(telefone)}`;

        let mensagem = '';
        switch (etapa) {
            case 'convite':    mensagem = config.mensagens.convite(nome, link); break;
            case 'reconvite':  mensagem = config.mensagens.reconvite(nome, link); break;
            case 'link_meet':  mensagem = config.mensagens.linkMeet(nome, config.meetLink); break;
            case 'quarta':     mensagem = config.mensagens.quarta(nome); break;
            case 'sexta':      mensagem = config.mensagens.sexta(nome); break;
            case 'sabado_1h':  mensagem = config.mensagens.sabadoUmaHora(nome, config.meetLink); break;
            case 'sabado_15min': mensagem = config.mensagens.sabadoQuinzeMin(nome, config.meetLink); break;
            default: return res.status(400).json({ error: 'Etapa inválida' });
        }

        await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, mensagem);
        await registrarMensagem(id, tipo, etapa);
        console.log(`✅ Envio manual: ${etapa} para ${nome}`);
        res.json({ success: true, etapa, nome });
    } catch (err) {
        console.error('❌ Erro envio manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
