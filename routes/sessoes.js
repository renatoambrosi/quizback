const express = require('express');
const router = express.Router();
const axios = require('axios');
const { salvarSessaoAgendada } = require('../db');

// ============================================
// UTILITÁRIO — próximo sábado a partir de amanhã
// ============================================

function proximoSabado() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    const diasParaSabado = (6 - amanha.getDay() + 7) % 7;
    const sabado = new Date(amanha);
    sabado.setDate(amanha.getDate() + diasParaSabado);
    return sabado;
}

function formatarDataPtBR(data) {
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `${data.getDate()} de ${meses[data.getMonth()]}`;
}

// ============================================
// POST /api/agendar-sessao
// ============================================

router.post('/agendar-sessao', async (req, res) => {
    try {
        const { nome, telefone } = req.body;

        if (!nome || !telefone) {
            return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
        }

        const numero = String(telefone).replace(/\D/g, '');
        const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`;

        const sabado = proximoSabado();
        const dataFormatada = formatarDataPtBR(sabado);
        const dataSessaoISO = sabado.toISOString().split('T')[0];

        // 1. Salvar no banco
        await salvarSessaoAgendada(nome, numeroFinal, dataSessaoISO);

        // 2. WhatsApp de confirmação
        const evolutionUrl = process.env.EVOLUTION_URL;
        const apiKey = process.env.EVOLUTION_API_KEY;
        const instance = process.env.EVOLUTION_INSTANCE;
        const instanceEncoded = encodeURIComponent(instance);

        const mensagemConfirmacao = `Olá, ${nome}! 🎉\n\nSua vaga na Sessão de Diagnóstico está confirmada!\n\n📅 Sábado, ${dataFormatada} às 14h\n👤 ${nome}\n📱 ${telefone}\n\nVocê receberá o link para entrar na sessão aqui pelo WhatsApp na véspera. Qualquer dúvida, é só falar comigo!\n\nAté sábado! 🌟\n— Suellen Seragi`;

        try {
            await axios.post(
                `${evolutionUrl}/message/sendText/${instanceEncoded}`,
                { number: numeroFinal, text: mensagemConfirmacao },
                { headers: { 'apikey': apiKey, 'Content-Type': 'application/json' } }
            );
            console.log(`✅ WhatsApp de confirmação enviado para ${nome} (${numeroFinal})`);
        } catch (err) {
            console.error('❌ Erro ao enviar WhatsApp de confirmação:', err.message);
        }

        // 3. Pushover
        try {
            await axios.post('https://api.pushover.net/1/messages.json', {
                token: 'axfum4x76e38hzuuxjrkb3sh2febbw',
                user: process.env.PUSHOVER_USER_KEY,
                title: '🗓️ Nova Sessão Confirmada!',
                message: `${nome} confirmou presença na Sessão de Diagnóstico\n📅 Sábado ${dataFormatada} às 14h\n📱 ${telefone}`,
                sound: 'Agendamento', // <-- Use o nome exatamente como aparece no seu painel
                priority: 1
            });
            console.log(`🔔 Pushover enviado para agendamento de ${nome}`);
        } catch (err) {
            console.error('❌ Erro ao enviar Pushover:', err.message);
        }

        return res.status(200).json({
            success: true,
            nome,
            telefone,
            data: `Sábado, ${dataFormatada} às 14h`
        });

    } catch (error) {
        console.error('❌ Erro em /agendar-sessao:', error.message);
        return res.status(500).json({ error: 'Erro interno ao agendar sessão' });
    }
});

module.exports = router;
