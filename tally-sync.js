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
    // FUNÇÃO PARA CONVERTER QUALQUER DATA PARA FORMATO BRASILEIRO
    // ============================================
    convertDateToBrazilian(inputDate = null) {
        // Se não receber data, usa data atual
        const date = inputDate ? new Date(inputDate) : new Date();
        
        // Obter componentes da data em GMT-3 (Brasil)
        const options = {
            timeZone: 'America/Sao_Paulo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        
        const formatter = new Intl.DateTimeFormatter('pt-BR', options);
        const parts = formatter.formatToParts(date);
        
        const day = parts.find(part => part.type === 'day').value;
        const month = parts.find(part => part.type === 'month').value;
        const year = parts.find(part => part.type === 'year').value;
        const hour = parts.find(part => part.type === 'hour').value;
        const minute = parts.find(part => part.type === 'minute').value;
        const second = parts.find(part => part.type === 'second').value;
        
        return `${day}-${month}-${year} ${hour}:${minute}:${second}`;
    }

    // ============================================
    // FASE 1: BUSCAR USUÁRIO POR UID (MANTIDA IGUAL)
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
                data_registro: this.convertDateToBrazilian(data.respostas[2]), // ✅ Data do Tally convertida
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
    // FASE 2: ATUALIZAR APÓS PAGAMENTO + CÁLCULO INTERNO
    // ============================================
    async updateUserAfterPayment(uid, paymentData) {
        try {
            console.log(`💳 FASE 2: Atualizando usuário ${uid} após pagamento`);
            
            // 1. Calcular resultado do teste internamente (SEM SCRAPING)
            const resultadoTeste = await this.calcularResultadoTeste(uid);
            
            // 2. Preparar dados de atualização
            const updateData = {
                status_pgto_teste: 'PAGO',
                valor_pgto_teste: '18,81',
                data_pgto_teste: paymentData.date_approved ? 
                    this.convertDateToBrazilian(paymentData.date_approved) : 
                    this.convertDateToBrazilian(),
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
    // CÁLCULO INTERNO DO RESULTADO (SUBSTITUI O SCRAPING)
    // ============================================
    async calcularResultadoTeste(uid) {
        try {
            console.log(`🧮 Calculando resultado internamente para UID: ${uid}`);
            
            // 1. Buscar respostas do Google Apps Script (mesmo endpoint da Fase 1)
            const endpoint = `https://script.google.com/macros/s/AKfycbyK60u_BJFxEc573yD-LhwTJ_mDL4JxsOaZ2Pj7lkbo_k66lapaxx81Ey909-3UqFw6/exec?uid=${uid}`;
            
            const response = await fetch(endpoint, { method: "get" });
            if (!response.ok) {
                throw new Error(`Erro ao buscar dados: ${response.status}`);
            }
            
            const data = await response.json();
            const respostas = data.respostas;
            
            console.log(`📋 Respostas recebidas (${respostas.length}):`, respostas);
            
            // 2. Mapeamento EXATO das 15 perguntas → tags
            const mapaRespostas = {
                // PERGUNTA 1
                "Frustração. Parece que nada muda, já fiz o certo e o errado e não consegui nada.": "Desordem",
                "Motivação, porque não existe verdade, apenas resultado.": "Autossuficiência",
                "Decido estudar mais e subir do jeito certo, mas sem ingenuidade.": "Prosperidade",
                "Se alguém consegue dessa forma, eu também posso, só que da forma certa.": "Validação",
                "Raiva. É sempre assim: os bonzinhos só se ferram.": "Medo",

                // PERGUNTA 2
                "Não sei nem por onde começar.": "Desordem",
                "Duvido. Às vezes acho que minha realidade não permite isso.": "Medo",
                "Acredito que posso crescer em qualquer lugar.": "Prosperidade",
                "Sinto que preciso alcançar um certo nível grande para me sentir realizado e reconhecido.": "Validação",
                "Tenho convicção de que, com foco e lógica, eu consigo.": "Autossuficiência",

                // PERGUNTA 3
                "Deixo pra lá e sigo em frente para os meus objetivos.": "Autossuficiência",
                "Converso com calma, busco entender o outro lado e não ver só o meu.": "Prosperidade",
                "Falo demais ou fico no meu canto e acabo piorando a situação, sem querer.": "Desordem",
                "Evito conversar por medo de desagradar ou ter conflito com a pessoa.": "Medo",
                "Tento evitar confronto ou tento resolver mas fico chateado quando não consigo.": "Validação",

                // PERGUNTA 4
                "Torço e peço para me ajudarem ao máximo porque me sinto fragilizado.": "Validação",
                "Procuro resolver sozinho com remédios por conta própria.": "Autossuficiência",
                "Me preocupo mais do que deveria.": "Medo",
                "Creio que está tudo bem, mas me cuido para garantir a boa recuperação.": "Prosperidade",
                "Ignoro o máximo, até realmente eu precisar tratar.": "Desordem",

                // PERGUNTA 5
                "Considero fazer mesmo não gostando, pois tenho insatisfação ou vergonha do meu corpo.": "Validação",
                "Começo e paro diversas vezes, sempre me perdendo na rotina.": "Desordem",
                "Pratico com frequência e consciência, respeitando meus limites.": "Prosperidade",
                "Não faço por desânimo, medo de lesões ou vergonha.": "Medo",
                "Sou extremamente disciplinado.": "Autossuficiência",

                // PERGUNTA 6
                "Se realmente eu precisar, serei firme.": "Autossuficiência",
                "Quando estou bem eu como bem. Mas quando fico mal eu desando.": "Validação",
                "Faço ajustes graduais e consistentes.": "Prosperidade",
                "Faço mudanças bruscas e acabo desistindo rapidamente.": "Desordem",
                "Fico ansioso e tento mudar, mas não consigo.": "Medo",

                // PERGUNTA 7
                "Costumo me sentir inútil e impotente para mudar as coisas.": "Validação",
                "Sinto o quanto a vida não é justa.": "Autossuficiência",
                "Lembro que eu sempre colho o que planto e fico em paz.": "Prosperidade",
                "Acho muito difícil qualquer mudança.": "Medo",
                "Me distraio fazendo várias coisas para não pensar nisso.": "Desordem",

                // PERGUNTA 8
                "Aceito com calma e reorganizo minhas ações com clareza.": "Prosperidade",
                "Fico inquieto e incomodado com as coisas que me atrapalham.": "Validação",
                "Fico ansioso pensando nas consequências negativas.": "Medo",
                "Resolvo sozinho, pois não quero depender de ninguém.": "Autossuficiência",
                "Me perco mentalmente, sem saber exatamente por onde recomeçar.": "Desordem",

                // PERGUNTA 9
                "Evito contrariar pessoas ao tomar decisões.": "Validação",
                "Faço o que der na hora. Depois eu vejo se foi o certo.": "Desordem",
                "Avalio rapidamente e tomo minha decisão.": "Autossuficiência",
                "Adio até o último segundo.": "Medo",
                "Coloco no papel, penso e ajo com o que tenho em mãos.": "Prosperidade",

                // PERGUNTA 10
                "Realmente aprendi com eles.": "Prosperidade",
                "Fico péssimo, me martirizando.": "Validação",
                "Evito pensar nisso. Fico mal quando lembro.": "Desordem",
                "Odeio errar. Mas as vezes acontece.": "Autossuficiência",
                "Me culpo até hoje. Aquilo nunca deveria ter acontecido.": "Medo",

                // PERGUNTA 11
                "Desorganizo tudo. Depois tento arrumar.": "Desordem",
                "Reavalio com calma, sabendo que emoção e realidade não se misturam.": "Prosperidade",
                "Choro muito. Todas as minhas falhas vêm à tona ao mesmo tempo.": "Validação",
                "Fico firme e busco resolver rápido.": "Autossuficiência",
                "Me retraio, o que eu fizer a mais poderá dar errado.": "Medo",

                // PERGUNTA 12
                "Avalio onde errei e ajusto com calma.": "Prosperidade",
                "Me incomoda, mas faço quando der.": "Desordem",
                "Fico com a sensação que fracassei.": "Validação",
                "Fico com vontade de sumir para não lidar com as consequências.": "Medo",
                "Eu corro para compensar.": "Autossuficiência",

                // PERGUNTA 13
                "A correria e obrigações do dia a dia, que sempre tomam todo meu tempo.": "Desordem",
                "Parece que ninguém me enxerga e esse propósito nunca vai acontecer.": "Validação",
                "Ter que aprender a esperar tempo que leva para ter mais respostas.": "Prosperidade",
                "O medo de que seja tarde demais — ou que não tenha propósito nenhum na minha vida.": "Medo",
                "Não posso abrir mão do que já construí.": "Autossuficiência",

                // PERGUNTA 14
                "Servir é o meu propósito.": "Autossuficiência",
                "Uma jornada mágica, que conecta quem eu sou com o que posso oferecer ao mundo.": "Prosperidade",
                "Depende do dia. Ora tenho dúvida, ora convicção.": "Desordem",
                "Quero me sentir útil e realizada cumprindo meu propósito.": "Validação",
                "Não sei ao certo… e isso me constrange mais do que eu gostaria de admitir.": "Medo",

                // PERGUNTA 15
                "Uma pessoa que venceu muitas lutas e adversidades.": "Autossuficiência",
                "Exemplo de fé, transformação e sementes plantadas.": "Prosperidade",
                "Nada claro. Vivo dia após dia fazendo meu melhor.": "Desordem",
                "Deixaria pouco, mas com orgulho de que conquistei com luta e honestidade.": "Medo",
                "A imagem de alguém que quis acertar embora nem sempre conseguisse.": "Validação"
            };

            // 3. Contagem das tags (igual ao Wix)
            const contagem = {
                "Medo": 0,
                "Desordem": 0,
                "Validação": 0,
                "Autossuficiência": 0,
                "Prosperidade": 0
            };

            // 4. Processar respostas (pular nome, email e data - posições 0, 1 e 2)
            let respostasProcessadas = 0;
            for (let i = 3; i < respostas.length; i++) { // Começar da posição 3 (após nome, email e data)
                const resposta = respostas[i];
                const tag = mapaRespostas[resposta];
                
                if (tag) {
                    contagem[tag]++;
                    respostasProcessadas++;
                    console.log(`✅ Resposta ${i-2}: "${resposta}" → ${tag}`); // Ajustado para mostrar numeração correta
                } else {
                    console.warn(`⚠️ Resposta não mapeada: "${resposta}"`);
                }
            }

            console.log(`📊 Contagem final:`, contagem);
            console.log(`📈 Respostas processadas: ${respostasProcessadas}/15`);

            // 5. Calcular percentuais
            const total = Object.values(contagem).reduce((acc, val) => acc + val, 0);
            const percentuais = {};
            for (let tipo in contagem) {
                percentuais[tipo] = total > 0 ? Math.round((contagem[tipo] / total) * 100) : 0;
            }

            // 6. Encontrar tipo predominante
            let max = 0;
            let tipoPredominante = "";
            for (let tipo in contagem) {
                if (contagem[tipo] > max) {
                    max = contagem[tipo];
                    tipoPredominante = tipo;
                }
            }

            // 7. Determinar diagnóstico final (igual ao Wix)
            let diagnostico = "";
            switch (tipoPredominante) {
                case "Medo":
                    diagnostico = "Energia do Medo";
                    break;
                case "Autossuficiência":
                    diagnostico = "Energia da Autossuficiência";
                    break;
                case "Validação":
                    diagnostico = "Energia da Validação";
                    break;
                case "Desordem":
                    diagnostico = "Energia da Desordem";
                    break;
                case "Prosperidade":
                    // Lógica dos níveis (igual ao Wix)
                    const percentualProsp = percentuais["Prosperidade"];
                    if (percentualProsp <= 50) {
                        diagnostico = "Energia da Prosperidade Nv.1";
                    } else if (percentualProsp <= 80) {
                        diagnostico = "Energia da Prosperidade Nv.2";
                    } else {
                        diagnostico = "Energia da Prosperidade Nv.3";
                    }
                    break;
                default:
                    diagnostico = "Não foi possível calcular sua energia predominante.";
            }

            console.log(`🎯 Resultado calculado: ${diagnostico}`);
            console.log(`📊 Percentuais: ${JSON.stringify(percentuais)}`);
            
            return diagnostico;
            
        } catch (error) {
            console.error('❌ Erro no cálculo interno:', error);
            return 'Erro ao calcular resultado';
        }
    }

    // ============================================
    // FUNÇÃO ANTIGA DE SCRAPING (MANTIDA COMO BACKUP)
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
