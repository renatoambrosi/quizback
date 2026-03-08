const express = require('express');
const router = express.Router();
const axios = require('axios');
const config = require('../config');
const { salvarSessaoAgendada, registrarMensagem } = require('../db');

function proximoSabado() {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(hoje.getDate() + 1);
    amanha.setHours(0, 0, 0, 0);
    const dias = (6 - amanha.getDay() + 7) % 7;
    const sabado = new Date(amanha);
    sabado.setDate(amanha.getDate() + dias);
    return sabado;
}

function formatarDataPtBR(data) {
    const meses = ['janeiro','fevereiro','março','abril','maio','junho','julho','agosto','setembro','outubro','novembro','dezembro'];
    return `Sábado, ${data.getDate()} de ${meses[data.getMonth()]}`;
}

async function enviarWhatsApp(telefone, mensagem) {
    const evolutionUrl = process.env.EVOLUTION_URL;
    const apiKey = process.env.EVOLUTION_API_KEY;
    const instance = process.env.EVOLUTION_INSTANCE;
    const instanceEncoded = encodeURIComponent(instance);
    await axios.post(
        `${evolutionUrl}/message/sendText/${instanceEncoded}`,
        { number: telefone, text: mensagem },
        { headers: { 'apikey': apiKey, 'Content-Type': 'application/json' } }
    );
}

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
        const sessaoId = await salvarSessaoAgendada(nome, numeroFinal, dataSessaoISO);

        // 2. WhatsApp de confirmação imediato
        try {
            await enviarWhatsApp(numeroFinal, config.mensagens.confirmacao(nome, dataFormatada));
            await registrarMensagem(sessaoId, 'sessoes_agendadas', 'confirmacao');
            console.log(`✅ Confirmação enviada para ${nome}`);
        } catch (err) {
            console.error('❌ Erro confirmação WhatsApp:', err.message);
        }

        // 3. Link do Meet — 5 minutos depois
        setTimeout(async () => {
            try {
                await enviarWhatsApp(numeroFinal, config.mensagens.linkMeet(nome, config.meetLink));
                await registrarMensagem(sessaoId, 'sessoes_agendadas', 'link_meet');
                console.log(`✅ Link Meet enviado para ${nome}`);
            } catch (err) {
                console.error('❌ Erro link Meet WhatsApp:', err.message);
            }
        }, 5 * 60 * 1000); // 5 minutos

        // 4. Pushover
        try {
            await axios.post('https://api.pushover.net/1/messages.json', {
                token: 'axfum4x76e38hzuuxjrkb3sh2febbw',
                user: process.env.PUSHOVER_USER_KEY,
                title: '🗓️ Nova Sessão Confirmada!',
                message: `${nome} confirmou presença na Sessão de Diagnóstico\n📅 ${dataFormatada} às 14h\n📱 ${telefone}`
            });
        } catch (err) {
            console.error('❌ Erro Pushover:', err.message);
        }

        return res.status(200).json({
            success: true,
            nome,
            telefone,
            data: `${dataFormatada} às 14h`
        });

    } catch (error) {
        console.error('❌ Erro em /agendar-sessao:', error.message);
        return res.status(500).json({ error: 'Erro interno ao agendar sessão' });
    }
});

module.exports = router;
