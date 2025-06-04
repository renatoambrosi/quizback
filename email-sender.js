// ============================================
// ENVIO DE EMAIL SIMPLES PARA CLIENTE PIX
// ============================================

class SimpleEmailSender {
    constructor() {
        this.apiKey = process.env.BREVO_API_KEY;
        this.senderEmail = process.env.SENDER_EMAIL || 'sistema@suellenseragi.com.br';
        this.baseUrl = 'https://api.brevo.com/v3';
    }

    // ============================================
    // APENAS EMAIL PARA CLIENTE QUE PAGOU PIX
    // ============================================
    
    async sendPixSuccessEmail(customerEmail, uid, paymentAmount = '10,00') {
        try {
            if (!this.apiKey || !customerEmail || !uid) {
                console.log('📧 Email não enviado - dados incompletos');
                return;
            }

            console.log(`📧 Enviando email PIX aprovado para: ${customerEmail}`);

            const emailData = {
                sender: {
                    name: 'Suellen Seragi - Teste de Prosperidade',
                    email: this.senderEmail
                },
                to: [{
                    email: customerEmail,
                    name: 'Cliente'
                }],
                subject: '🎉 PIX Aprovado - Acesse seu Resultado de Prosperidade!',
                htmlContent: this.createSuccessTemplate(uid, paymentAmount),
                tags: ['pix-aprovado', 'resultado-liberado']
            };

            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: {
                    'accept': 'application/json',
                    'api-key': this.apiKey,
                    'content-type': 'application/json'
                },
                body: JSON.stringify(emailData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Email PIX enviado com sucesso:', result.messageId);
                return true;
            } else {
                const error = await response.json();
                console.error('❌ Erro ao enviar email PIX:', error);
                return false;
            }

        } catch (error) {
            console.error('❌ Erro no envio de email PIX:', error);
            return false;
        }
    }

    // ============================================
    // TEMPLATE SIMPLES DO EMAIL
    // ============================================
    
    createSuccessTemplate(uid, amount) {
        const resultUrl = `https://www.suellenseragi.com.br/resultado?uid=${uid}`;
        
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>PIX Aprovado - Teste de Prosperidade</title>
            <style>
                body { 
                    font-family: Arial, sans-serif; 
                    line-height: 1.6; 
                    color: #333; 
                    margin: 0; 
                    padding: 0; 
                    background-color: #f5f5f5;
                }
                .container { 
                    max-width: 600px; 
                    margin: 0 auto; 
                    background: white;
                    border-radius: 8px;
                    overflow: hidden;
                    box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                }
                .header { 
                    background: linear-gradient(135deg, #52c41a, #389e0d); 
                    color: white; 
                    padding: 40px 20px; 
                    text-align: center; 
                }
                .success-icon { 
                    font-size: 64px; 
                    margin-bottom: 10px; 
                }
                .content { 
                    padding: 40px 30px; 
                    text-align: center;
                }
                .amount { 
                    font-size: 24px; 
                    color: #52c41a; 
                    font-weight: bold; 
                    margin: 20px 0;
                }
                .cta-button { 
                    display: inline-block; 
                    background: #1890ff; 
                    color: white; 
                    padding: 18px 40px; 
                    text-decoration: none; 
                    border-radius: 8px; 
                    font-weight: bold; 
                    font-size: 18px;
                    margin: 30px 0;
                    transition: background 0.3s ease;
                }
                .cta-button:hover { 
                    background: #40a9ff; 
                }
                .footer { 
                    background: #f8f9fa; 
                    padding: 20px; 
                    text-align: center; 
                    font-size: 14px; 
                    color: #666; 
                    border-top: 1px solid #e8e8e8;
                }
                .highlight-box {
                    background: #e6f7ff;
                    border: 1px solid #91d5ff;
                    border-radius: 6px;
                    padding: 20px;
                    margin: 25px 0;
                }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">🎉</div>
                    <h1>PIX Aprovado!</h1>
                    <p>Seu pagamento foi confirmado com sucesso</p>
                </div>
                
                <div class="content">
                    <h2>Parabéns! Seu acesso foi liberado</h2>
                    
                    <div class="amount">R$ ${amount}</div>
                    
                    <p>Seu pagamento via PIX foi processado e confirmado. Agora você pode acessar seu resultado personalizado do <strong>Teste de Prosperidade</strong>.</p>
                    
                    <div class="highlight-box">
                        <h3>🎯 Seu resultado está pronto!</h3>
                        <p>Clique no botão abaixo para descobrir seu perfil de prosperidade personalizado.</p>
                    </div>
                    
                    <a href="${resultUrl}" class="cta-button">
                        ✨ Ver Meu Resultado Agora
                    </a>
                    
                    <p style="margin-top: 30px; font-size: 14px; color: #666;">
                        <strong>Link direto:</strong><br>
                        <a href="${resultUrl}" style="color: #1890ff;">${resultUrl}</a>
                    </p>
                </div>
                
                <div class="footer">
                    <p><strong>Suellen Seragi - Teste de Prosperidade</strong></p>
                    <p>Este é um email automático de confirmação de pagamento</p>
                    <p>© 2024 - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // ============================================
    // TESTE DE CONECTIVIDADE
    // ============================================
    
    async testConnection() {
        try {
            if (!this.apiKey) {
                return { success: false, message: 'BREVO_API_KEY não configurada' };
            }

            const response = await fetch(`${this.baseUrl}/account`, {
                method: 'GET',
                headers: {
                    'accept': 'application/json',
                    'api-key': this.apiKey
                }
            });

            if (response.ok) {
                const data = await response.json();
                return { 
                    success: true, 
                    message: 'Brevo conectado com sucesso',
                    account: data.companyName || 'N/A'
                };
            } else {
                return { success: false, message: 'Erro na conectividade com Brevo' };
            }

        } catch (error) {
            return { 
                success: false, 
                message: 'Erro na comunicação com Brevo',
                error: error.message 
            };
        }
    }
}

module.exports = SimpleEmailSender;
