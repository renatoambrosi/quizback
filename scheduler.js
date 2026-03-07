const cron = require('node-cron');
const axios = require('axios');
const { buscarPendentes, marcarEnviado } = require('./db');

function iniciarScheduler(evolutionUrl, apiKey, instance) {
    console.log('⏰ Scheduler de WhatsApp iniciado');

    cron.schedule('0 * * * *', async () => {
        const hora = new Date().getHours();

        if (hora < 8 || hora >= 20) {
            console.log(`⏰ Fora do horário de envio (${hora}h). Pulando...`);
            return;
        }

        console.log('⏰ Verificando envios agendados...');
        const pendentes = await buscarPendentes();

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
                console.log(`✅ Segundo WhatsApp enviado para ${registro.nome} (${registro.telefone})`);
            } catch (error) {
                console.error(`❌ Erro ao enviar para ${registro.nome}:`, error.message);
            }
        }
    });
}

module.exports = { iniciarScheduler };
