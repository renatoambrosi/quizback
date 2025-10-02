class PushoverNotifier {
    constructor() {
        this.apiUrl = 'https://api.pushover.net/1/messages.json';
        this.appToken = process.env.PUSHOVER_APP_TOKEN;
        this.userKey = process.env.PUSHOVER_USER_KEY;
    }

    async sendPixApprovedNotification(paymentDetails) {
        // Implementação que eu te passo depois
    }

    async sendCreditCardApprovedNotification(paymentDetails) {
        // Implementação que eu te passo depois
    }
}

module.exports = PushoverNotifier;
