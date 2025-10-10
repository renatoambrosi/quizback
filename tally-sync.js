const { createClient } = require('@supabase/supabase-js');
const https = require('https');

class TallySync {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_ANON_KEY
        );
        
        this.sheetId = process.env.TALLY_SHEET_ID;
        this.tableName = process.env.SUPABASE_TABLE_NAME;
    }
    
    async syncAllData() {
        try {
            console.log('🔄 Iniciando sincronização COMPLETA da planilha Tally');
            
            const allTallyData = await this.getAllTallyData();
            
            if (!allTallyData || allTallyData.length === 0) {
                console.log('⚠️ Nenhum dado encontrado na planilha Tally');
                return false;
            }
            
            console.log(`📊 Encontrados ${allTallyData.length} registros na planilha`);
            
            let successCount = 0;
            let errorCount = 0;
            
            for (const user of allTallyData) {
                try {
                    await this.upsertToSupabase(user);
                    successCount++;
                    console.log(`✅ Usuário sincronizado: ${user.uid}`);
                } catch (error) {
                    errorCount++;
                    console.error(`❌ Erro ao sincronizar usuário ${user.uid}:`, error);
                }
            }
            
            console.log(`📈 Sincronização completa: ${successCount} sucessos, ${errorCount} erros`);
            return true;
            
        } catch (error) {
            console.error('❌ Erro na sincronização completa:', error);
            return false;
        }
    }
    
    async syncPaymentUser(uid, transactionAmount) {
        try {
            console.log(`💰 Processando pagamento aprovado para UID: ${uid}`);
            
            const { data: existingUser } = await this.supabase
                .from(this.tableName)
                .select('*')
                .eq('uid', uid)
                .single();
            
            if (existingUser) {
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({
                        status_pagamento_teste: 'aprovado',
                        data_pgto_teste: new Date().toISOString(),
                        valor_pago: transactionAmount
                    })
                    .eq('uid', uid);
                
                if (error) throw error;
                console.log(`✅ Pagamento atualizado para usuário existente: ${uid}`);
            } else {
                await this.syncAllData();
                
                const { error } = await this.supabase
                    .from(this.tableName)
                    .update({
                        status_pagamento_teste: 'aprovado',
                        data_pgto_teste: new Date().toISOString(),
                        valor_pago: transactionAmount
                    })
                    .eq('uid', uid);
                
                if (error) throw error;
                console.log(`✅ Usuário novo sincronizado e pagamento registrado: ${uid}`);
            }
            
            return true;
            
        } catch (error) {
            console.error(`❌ Erro ao processar pagamento do UID ${uid}:`, error);
            return false;
        }
    }
    
    async getAllTallyData() {
        return new Promise((resolve, reject) => {
            const url = `https://docs.google.com/spreadsheets/d/${this.sheetId}/export?format=csv&gid=0`;
            
            https.get(url, (response) => {
                let data = '';
                
                response.on('data', (chunk) => {
                    data += chunk;
                });
                
                response.on('end', () => {
                    try {
                        const users = this.parseCSVData(data);
                        resolve(users);
                    } catch (error) {
                        console.error('❌ Erro ao processar CSV:', error);
                        reject(error);
                    }
                });
                
            }).on('error', (error) => {
                console.error('❌ Erro ao baixar planilha:', error);
                reject(error);
            });
        });
    }
    
    parseCSVData(csvData) {
        try {
            const lines = csvData.split('\n');
            if (lines.length <= 1) return [];
            
            const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
            const users = [];
            
            const submissionIdIndex = this.findColumnIndex(headers, ['submission id', 'submissionid']);
            const timestampIndex = 0;
            const nameIndex = this.findColumnIndex(headers, ['nome', 'name', 'qual seu nome']);
            const emailIndex = this.findColumnIndex(headers, ['email', 'e-mail']);
            
            if (submissionIdIndex === -1) {
                throw new Error('Coluna Submission ID não encontrada');
            }
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                
                const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
                
                if (!columns[submissionIdIndex]) continue;
                
                const completouTeste = columns[30] && columns[30].trim() !== '';
                
                const userData = {
                    nome: columns[nameIndex] || 'Nome não informado',
                    email: columns[emailIndex] || '',
                    uid: columns[submissionIdIndex],
                    data_registro_inicial: this.parseTimestamp(columns[timestampIndex]),
                    iniciou_o_teste: true,
                    concluiu_o_teste: completouTeste,
                    status_pagamento_teste: 'pendente',
                    data_pgto_teste: null,
                    valor_pago: 0.00,
                    traffic_source: 'indefinido',
                    aceita_receber_emails: false,
                    ouro: false,
                    lda: false,
                    tm: false,
                    grm: false,
                    quantidade_de_produtos: 0,
                    valor_total: 0.00
                };
                
                users.push(userData);
            }
            
            return users;
            
        } catch (error) {
            console.error('❌ Erro ao processar dados CSV:', error);
            throw error;
        }
    }
    
    findColumnIndex(headers, possibleNames) {
        for (const name of possibleNames) {
            const index = headers.findIndex(header => 
                header && header.toLowerCase().includes(name.toLowerCase())
            );
            if (index !== -1) return index;
        }
        return -1;
    }
    
    parseTimestamp(timestamp) {
        if (!timestamp) return new Date().toISOString();
        
        try {
            const date = new Date(timestamp);
            if (isNaN(date.getTime())) {
                return new Date().toISOString();
            }
            return date.toISOString();
        } catch {
            return new Date().toISOString();
        }
    }
    
    async upsertToSupabase(userData) {
        try {
            const { error } = await this.supabase
                .from(this.tableName)
                .upsert(userData, {
                    onConflict: 'uid',
                    ignoreDuplicates: false
                });
            
            if (error) throw error;
            
            return true;
            
        } catch (error) {
            console.error('❌ Erro ao inserir no Supabase:', error);
            throw error;
        }
    }
}

module.exports = TallySync;
