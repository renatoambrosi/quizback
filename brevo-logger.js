const express = require('express');

// ============================================
// SISTEMA DE LOGS BREVO - CONFORME DOC OFICIAL
// ============================================

class BrevoLogger {
    constructor() {
        this.apiKey = process.env.BREVO_API_KEY;
        this.adminEmail = process.env.ADMIN_EMAIL || 'contato@suellenseragi.com.br';
        this.baseUrl = 'https://api.brevo.com/v3';
        this.senderEmail = process.env.SENDER_EMAIL || 'sistema@suellenseragi.com.br';
        this.senderName = 'Sistema Teste Prosperidade';
    }

    // ============================================
    // CONFIGURAÇÃO DE HEADERS CONFORME DOC BREVO
    // ============================================
    
    getHeaders() {
        return {
            'accept': 'application/json',
            'api-key': this.apiKey,
            'content-type': 'application/json'
        };
    }

    // ============================================
    // LOG ESTRUTURADO PARA CONSOLE + BREVO
    // ============================================
    
    async log(level, event, paymentId, status, details = {}, shouldEmail = false) {
        const timestamp = new Date().toISOString();
        const logData = {
            timestamp,
            level,
            event,
            paymentId,
            status,
            details,
            service: 'checkout-bricks-mp',
            version: '2.0'
        };

        // Log local estruturado
        console.log(`
📊 ================================
📅 ${timestamp}
🔥 NÍVEL: ${level}
🎯 EVENTO: ${event}
💳 PAYMENT ID: ${paymentId}
📊 STATUS: ${status}
📋 DETALHES: ${JSON.stringify(details, null, 2)}
📊 ================================
        `);

        // Enviar para Brevo se configurado
        if (this.apiKey && shouldEmail) {
            await this.sendLogToBrevo(logData);
        }

        // Email crítico para administrador
        if (level === 'ERROR' || level === 'CRITICAL') {
            await this.sendCriticalAlert(logData);
        }

        return logData;
    }

    // ============================================
    // ENVIO DE LOG VIA EMAIL BREVO
    // ============================================
    
    async sendLogToBrevo(logData) {
        try {
            if (!this.apiKey) {
                console.log('⚠️ BREVO_API_KEY não configurada - log não enviado');
                return;
            }

            const emailData = {
                sender: {
                    name: this.senderName,
                    email: this.senderEmail
                },
                to: [{
                    email: this.adminEmail,
                    name: 'Admin Sistema'
                }],
                subject: `[${logData.level}] ${logData.event} - Payment: ${logData.paymentId}`,
                htmlContent: this.createLogEmailTemplate(logData),
                tags: ['sistema-logs', 'checkout-bricks', logData.level.toLowerCase()]
            };

            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(emailData)
            });

