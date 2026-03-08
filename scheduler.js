const cron = require('node-cron');
const axios = require('axios');
const { buscarPendentes, marcarEnviado } = require('./db');

function iniciarScheduler(evolutionUrl, apiKey, instance) {
    console.log('⏰ Scheduler de WhatsApp iniciado');

    // Roda todos os dias às 13h40, exceto domingo
    cron.schedule('40 13 * * 1-6', async () => {
        const diaSemana = new Date().getDay();

        // Garantia extra: nunca roda no domingo
        if (diaSemana === 0) {
            console.log('⏰ Domingo — sem envios. Pulando...');
            return;
        }

        console.log('⏰ 13h40 — Verificando envios agendados...');
        const pendentes = await buscarPendentes();
        console.log(`📋 ${pendentes.length} envio(s) pendente(s) encontrado(s)`);

        for (const registro of pendentes) {
            try {
                const instanceEncoded = encodeURIComponent(instance);
                const nomeEncoded = encodeURIComponent(registro.nome);
                const refEncoded = encodeURIComponent(registro.telefone);
                const link = `https://agendamento.suellenseragi.com.br?name=${nomeEncoded}&ref=${refEncoded}`;

                const mensagem = `Olá, ${registro.nome}! 🌟\n\nVi que você acessou seu resultado do Teste de Prosperidade.\n\nGostaria de te convidar para uma Sessão de Diagnóstico gratuita comigo, onde vamos aprofundar o que o teste revelou sobre você.\n\n👉 Clique aqui para confirmar sua vaga:\n${link}`;

                await axios.post(
                    `${evolutionUrl}/message/sendText/${instanceEncoded}`,
                    { number: registro.telefone, text: mensagem },
                    { headers: { 'apikey': apiKey, 'Content-Type': 'application/json' } }
                );

                await marcarEnviado(registro.id);
                console.log(`✅ WhatsApp enviado para ${registro.nome} (${registro.telefone})`);
            } catch (error) {
                console.error(`❌ Erro ao enviar para ${registro.nome}:`, error.message);
            }
        }
    });
}

module.exports = { iniciarScheduler };
