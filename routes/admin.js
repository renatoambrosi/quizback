const express = require('express');
const router = express.Router();
const path = require('path');
const axios = require('axios');
const {
    listarLeads, listarSessoes, listarMensagensEnviadas, listarCancelados, listarPassados,
    listarMensagensConfig, atualizarMensagemConfig, getMensagemConfig,
    atualizarLead, atualizarSessao,
    deletarLead, deletarSessao, deletarPassado, deletarCancelado,
    cancelarLead, moverParaPassados,
    reativarCancelado, reativarPassado,
    adicionarLead, adicionarSessao,
    registrarMensagem,
} = require('../db');
const { emitir, EVENTOS, registrarCliente } = require('../monitor-events');
const { enviarViaGateway, formatarTelefone } = require('../whatsapp');
const { dispararMensagemGrupo, enviarNoGrupo } = require('../scheduler');

// ── TEXTO FIXO — SEGUNDA CHAMADA ──
const SEGUNDA_CHAMADA_TEXTO = (nome, grupoLink) =>
    `Olá, ${nome}! 🌟\n\nAinda dá tempo de participar da Sessão de Diagnóstico GRATUITA do Teste de Prosperidade que você confirmou presença!\n\nSem entrar no grupo você não vai conseguir participar. Entra agora:\n\n👉 ${grupoLink}\n\nTe esperamos lá! 💛\n— Suellen Seragi`;

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
        const [leads, sessoes, mensagens, cancelados, passados, mensagensConfig] = await Promise.all([
            listarLeads(), listarSessoes(), listarMensagensEnviadas(),
            listarCancelados(), listarPassados(), listarMensagensConfig()
        ]);
        res.json({ leads, sessoes, mensagens, cancelados, passados, mensagensConfig });
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

// ── ENVIO MANUAL INDIVIDUAL ──

router.post('/admin/enviar', autenticar, async (req, res) => {
    try {
        const { nome, telefone, etapa } = req.body;
        if (!nome || !telefone || !etapa) return res.status(400).json({ error: 'Dados incompletos' });

        const numero = formatarTelefone(telefone);
        const grupoLink = process.env.GRUPO_SESSAO_LINK;
        if (!grupoLink) {
            console.error('❌ GRUPO_SESSAO_LINK não configurado no Railway');
            return res.status(500).json({ error: 'Link do grupo não configurado. Adicione GRUPO_SESSAO_LINK nas variáveis do Railway.' });
        }

        let mensagem;

        if (etapa === 'segunda_chamada') {
            mensagem = SEGUNDA_CHAMADA_TEXTO(nome, grupoLink);
        } else {
            const link = `https://agendamento.suellenseragi.com.br?name=${encodeURIComponent(nome)}&ref=${encodeURIComponent(numero)}`;
            let textoBase = await getMensagemConfig(etapa);
            if (!textoBase) return res.status(400).json({ error: `Mensagem '${etapa}' não encontrada` });
            mensagem = textoBase
                .replace(/\{nome\}/gi, nome)
                .replace(/\{link\}/gi, link)
                .replace(/\{grupo_link\}/gi, grupoLink);
        }

        const resp = await enviarViaGateway(numero, mensagem, nome, false);
        res.json({ success: true, etapa, nome, posicao: resp?.posicao || 1 });
    } catch (err) {
        console.error('❌ Erro envio manual:', err.message);
        res.status(500).json({ error: err.message });
    }
});

// ── MENSAGENS CONFIG ──

router.put('/admin/mensagem/:chave', autenticar, async (req, res) => {
    try {
        const { texto } = req.body;
        if (!texto) return res.status(400).json({ error: 'Texto obrigatório' });
        await atualizarMensagemConfig(req.params.chave, texto);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── DISPARO MANUAL PARA O GRUPO ──

router.post('/admin/grupo/disparar/:chave', autenticar, async (req, res) => {
    try {
        await dispararMensagemGrupo(req.params.chave, `manual_${req.params.chave}`);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/admin/grupo/livre', autenticar, async (req, res) => {
    try {
        const { mensagem } = req.body;
        if (!mensagem) return res.status(400).json({ error: 'Mensagem obrigatória' });
        await enviarNoGrupo(mensagem, 'manual_livre');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── PARTICIPANTES DO GRUPO ──

router.get('/admin/grupo/participantes', autenticar, async (req, res) => {
    try {
        const evolutionUrl = process.env.EVOLUTION_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = encodeURIComponent(process.env.EVOLUTION_INSTANCE);
        const jid = process.env.GRUPO_SESSAO_JID || '120363423552674236@g.us';

        const resp = await axios.get(
            `${evolutionUrl}/group/participants/${instance}`,
            { params: { groupJid: jid }, headers: { apikey: apiKey }, timeout: 10000 }
        );

        const participants = resp.data?.participants || [];
        const numeros = participants.map(p => {
            const phone = p.phoneNumber || p.id || '';
            return phone.replace('@s.whatsapp.net', '').replace('@c.us', '').replace('@lid', '');
        }).filter(n => n && !n.includes('@'));

        res.json({ success: true, participantes: numeros });
    } catch (err) {
        console.error('❌ Erro ao buscar participantes:', err.message);
        res.status(500).json({ error: 'Erro ao buscar participantes do grupo', detalhe: err.message });
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

router.get('/admin/monitor/stream', autenticar, (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    registrarCliente(res);
});

module.exports = router;
