const { createClient } = require('@supabase/supabase-js');

class TallySync {
    constructor() {
        // Configuração Supabase
        this.supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY
        );
        
        // Configuração Google Sheets API
        this.apiKey = process.env.GOOGLE_SHEETS_API_KEY;
        this.sheetId = process.env.TALLY_SHEET_ID;
        this.questionsCount = parseInt(process.env.TALLY_QUESTIONS_COUNT) || 15;
        this.tableName = process.env.SUPABASE_TABLE_NAME || 'base';
        
        console.log(`🔧 TallySync inicializado:`);
        console.log(`📊 Sheet ID: ${this.sheetId}`);
        console.log(`🔑 API Key: ${this.apiKey}`);
        console.log(`❓ Questões: ${this.questionsCount}`);
        console.log(`🗃️ Tabela: ${this.tableName}`);
    }

    async syncData() {
        try {
            console.log('🚀 Iniciando sincronização Tally → Supabase...');
            
            // 1. Buscar dados do Tally
            console.log('📥 Buscando dados do Tally via Google Sheets API...');
            const tallyData = await this.fetchTallyData();
            console.log(`📊 ${tallyData.length} registros encontrados no Tally`);
            
            // 2. Buscar IDs já existentes no Supabase
            console.log('🔍 Verificando registros existentes no Supabase...');
            const existingIds = await this.getExistingSubmissionIds();
            console.log(`✅ ${existingIds.size} registros já existem no Supabase`);
            
            // 3. Filtrar novos registros
            const newRecords = tallyData.filter(record => !existingIds.has(record.submission_id));
            console.log(`🆕 ${newRecords.length} novos registros para inserir`);
            
            if (newRecords.length === 0) {
                console.log('✨ Todos os dados já estão sincronizados!');
                return { success: true, inserted: 0, message: 'Nenhum registro novo encontrado' };
            }
            
            // 4. Inserir novos registros
            console.log('💾 Inserindo novos registros no Supabase...');
            const { data, error } = await this.supabase
                .from(this.tableName)
                .insert(newRecords);
                
            if (error) {
                throw error;
            }
            
            console.log(`✅ ${newRecords.length} registros inseridos com sucesso!`);
            return { 
                success: true, 
                inserted: newRecords.length,
                message: `${newRecords.length} registros sincronizados com sucesso`
            };
            
        } catch (error) {
            console.error('❌ Erro na sincronização:', error);
            throw error;
        }
    }

    async fetchTallyData() {
        try {
            // URL da Google Sheets API v4
            const range = 'A:Z'; // Buscar todas as colunas necessárias
            const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.sheetId}/values/${range}?key=${this.apiKey}`;
            
            console.log(`🌐 Fazendo requisição para: ${url}`);
            
            const response = await fetch(url);
            
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const data = await response.json();
            const rows = data.values;
            
            if (!rows || rows.length === 0) {
                throw new Error('Nenhum dado encontrado na planilha');
            }

            // Processar cabeçalhos e dados
            const headers = rows[0];
            const dataRows = rows.slice(1);
            
            console.log(`📋 Headers encontrados: ${headers.join(', ')}`);
            console.log(`📄 ${dataRows.length} linhas de dados encontradas`);
            
            return this.parseCSVData(headers, dataRows);
            
        } catch (error) {
            console.error('❌ Erro ao buscar dados do Tally:', error.message);
            throw error;
        }
    }

    parseCSVData(headers, dataRows) {
        try {
            // Buscar índices das colunas principais (case-insensitive)
            const submissionIdIndex = this.findColumnIndex(headers, 'submission id');
            const respondentIdIndex = this.findColumnIndex(headers, 'respondent id');  
            const submittedAtIndex = this.findColumnIndex(headers, 'submitted at');
            const nameIndex = this.findColumnIndex(headers, 'qual o seu nome');
            const emailIndex = this.findColumnIndex(headers, 'qual o seu e-mail');

            console.log(`🔍 Índices encontrados:`);
            console.log(`   Submission ID: ${submissionIdIndex}`);
            console.log(`   Respondent ID: ${respondentIdIndex}`);
            console.log(`   Submitted At: ${submittedAtIndex}`);
            console.log(`   Nome: ${nameIndex}`);
            console.log(`   Email: ${emailIndex}`);

            // Encontrar índices das perguntas (F até T = colunas 5 até 19)
            const questionStartIndex = 5; // Coluna F
            const questionEndIndex = questionStartIndex + this.questionsCount - 1; // Coluna T
            
            console.log(`❓ Questões nas colunas ${questionStartIndex} até ${questionEndIndex}`);

            const parsedData = [];

            for (let i = 0; i < dataRows.length; i++) {
                const row = dataRows[i];
                
                // Pular linhas vazias
                if (!row || row.length === 0 || !row[submissionIdIndex]) {
                    continue;
                }

                // Dados básicos
                const record = {
                    submission_id: row[submissionIdIndex] || '',
                    respondent_id: row[respondentIdIndex] || '',
                    submitted_at: this.parseDate(row[submittedAtIndex]),
                    name: row[nameIndex] || '',
                    email: row[emailIndex] || '',
                };

                // Adicionar respostas das questões
                for (let q = 0; q < this.questionsCount; q++) {
                    const columnIndex = questionStartIndex + q;
                    const questionKey = `question_${q + 1}`;
                    record[questionKey] = row[columnIndex] || '';
                }

                parsedData.push(record);
            }

            console.log(`✅ ${parsedData.length} registros processados`);
            return parsedData;

        } catch (error) {
            console.error('❌ Erro ao processar dados CSV:', error);
            throw error;
        }
    }

    findColumnIndex(headers, searchTerm) {
        const index = headers.findIndex(header => 
            header && header.toLowerCase().trim() === searchTerm.toLowerCase().trim()
        );
        
        if (index === -1) {
            throw new Error(`Coluna "${searchTerm}" não encontrada. Headers disponíveis: ${headers.join(', ')}`);
        }
        
        return index;
    }

    parseDate(dateStr) {
        if (!dateStr) return null;
        
        try {
            // Formato esperado do Tally: "MM/DD/YYYY HH:MM:SS"
            const date = new Date(dateStr);
            return date.toISOString();
        } catch (error) {
            console.warn(`⚠️ Erro ao processar data: ${dateStr}`);
            return null;
        }
    }

    async getExistingSubmissionIds() {
        try {
            const { data, error } = await this.supabase
                .from(this.tableName)
                .select('submission_id');
                
            if (error) {
                throw error;
            }
            
            return new Set(data.map(row => row.submission_id));
            
        } catch (error) {
            console.error('❌ Erro ao buscar IDs existentes:', error);
            throw error;
        }
    }
}

module.exports = TallySync;
