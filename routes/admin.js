const express = require('express');
const router = express.Router();
const axios = require('axios');
const path = require('path');
const config = require('../config');
const {
    listarLeads,
    listarSessoes,
    listarMensagensEnviadas,
    atualizarLead,
    atualizarSessao,
    registrarMensagem,
    jaEnviou
} = require('../db');
const { enviarWhatsApp } = require('../scheduler');

// ── AUTENTICAÇÃO BÁSICA ──
function autenticar(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin"');
        return res.status(401).send('Acesso negado');
    }
    const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASSWORD) {
        return next();
    }
    res.set('WWW-Authenticate', 'Basic realm="Admin"');
    return res.status(401).send('Usuário ou senha incorretos');
}

// ── PAINEL HTML ──
router.get('/admin', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '../admin.html'));
});

// ── DADOS ──
router.get('/admin/dados', autenticar, async (req, res) => {
    try {
        const [leads, sessoes, mensagens] = await Promise.all([
            listarLeads(),
            listarSessoes(),
            listarMensagensEnviadas()
        ]);
        res.json({ leads, sessoes, mensagens });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── EDITAR LEAD ──
router.put('/admin/lead/:id', autenticar, async (req, res) => {
    try {
        await atualizarLead(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── EDITAR SESSÃO ──
router.put('/admin/sessao/:id', autenticar, async (req, res) => {
    try {
        await atualizarSessao(req.params.id, req.body);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── ENVIO MANUAL DE ETAPA ──
router.post('/admin/enviar', autenticar, async (req, res) => {
    try {
        const { tipo, id, nome, telefone, etapa } = req.body;
        const evolutionUrl = process.env.EVOLUTION_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE;

        // Monta a mensagem conforme etapa
        let mensagem = '';
        const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(telefone)}`;

        switch (etapa) {
            case 'convite':
                mensagem = config.mensagens.reconvite(nome, link);
                break;
            case 'reconvite':
                mensagem = config.mensagens.reconvite(nome, link);
                break;
            case 'link_meet':
                mensagem = config.mensagens.linkMeet(nome, config.meetLink);
                break;
            case 'quarta':
                mensagem = config.mensagens.quarta(nome);
                break;
            case 'sexta':
                mensagem = config.mensagens.sexta(nome);
                break;
            case 'sabado_1h':
                mensagem = config.mensagens.sabadoUmaHora(nome, config.meetLink);
                break;
            case 'sabado_15min':
                mensagem = config.mensagens.sabadoQuinzeMin(nome, config.meetLink);
                break;
            default:
                return res.status(400).json({ error: 'Etapa inválida' });
        }

        await enviarWhatsApp(evolutionUrl, apiKey, instance, telefone, mensagem);
        await registrarMensagem(id, tipo, etapa);

        console.log(`✅ Envio manual: ${etapa} para ${nome} (${telefone})`);
        res.json({ success: true, etapa, nome });

    } catch (err) {
        console.error('❌ Erro envio manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
