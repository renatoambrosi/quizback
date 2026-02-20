const axios = require('axios');

class WhatsAppNotifier {
    constructor() {
        this.evolutionUrl = process.env.EVOLUTION_URL;
        this.apiKey = process.env.EVOLUTION_API_KEY;
        this.instance = process.env.EVOLUTION_INSTANCE;
        this.sheetUrl = process.env.GOOGLE_SHEET_URL;
    }

    async buscarCliente(uid) {
        const response = await axios.get(`${this.sheetUrl}?uid=${uid}`);
        if (!response.data.found) return null;
        return {
            nome: response.data.respostas[3],
            telefone: response.data.respostas[4]
        };
    }

    async enviarMensagemAprovacao(uid) {
        try {
            console.log(`📱 WhatsApp iniciando para UID: ${uid}`);

            const cliente = await this.buscarCliente(uid);
            console.log(`📱 Cliente encontrado:`, cliente);

            if (!cliente) return;

            const numero = String(cliente.telefone).replace(/\D/g, '');
            const numeroFinal = numero.startsWith('55') ? numero : `55${numero}`;
            const instanceEncoded = encodeURIComponent(this.instance);

            const mensagem = `Olá, ${cliente.nome}!🤩\n\n✨Tenho novidades...\n🔎O resultado do seu Teste de Prosperidade já está disponível!\n\nEstá animado(a) para você ver o que ele revela sobre o seu momento atual e os próximos passos da sua jornada?\n\n👉 Acesse seu resultado aqui:\nhttps://www.suellenseragi.com.br/resultado1?uid=${uid}\n\nDepois me conta o que achou!`;

            await axios.post(
                `${this.evolutionUrl}/message/sendText/${instanceEncoded}`,
                { number: numeroFinal, text: mensagem },
                { headers: { 'apikey': this.apiKey, 'Content-Type': 'application/json' } }
            );

            console.log(`✅ WhatsApp enviado para ${cliente.nome} (${numeroFinal})`);

        } catch (error) {
            console.error('❌ Erro WhatsApp:', error.message);
        }
    }
}

module.exports = WhatsAppNotifier;
```
