class PushoverNotifier {
    constructor() {
        this.apiUrl = 'https://api.pushover.net/1/messages.json';
        this.appToken = process.env.PUSHOVER_APP_TOKEN;
        this.userKey = process.env.PUSHOVER_USER_KEY;

        // Armazena temporariamente IDs já notificados (evita duplicadas)
        this.sentNotifications = new Map();
        // Limpeza periódica (a cada 10 minutos)
        setInterval(() => {
            const now = Date.now();
            for (const [id, time] of this.sentNotifications.entries()) {
                if (now - time > 10 * 60 * 1000) { // 10 min
                    this.sentNotifications.delete(id);
                }
            }
        }, 5 * 60 * 1000);
    }

    async sendPixApprovedNotification(paymentDetails) {
        try {
            if (!this.appToken || !this.userKey) {
                console.log('📱 Pushover não enviado - tokens não configurados');
                return { success: false, reason: 'tokens_missing' };
            }

            const paymentId = paymentDetails.id || paymentDetails.payment_id;
            if (!paymentId) {
                console.warn('⚠️ Pagamento sem ID detectado, notificação enviada mesmo assim.');
            } else if (this.sentNotifications.has(paymentId)) {
                console.log(`🔁 Notificação ignorada (duplicada) para Payment ID ${paymentId}`);
                return { success: false, reason: 'duplicate' };
            }

            // Marca como notificado para evitar duplicata futura
            if (paymentId) this.sentNotifications.set(paymentId, Date.now());

            const amount = paymentDetails.transaction_amount
                ? `R$ ${paymentDetails.transaction_amount.toFixed(2).replace('.', ',')}`
                : 'R$ 10,00';

            const timestamp = new Date().toLocaleString('pt-BR', {
                timeZone: 'America/Sao_Paulo',
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const message = `💰 Venda aprovada!\nValor: ${amount}\n🕓 ${timestamp}\nID: ${paymentId || '—'}`;

            const notificationData = {
                token: this.appToken,
                user: this.userKey,
                title: 'Venda Aprovada!',
                message,
                priority: 1,
                sound: 'vendateste'
            };

            const params = new URLSearchParams();
            Object.keys(notificationData).forEach(key => {
                params.append(key, notificationData[key]);
            });

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            if (response.ok) {
                console.log(`✅ Notificação PIX enviada com sucesso via Pushover (ID: ${paymentId})`);
                return { success: true };
            } else {
                const error = await response.json();
                console.error('❌ Erro ao enviar notificação PIX via Pushover:', error);
                return { success: false, error };
            }

        } catch (error) {
            console.error('❌ Erro na notificação PIX via Pushover:', error);
            return { success: false, error: error.message };
        }
    }

    async sendCreditCardApprovedNotification(paymentDetails) {
        console.log('📱 Método de cartão não implementado - apenas PIX');
        return { success: false, reason: 'not_implemented' };
    }

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
            Object.keys(testData).forEach(key => params.append(key, testData[key]));

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            if (response.ok) {
                const result = await response.json();
                return { success: true, message: 'Pushover conectado com sucesso! Teste enviado.', response: result };
            } else {
                const error = await response.json();
                return { success: false, message: 'Erro na conectividade com Pushover', error };
            }
        } catch (error) {
            return { success: false, message: 'Erro na comunicação com Pushover', error: error.message };
        }
    }
}

module.exports = PushoverNotifier;