            if (response.ok) {
                const result = await response.json();
                console.log('✅ Log enviado para Brevo:', result.messageId);
                return result;
            } else {
                const error = await response.json();
                console.error('❌ Erro ao enviar log para Brevo:', error);
            }

        } catch (error) {
            console.error('❌ Erro na comunicação com Brevo:', error);
        }
    }

    // ============================================
    // ALERTA CRÍTICO PARA ADMINISTRADOR
    // ============================================
    
    async sendCriticalAlert(logData) {
        try {
            if (!this.apiKey) return;

            const alertData = {
                sender: {
                    name: '🚨 ALERTA CRÍTICO',
                    email: this.senderEmail
                },
                to: [{
                    email: this.adminEmail,
                    name: 'Admin Sistema'
                }],
                subject: `🚨 ALERTA CRÍTICO - ${logData.event}`,
                htmlContent: this.createCriticalAlertTemplate(logData),
                tags: ['alerta-critico', 'sistema-erro']
            };

            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(alertData)
            });

            if (response.ok) {
                console.log('🚨 ALERTA CRÍTICO enviado via Brevo');
            }

        } catch (error) {
            console.error('❌ Erro ao enviar alerta crítico:', error);
        }
    }

    // ============================================
    // TEMPLATE PARA EMAIL DE LOG
    // ============================================
    
    createLogEmailTemplate(logData) {
        const levelColor = {
            'INFO': '#52c41a',
            'WARNING': '#fa8c16',
            'ERROR': '#ff4d4f',
            'CRITICAL': '#cf1322'
        };

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: ${levelColor[logData.level] || '#1890ff'}; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
                .content { background: #f8f9fa; padding: 20px; border-radius: 0 0 8px 8px; }
                .detail-item { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
                .label { font-weight: bold; color: #666; }
                .value { color: #333; }
                .json-content { background: #fff; border: 1px solid #ddd; padding: 10px; border-radius: 4px; font-family: monospace; font-size: 12px; overflow-x: auto; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <h2>📊 Log do Sistema - ${logData.event}</h2>
                    <p>Nível: ${logData.level} | Timestamp: ${logData.timestamp}</p>
                </div>
                
                <div class="content">
                    <div class="detail-item">
                        <span class="label">🎯 Evento:</span>
                        <span class="value">${logData.event}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="label">💳 Payment ID:</span>
                        <span class="value">${logData.paymentId}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="label">📊 Status:</span>
                        <span class="value">${logData.status}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="label">🔧 Serviço:</span>
                        <span class="value">${logData.service} v${logData.version}</span>
                    </div>
                    
                    <div class="detail-item">
                        <span class="label">📋 Detalhes:</span>
                        <div class="json-content">${JSON.stringify(logData.details, null, 2)}</div>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // ============================================
    // TEMPLATE PARA ALERTA CRÍTICO
    // ============================================
    
    createCriticalAlertTemplate(logData) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
                .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                .header { background: #cf1322; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
                .content { background: #fff2f0; padding: 20px; border: 2px solid #ffccc7; border-radius: 0 0 8px 8px; }
                .alert-icon { font-size: 48px; margin-bottom: 10px; }
                .detail-item { margin: 15px 0; padding: 15px; background: white; border-left: 4px solid #cf1322; }
                .actions { background: #f6ffed; padding: 15px; margin-top: 20px; border-radius: 4px; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="alert-icon">🚨</div>
                    <h1>ALERTA CRÍTICO DO SISTEMA</h1>
                    <p>${logData.timestamp}</p>
                </div>
                
                <div class="content">
                    <div class="detail-item">
                        <h3>🎯 Evento Crítico</h3>
                        <p><strong>${logData.event}</strong></p>
                    </div>
                    
                    <div class="detail-item">
                        <h3>💳 Informações do Pagamento</h3>
                        <p><strong>ID:</strong> ${logData.paymentId}</p>
                        <p><strong>Status:</strong> ${logData.status}</p>
                    </div>
                    
                    <div class="detail-item">
                        <h3>📋 Detalhes do Erro</h3>
                        <pre style="background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto;">${JSON.stringify(logData.details, null, 2)}</pre>
                    </div>
                    
                    <div class="actions">
                        <h3>🔧 Ações Recomendadas</h3>
                        <ul>
                            <li>Verificar logs do sistema imediatamente</li>
                            <li>Validar conectividade com Mercado Pago</li>
                            <li>Monitorar dashboard do Railway</li>
                            <li>Contatar suporte técnico se necessário</li>
                        </ul>
                    </div>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // ============================================
    // MÉTODOS ESPECÍFICOS PARA EVENTOS DO MP
    // ============================================
    
    async logPaymentStarted(paymentData) {
        return this.log('INFO', 'PAYMENT_STARTED', 'pending', 'INICIANDO', {
            transaction_amount: paymentData.transaction_amount,
            payment_method_id: paymentData.payment_method_id,
            uid: paymentData.uid,
            email: paymentData.payer?.email
        });
    }

    async logPaymentApproved(paymentId, paymentResult) {
        return this.log('INFO', 'PAYMENT_APPROVED', paymentId, 'SUCCESS', {
            transaction_amount: paymentResult.transaction_amount,
            payment_method_id: paymentResult.payment_method_id,
            date_approved: paymentResult.date_approved,
            external_reference: paymentResult.external_reference
        }, true); // Enviar email
    }

    async logPixCreated(paymentId, pixResult) {
        return this.log('INFO', 'PIX_CREATED', paymentId, 'PIX_READY', {
            transaction_amount: pixResult.transaction_amount,
            date_of_expiration: pixResult.date_of_expiration,
            external_reference: pixResult.external_reference,
            has_qr_code: !!pixResult.point_of_interaction?.transaction_data?.qr_code
        });
    }

    async logPixApproved(paymentId, details) {
        return this.log('INFO', 'PIX_APPROVED', paymentId, 'SUCCESS', details, true);
    }

    async logPaymentError(paymentId, error, context = {}) {
        return this.log('ERROR', 'PAYMENT_ERROR', paymentId || 'unknown', 'ERROR', {
            error_message: error.message,
            error_stack: error.stack?.substring(0, 500),
            context
        }, true);
    }

    async logWebhookReceived(webhookData) {
        return this.log('INFO', 'WEBHOOK_RECEIVED', webhookData.data?.id || 'unknown', webhookData.action, {
            type: webhookData.type,
            action: webhookData.action,
            timestamp: new Date().toISOString()
        });
    }

    async logCriticalSystemError(error, context = {}) {
        return this.log('CRITICAL', 'SYSTEM_ERROR', 'system', 'CRITICAL_FAILURE', {
            error_message: error.message,
            error_stack: error.stack,
            context,
            server_info: {
                uptime: process.uptime(),
                memory: process.memoryUsage(),
                platform: process.platform
            }
        });
    }

    // ============================================
    // NOTIFICAÇÃO DE SUCESSO PARA CLIENTE
    // ============================================
    
    async sendSuccessNotificationToCustomer(paymentData, customerEmail) {
        try {
            if (!this.apiKey || !customerEmail) return;

            const emailData = {
                sender: {
                    name: 'Suellen Seragi - Teste de Prosperidade',
                    email: this.senderEmail
                },
                to: [{
                    email: customerEmail,
                    name: 'Cliente'
                }],
                subject: 'Pagamento Confirmado - Acesse seu Resultado de Prosperidade! 🎉',
                htmlContent: this.createCustomerSuccessTemplate(paymentData),
                tags: ['pagamento-aprovado', 'cliente-notificacao']
            };

            const response = await fetch(`${this.baseUrl}/smtp/email`, {
                method: 'POST',
                headers: this.getHeaders(),
                body: JSON.stringify(emailData)
            });

            if (response.ok) {
                console.log('✅ Notificação de sucesso enviada ao cliente');
            }

        } catch (error) {
            console.error('❌ Erro ao enviar notificação ao cliente:', error);
        }
    }

    createCustomerSuccessTemplate(paymentData) {
        return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
                .container { max-width: 600px; margin: 0 auto; }
                .header { background: linear-gradient(135deg, #52c41a, #389e0d); color: white; padding: 40px 20px; text-align: center; }
                .content { padding: 30px 20px; background: #fff; }
                .success-icon { font-size: 64px; margin-bottom: 20px; }
                .cta-button { display: inline-block; background: #1890ff; color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; font-weight: bold; margin: 20px 0; }
                .details { background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0; }
                .footer { background: #f0f0f0; padding: 20px; text-align: center; font-size: 14px; color: #666; }
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="success-icon">🎉</div>
                    <h1>Pagamento Confirmado!</h1>
                    <p>Seu acesso ao Teste de Prosperidade foi liberado</p>
                </div>
                
                <div class="content">
                    <h2>Parabéns! 🌟</h2>
                    <p>Seu pagamento foi processado com sucesso e você já pode acessar seu resultado personalizado do Teste de Prosperidade.</p>
                    
                    <div class="details">
                        <h3>📋 Detalhes da Compra</h3>
                        <p><strong>Valor:</strong> R$ ${paymentData.transaction_amount}</p>
                        <p><strong>Operação:</strong> #${paymentData.id}</p>
                        <p><strong>Data:</strong> ${new Date().toLocaleDateString('pt-BR')}</p>
                    </div>
                    
                    <div style="text-align: center;">
                        <a href="https://www.suellenseragi.com.br/resultado?uid=${paymentData.external_reference}" class="cta-button">
                            🎯 Acessar Meu Resultado Agora
                        </a>
                    </div>
                    
                    <div style="background: #e6f7ff; padding: 20px; border-radius: 8px; margin: 20px 0;">
                        <h3>💡 Próximos Passos</h3>
                        <ul>
                            <li>Acesse seu resultado personalizado usando o link acima</li>
                            <li>Salve este email para referência futura</li>
                            <li>Explore as recomendações personalizadas</li>
                            <li>Compartilhe seus insights nas redes sociais</li>
                        </ul>
                    </div>
                </div>
                
                <div class="footer">
                    <p>Este é um email automático do sistema Teste de Prosperidade</p>
                    <p>© 2024 Suellen Seragi - Todos os direitos reservados</p>
                </div>
            </div>
        </body>
        </html>
        `;
    }

    // ============================================
    // HEALTH CHECK DO BREVO
    // ============================================
    
    async healthCheck() {
        try {
            if (!this.apiKey) {
                return { status: 'ERROR', message: 'BREVO_API_KEY não configurada' };
            }

            const response = await fetch(`${this.baseUrl}/account`, {
                method: 'GET',
                headers: this.getHeaders()
            });

            if (response.ok) {
                const data = await response.json();
                return { 
                    status: 'OK', 
                    message: 'Brevo conectado com sucesso',
                    account: data.companyName || 'N/A'
                };
            } else {
                return { status: 'ERROR', message: 'Erro na conectividade com Brevo' };
            }

        } catch (error) {
            return { 
                status: 'ERROR', 
                message: 'Erro na comunicação com Brevo',
                error: error.message 
            };
        }
    }
}

module.exports = BrevoLogger;
