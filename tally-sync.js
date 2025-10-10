const { createClient } = require('@supabase/supabase-js');
const https = require('https');

class TallySync {
    constructor() {
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_KEY
        );
        
        this.sheetId = process.env.TALLY_SHEET_ID || process.env.GOOGLE_SHEET_ID;
        this.tableName = process.env.SUPABASE_TABLE_NAME || 'tally_responses';
        this.questionsCount = parseInt(process.env.TALLY_QUESTIONS_COUNT) || 15;
        this.lastQuestionColumn = 4 + this.questionsCount; // D=3, E=4, F=5... T=19 para 15 questões
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
            
            console.log(`📥 Baixando planilha: ${url}`);
            
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
            console.log('📋 Headers encontrados:', headers.slice(0, 10)); // Log dos primeiros 10 headers
            
            const users = [];
            
            // CORRIGIDO: Busca case-insensitive e mais variações
            const submissionIdIndex = this.findColumnIndex(headers, [
                'Submission ID', 'submission id', 'submissionid', 'SubmissionID', 
                'ID de envio', 'id_envio'
            ]);
            const timestampIndex = this.findColumnIndex(headers, [
                'Submitted at', 'submitted at', 'timestamp', 'data', 'Data'
            ]);
            const nameIndex = this.findColumnIndex(headers, [
                'Qual o seu nome?', 'nome', 'name', 'qual seu nome', 'Nome'
            ]);
            const emailIndex = this.findColumnIndex(headers, [
                'Qual o seu e-mail', 'email', 'e-mail', 'Email', 'E-mail'
            ]);
            
            console.log(`📍 Índices encontrados: Submission=${submissionIdIndex}, Name=${nameIndex}, Email=${emailIndex}`);
            
            if (submissionIdIndex === -1) {
                console.error('❌ Headers disponíveis:', headers);
                throw new Error('Coluna Submission ID não encontrada. Verificar estrutura da planilha.');
            }
            
            for (let i = 1; i < lines.length; i++) {
                const line = lines[i];
                if (!line.trim()) continue;
                
                const columns = line.split(',').map(col => col.replace(/"/g, '').trim());
                
                if (!columns[submissionIdIndex]) continue;
                
                // CORRIGIDO: Usa a variável dinâmica
                const completouTeste = columns[this.lastQuestionColumn] && columns[this.lastQuestionColumn].trim() !== '';
                
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
            
            console.log(`✅ Processados ${users.length} usuários da planilha`);
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
            if (index !== -1) {
                console.log(`✅ Coluna "${name}" encontrada no índice ${index}`);
                return index;
            }
        }
        console.log(`❌ Nenhuma das variações encontrada:`, possibleNames);
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
