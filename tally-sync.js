const { createClient } = require('@supabase/supabase-js');

class TallySync {
    constructor() {
        // Configuração Supabase
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Configurações do projeto
        this.tableName = process.env.SUPABASE_TABLE_NAME || 'base';
        
        console.log(`🔧 TallySync inicializado:`);
        console.log(`🗃️ Tabela: ${this.tableName}`);
        console.log(`🌐 Supabase: ${process.env.SUPABASE_URL}`);
    }

    // ============================================
    // FASE 1: BUSCAR USUÁRIO POR UID
    // ============================================
    async getUserByUID(uid) {
        try {
            console.log(`📥 FASE 1: Buscando dados para UID: ${uid}`);
            
            // Usar Google Apps Script
            const endpoint = `https://script.google.com/macros/s/AKfycbwIocR389XiYKqXue45giqDcwGugGX_STHAaaypExqs9yUIAAA4w4hYWQyGqiAb3Z7u/exec?uid=${uid}`;
            
            console.log(`🌐 Consultando Google Apps Script...`);
            
            const response = await fetch(endpoint, { method: "get" });
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            console.log(`📊 Dados recebidos da planilha:`, data);
            
            // Mapear campos conforme escopo definido
            const userData = {
                uid: data.uid,                              // Coluna A
                nome: data.nome,                            // Coluna D
                e-mail: data.email,                          // Coluna E
                data_registro_inicial: data.data_registro,   // Coluna C
                iniciar_o_teste: true,
                concluido_o_teste: true,
                status_pagamento_teste: 'AGUARDANDO',
                aceita_receber_emails: true
            };
            
            console.log(`🗃️ Inserindo no Supabase:`, userData);
            
            // Inserir no Supabase
            const { data: insertedData, error } = await this.supabase
                .from(this.tableName)
                .insert(userData)
                .select();
                
            if (error) {
                throw error;
            }
            
            console.log(`✅ FASE 1: Usuário inserido com sucesso no Supabase`);
            return insertedData[0];
            
        } catch (error) {
            console.error('❌ Erro FASE 1 getUserByUID:', error);
            throw error;
        }
    }

    // ============================================
    // FASE 2: ATUALIZAR APÓS PAGAMENTO + SCRAPING
    // ============================================
    async updateUserAfterPayment(uid, paymentData) {
        try {
            console.log(`💳 FASE 2: Atualizando usuário ${uid} após pagamento`);
            
            // 1. Fazer scraping da página de resultado
            const resultadoTeste = await this.getResultadoTeste(uid);
            
            // 2. Preparar dados de atualização
            const updateData = {
                status_pagamento_teste: 'PAGO',
                valor_pago: '18,81',  // Valor fixo conforme escopo
                dados_pgto_teste: new Date().toISOString(),
                resultado_do_teste: resultadoTeste,
                link_do_resultado: `https://www.suellenseragi.com.br/resultado1?uid=${uid}`
            };
            
            console.log(`🔄 Atualizando dados:`, updateData);
            
            // 3. Atualizar no Supabase
            const { data, error } = await this.supabase
                .from(this.tableName)
                .update(updateData)
                .eq('uid', uid)
                .select();
                
            if (error) {
                throw error;
            }
            
            console.log(`✅ FASE 2: Usuário atualizado com sucesso`);
            return data[0];
            
        } catch (error) {
            console.error('❌ Erro FASE 2 updateUserAfterPayment:', error);
            throw error;
        }
    }

    // ============================================
    // SCRAPING DA PÁGINA DE RESULTADO
    // ============================================
    async getResultadoTeste(uid) {
        try {
            console.log(`🕷️ Fazendo scraping para UID: ${uid}`);
            
            const url = `https://www.suellenseragi.com.br/resultado1?uid=${uid}`;
            
            // Fazer fetch da página
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ao acessar ${url}`);
            }
            
            const html = await response.text();
            
            // Buscar #diagnosticoEnergia no HTML
            // Método simples: regex para encontrar o texto
            const regex = /#diagnosticoEnergia[^>]*>([^<]+)</i;
            const match = html.match(regex);
            
            if (match && match[1]) {
                const resultado = match[1].trim();
                console.log(`✅ Resultado extraído: ${resultado}`);
                return resultado;
            } else {
                console.log(`⚠️ #diagnosticoEnergia não encontrado, tentando método alternativo...`);
                
                // Método alternativo: buscar por padrões conhecidos
                const padroes = [
                    'Energia do Medo',
                    'Energia da Desordem', 
                    'Energia da Validação',
                    'Energia da Autossuficiência',
                    'Energia da Prosperidade Nv.1',
                    'Energia da Prosperidade Nv.2', 
                    'Energia da Prosperidade Nv.3'
                ];
                
                for (const padrao of padroes) {
                    if (html.includes(padrao)) {
                        console.log(`✅ Resultado encontrado por padrão: ${padrao}`);
                        return padrao;
                    }
                }
                
                throw new Error('Resultado do teste não encontrado na página');
            }
            
        } catch (error) {
            console.error('❌ Erro no scraping:', error);
            // Retornar valor padrão em caso de erro
            return 'Erro ao obter resultado';
        }
    }
}

module.exports = TallySync;
