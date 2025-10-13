const { createClient } = require('@supabase/supabase-js');

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
    // FUNÇÃO PARA DATA/HORA BRASILEIRA (AMBAS FASES)
    // ============================================
    getBrazilianDateTime() {
        const now = new Date();
        // Converter para GMT-3 (Brasil)
        const brazilTime = new Date(now.getTime() - (3 * 60 * 60 * 1000));
        
        const day = String(brazilTime.getUTCDate()).padStart(2, '0');
        const month = String(brazilTime.getUTCMonth() + 1).padStart(2, '0');
        const year = brazilTime.getUTCFullYear();
        const hours = String(brazilTime.getUTCHours()).padStart(2, '0');
        const minutes = String(brazilTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(brazilTime.getUTCSeconds()).padStart(2, '0');
        
        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
    }

    // ============================================
    // FUNÇÃO PARA CONVERTER DATA DO MP PARA BRASILEIRO
    // ============================================
    convertMPDateToBrazilian(mpDate) {
        const date = new Date(mpDate);
        const brazilTime = new Date(date.getTime() - (3 * 60 * 60 * 1000));
        
        const day = String(brazilTime.getUTCDate()).padStart(2, '0');
        const month = String(brazilTime.getUTCMonth() + 1).padStart(2, '0');
        const year = brazilTime.getUTCFullYear();
        const hours = String(brazilTime.getUTCHours()).padStart(2, '0');
        const minutes = String(brazilTime.getUTCMinutes()).padStart(2, '0');
        const seconds = String(brazilTime.getUTCSeconds()).padStart(2, '0');
        
        return `${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
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
            console.log(`🔄 Fazendo fetch...`);
            
            const response = await fetch(endpoint, { method: "get" });
            console.log(`📡 Response status: ${response.status}`);
            
            if (!response.ok) {
                console.log(`❌ Response não OK: ${response.status} ${response.statusText}`);
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            console.log(`🔄 Fazendo parse JSON...`);
            const data = await response.json();
            console.log(`📊 DADOS COMPLETOS:`, JSON.stringify(data, null, 2));

            // Mapear campos conforme nova estrutura da tabela
            const userData = {
                uid: data.uid,
                nome: data.respostas[0]?.trim(),
                email: data.respostas[1]?.trim(),
                data_registro: this.getBrazilianDateTime(),
                iniciar_teste: true,
                concluir_teste: true,
                status_pgto_teste: 'AGUARDANDO',
                aceita_emails: true
            };
            
            console.log(`🗃️ Inserindo no Supabase:`, userData);
            
            // Inserir ou atualizar no Supabase (UPSERT)
            const { data: insertedData, error } = await this.supabase
                .from(this.tableName)
                .upsert(userData, { onConflict: 'uid' })
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
                status_pgto_teste: 'PAGO',
                valor_pgto_teste: '18,81',
                data_pgto_teste: paymentData.date_approved ? 
                    this.convertMPDateToBrazilian(paymentData.date_approved) : 
                    this.getBrazilianDateTime(),
                resultado_teste: resultadoTeste,
                link_resultado: `https://www.suellenseragi.com.br/resultado1?uid=${uid}`
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
            
            // Tentativas com delay progressivo
            const delays = [3000, 7000, 5000]; // 3s, +7s, +5s = total 15s
            
            for (let i = 0; i < delays.length; i++) {
                console.log(`⏳ Aguardando ${delays[i]/1000}s para cálculo completar (tentativa ${i+1}/3)...`);
                
                // Aguardar o tempo específico
                await new Promise(resolve => setTimeout(resolve, delays[i]));
                
                // Fazer requisição para ver se já calculou
                const response = await fetch(url);
                if (!response.ok) {
                    console.log(`❌ Response não OK na tentativa ${i+1}: ${response.status}`);
                    continue;
                }
                
                const html = await response.text();
                
                // Buscar #diagnosticoEnergia no HTML
                const regex = /#diagnosticoEnergia[^>]*>([^<]+)</i;
                const match = html.match(regex);
                
                if (match && match[1] && match[1].trim() !== 'Carregando resultado...' && match[1].trim() !== '') {
                    const resultado = match[1].trim();
                    console.log(`✅ Resultado extraído após ${(delays.slice(0, i+1).reduce((a,b) => a+b, 0))/1000}s: ${resultado}`);
                    return resultado;
                }
                
                // Método alternativo: buscar por padrões conhecidos no HTML
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
                        console.log(`✅ Resultado encontrado por padrão após ${(delays.slice(0, i+1).reduce((a,b) => a+b, 0))/1000}s: ${padrao}`);
                        return padrao;
                    }
                }
                
                console.log(`🔄 Tentativa ${i+1}: Ainda calculando...`);
            }
            
            // Se chegou até aqui, não conseguiu obter resultado
            console.log(`❌ Não foi possível obter resultado após 15 segundos`);
            throw new Error('Resultado do teste não encontrado após múltiplas tentativas');
            
        } catch (error) {
            console.error('❌ Erro no scraping:', error);
            return 'Erro ao obter resultado';
        }
    }

}

module.exports = TallySync;
