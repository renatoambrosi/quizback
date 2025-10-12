const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

class TallySync {
    constructor() {
        // Configuração Supabase
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Configurações do projeto
        this.tableName = process.env.SUPABASE_TABLE_NAME || 'users_teste';
        
        console.log(`🔧 TallySync inicializado:`);
        console.log(`🗃️ Tabela: ${this.tableName}`);
        console.log(`🌐 Supabase: ${process.env.SUPABASE_URL}`);
    }

    // ============================================
    // FASE 1: BUSCAR USUÁRIO POR UID
    // ============================================
    async getUserByUID(uid) {
        console.log(`🚀 INÍCIO FASE 1 - UID: ${uid}`);
        
        try {
            console.log(`📥 FASE 1: Buscando dados para UID: ${uid}`);
            
            // Usar Google Apps Script
            const endpoint = `https://script.google.com/macros/s/AKfycbyK60u_BJFxEc573yD-LhwTJ_mDL4JxsOaZ2Pj7lkbo_k66lapaxx81Ey909-3UqFw6/exec?uid=${uid}`;
            
            console.log(`🌐 Consultando: ${endpoint}`);
            console.log(`🔄 Fazendo requisição com axios...`);
            
            const response = await axios.get(endpoint);
            console.log(`📡 Response status: ${response.status}`);
            
            if (response.status !== 200) {
                console.log(`❌ Response não OK: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            console.log(`🔄 Dados recebidos do axios...`);
            const data = response.data; // Axios já faz parse automático
            console.log(`📊 DADOS COMPLETOS:`, JSON.stringify(data, null, 2));
            console.log(`🔍 Tipo de dados:`, typeof data);
            console.log(`🔍 Keys disponíveis:`, Object.keys(data || {}));
            console.log(`🔍 data.nome:`, data.nome);
            console.log(`🔍 data.email:`, data.email); 
            console.log(`🔍 data.uid:`, data.uid);

            // Mapear campos conforme nova estrutura da tabela
            const userData = {
                uid: data.uid,                              // UID direto
                nome: data.respostas[0]?.trim(),            // Nome = posição 0 do array
                email: data.respostas[1]?.trim(),           // Email = posição 1 do array  
                data_registro: data.respostas[2],           // Data da planilha
                iniciar_teste: true,                       // Corrigido: sem "_o_"
                concluir_teste: true,                      // Corrigido: sem "do_o_"
                status_pgto_teste: 'AGUARDANDO',           // Corrigido: pgto em vez de pagamento
                aceita_emails: true                        // Corrigido: sem "_receber_"
            };
            
            console.log(`🗃️ Inserindo no Supabase:`, userData);
            
            // Inserir no Supabase
            const { data: insertedData, error } = await this.supabase
                .from(this.tableName)
                .insert(userData)
                .select();
                
            if (error) {
                console.log(`❌ Erro Supabase:`, error);
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
                status_pgto_teste: 'PAGO',                 // Corrigido: pgto em vez de pagamento
                valor_pgto_teste: '18,81',                 // Corrigido: nome do campo
                data_pgto_teste: new Date().toISOString(), // Corrigido: data_pgto_teste
                resultado_teste: resultadoTeste,           // Corrigido: sem "_do_"
                link_resultado: `https://www.suellenseragi.com.br/resultado1?uid=${uid}` // Corrigido: sem "_do_"
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
    // SCRAPING DA PÁGINA DE RESULTADO WIX
    // ============================================
    async getResultadoTeste(uid) {
        try {
            console.log(`🕷️ Fazendo scraping para UID: ${uid}`);
            
            const url = `https://www.suellenseragi.com.br/resultado1?uid=${uid}`;
            
            // Fazer requisição da página com axios
            const response = await axios.get(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                },
                timeout: 10000
            });
            
            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status} ao acessar ${url}`);
            }
            
            const html = response.data; // Axios retorna HTML como string
            
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
