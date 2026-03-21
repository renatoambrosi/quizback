const express = require('express');
const router = express.Router();
const axios = require('axios');
const { salvarSessaoAgendada, registrarMensagem, getMensagemConfig, marcarLeadConfirmadoPorTelefone } = require('../db');

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

async function enviarViaGateway(telefone, mensagem, nome) {
    const url = process.env.GATEWAY_URL;
    const token = process.env.GATEWAY_TOKEN;
    if (!url || !token) throw new Error('GATEWAY_URL ou GATEWAY_TOKEN não configurados');
    await axios.post(
        `${url}/enviar`,
        { telefone, mensagem, nome: nome || telefone, origem: 'quizback', imediato: false },
        { headers: { 'x-gateway-token': token, 'Content-Type': 'application/json' }, timeout: 10000 }
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

        // 1. Salvar sessão no banco
        const sessaoId = await salvarSessaoAgendada(nome, numeroFinal, dataSessaoISO);

        // 2. Marcar lead como confirmado
        try {
            await marcarLeadConfirmadoPorTelefone(numeroFinal);
        } catch (err) {
            console.error('❌ Erro ao marcar lead confirmado:', err.message);
        }

        // 3. Mensagem de confirmação via gateway (fila)
        try {
            const grupoLink = process.env.GRUPO_SESSAO_LINK;
            if (!grupoLink) {
                console.error('❌ GRUPO_SESSAO_LINK não configurado no Railway');
                throw new Error('Link do grupo não configurado. Adicione GRUPO_SESSAO_LINK nas variáveis do Railway.');
            }

            let textoConfirmacao = await getMensagemConfig('confirmacao');
            if (!textoConfirmacao) {
                textoConfirmacao = `Olá, {nome}! 🎉\n\nSua vaga na Sessão de Diagnóstico está confirmada!\n\n📅 Sábado às 14h\n\nEntre no grupo da sessão:\n👉 {grupo_link}\n\nAté sábado! 🌟\n— Suellen Seragi`;
            }
            const mensagem = textoConfirmacao
                .replace(/\{nome\}/gi, nome)
                .replace(/\{grupo_link\}/gi, grupoLink)
                .replace(/\{data\}/gi, dataFormatada);

            await enviarViaGateway(numeroFinal, mensagem, nome);
            await registrarMensagem(sessaoId, 'sessoes_agendadas', 'confirmacao');
            console.log(`✅ Confirmação enfileirada para ${nome}`);
        } catch (err) {
            console.error('❌ Erro confirmação WhatsApp:', err.message);
        }

        // 4. Pushover
        try {
            await axios.post('https://api.pushover.net/1/messages.json', {
                token: 'axfum4x76e38hzuuxjrkb3sh2febbw',
                user: process.env.PUSHOVER_USER_KEY,
                title: '🗓️ Nova Sessão Confirmada!',
                message: `${nome} confirmou presença na Sessão de Diagnóstico\n📅 ${dataFormatada} às 14h\n📱 ${numeroFinal}`
            });
        } catch (err) {
            console.error('❌ Erro Pushover:', err.message);
        }

        return res.status(200).json({
            success: true,
            nome,
            telefone: numeroFinal,
            data: `${dataFormatada} às 14h`
        });

    } catch (error) {
        console.error('❌ Erro em /agendar-sessao:', error.message);
        return res.status(500).json({ error: 'Erro interno ao agendar sessão' });
    }
});

module.exports = router;
