class PushoverNotifier {
    constructor() {
        this.apiUrl = 'https://api.pushover.net/1/messages.json';
        this.appToken = process.env.PUSHOVER_APP_TOKEN;
        this.userKey = process.env.PUSHOVER_USER_KEY;
    }

    async sendPixApprovedNotification(paymentDetails) {
        try {
            if (!this.appToken || !this.userKey) {
                console.log('📱 Pushover não enviado - tokens não configurados');
                return { success: false, reason: 'tokens_missing' };
            }

            const amount = paymentDetails.transaction_amount ? 
                `R$ ${paymentDetails.transaction_amount.toFixed(2).replace('.', ',')}` : 'R$ 10,00';
            
            const timestamp = new Date().toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const message = `💰 NOVA VENDA PIX!

💵 Valor: ${amount}
🆔 Payment ID: ${paymentDetails.id}
👤 UID: ${paymentDetails.external_reference}
📅 Data: ${timestamp}
📧 Cliente: ${paymentDetails.metadata?.customer_email || 'N/A'}

✅ Status: Aprovado
🎯 Produto: Teste de Prosperidade`;

            const notificationData = {
                token: this.appToken,
                user: this.userKey,
                title: '🎉 PIX APROVADO - Nova Venda!',
                message: message,
                priority: 1,
                sound: 'cash'
            };

            const params = new URLSearchParams();
            Object.keys(notificationData).forEach(key => {
                params.append(key, notificationData[key]);
            });

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            });

            if (response.ok) {
                console.log('✅ Notificação PIX enviada com sucesso via Pushover');
                return { success: true };
            } else {
                const error = await response.json();
                console.error('❌ Erro ao enviar notificação PIX via Pushover:', error);
                return { success: false, error: error };
            }

        } catch (error) {
            console.error('❌ Erro na notificação PIX via Pushover:', error);
            return { success: false, error: error.message };
        }
    }

    async sendCreditCardApprovedNotification(paymentDetails) {
        // Método não usado para PIX, mas mantido para compatibilidade
        console.log('📱 Método de cartão não implementado - apenas PIX');
        return { success: false, reason: 'not_implemented' };
    }

    // Método para testar a conexão
    async testConnection() {
        try {
            if (!this.appToken || !this.userKey) {
                return { 
                    success: false, 
                    message: 'PUSHOVER_APP_TOKEN ou PUSHOVER_USER_KEY não configurados' 
                };
            }

            const testData = {
                token: this.appToken,
                user: this.userKey,
                title: '🧪 Teste de Conexão',
                message: 'Pushover configurado e funcionando!\n\n✅ Sistema de notificações ativo.',
                priority: 0,
                sound: 'pushover'
            };

            const params = new URLSearchParams();
            Object.keys(testData).forEach(key => {
                params.append(key, testData[key]);
            });

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params.toString()
            });

            if (response.ok) {
                const result = await response.json();
                return { 
                    success: true, 
                    message: 'Pushover conectado com sucesso! Teste enviado.',
                    response: result
                };
            } else {
                const error = await response.json();
                return { 
                    success: false, 
                    message: 'Erro na conectividade com Pushover',
                    error: error
                };
            }

        } catch (error) {
            return { 
                success: false, 
                message: 'Erro na comunicação com Pushover',
                error: error.message 
            };
        }
    }
}

module.exports = PushoverNotifier;
