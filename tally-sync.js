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
    
        // Mapeamento das 15 perguntas para energias
        this.mapaRespostas = {
            // PERGUNTA 1: Quando vejo alguém enriquecer sem valores ou princípios, sinto:
            "Frustração. Parece que nada muda, já fiz o certo e o errado e não consegui nada.": "Desordem",
            "Motivação, porque não existe verdade, apenas resultado.": "Autossuficiência",
            "Decido estudar mais e subir do jeito certo, mas sem ingenuidade.": "Prosperidade",
            "Se alguém consegue dessa forma, eu também posso, só que da forma certa.": "Validação",
            "Raiva. É sempre assim: os bonzinhos só se ferram.": "Medo",

            // PERGUNTA 2: Quando penso no meu potencial de gerar renda, sinto:
            "Não sei nem por onde começar.": "Desordem",
            "Duvido. Às vezes acho que minha realidade não permite isso.": "Medo",
            "Acredito que posso crescer em qualquer lugar.": "Prosperidade",
            "Sinto que preciso alcançar um certo nível grande para me sentir realizado e reconhecido.": "Validação",
            "Tenho convicção de que, com foco e lógica, eu consigo.": "Autossuficiência",

            // PERGUNTA 3: Se surge um conflito sério com alguém importante, eu:
            "Deixo pra lá e sigo em frente para os meus objetivos.": "Autossuficiência",
            "Converso com calma, busco entender o outro lado e não ver só o meu.": "Prosperidade",
            "Falo demais ou fico no meu canto e acabo piorando a situação, sem querer.": "Desordem",
            "Evito conversar por medo de desagradar ou ter conflito com a pessoa.": "Medo",
            "Tento evitar confronto ou tento resolver mas fico chateado quando não consigo.": "Validação",

            // PERGUNTA 4: Ao perceber sintomas físicos inesperados, eu:
            "Torço e peço para me ajudarem ao máximo porque me sinto fragilizado.": "Validação",
            "Procuro resolver sozinho com remédios por conta própria.": "Autossuficiência",
            "Me preocupo mais do que deveria.": "Medo",
            "Creio que está tudo bem, mas me cuido para garantir a boa recuperação.": "Prosperidade",
            "Ignoro o máximo, até realmente eu precisar tratar.": "Desordem",

            // PERGUNTA 5: Minha relação com exercícios físicos é:
            "Considero fazer mesmo não gostando, pois tenho insatisfação ou vergonha do meu corpo.": "Validação",
            "Começo e paro diversas vezes, sempre me perdendo na rotina.": "Desordem",
            "Pratico com frequência e consciência, respeitando meus limites.": "Prosperidade",
            "Não faço por desânimo, medo de lesões ou vergonha.": "Medo",
            "Sou extremamente disciplinado.": "Autossuficiência",

            // PERGUNTA 6: Como reajo ao perceber que preciso melhorar minha alimentação:
            "Se realmente eu precisar, serei firme.": "Autossuficiência",
            "Quando estou bem eu como bem. Mas quando fico mal eu desando.": "Validação",
            "Faço ajustes graduais e consistentes.": "Prosperidade",
            "Faço mudanças bruscas e acabo desistindo rapidamente.": "Desordem",
            "Fico ansioso e tento mudar, mas não consigo.": "Medo",

            // PERGUNTA 7: Quando analiso minhas dificuldades, eu:
            "Costumo me sentir inútil e impotente para mudar as coisas.": "Validação",
            "Sinto o quanto a vida não é justa.": "Autossuficiência",
            "Lembro que eu sempre colho o que planto e fico em paz.": "Prosperidade",
            "Acho muito difícil qualquer mudança.": "Medo",
            "Me distraio fazendo várias coisas para não pensar nisso.": "Desordem",

            // PERGUNTA 8: Se algo sai do meu controle, eu:
            "Aceito com calma e reorganizo minhas ações com clareza.": "Prosperidade",
            "Fico inquieto e incomodado com as coisas que me atrapalham.": "Validação",
            "Fico ansioso pensando nas consequências negativas.": "Medo",
            "Resolvo sozinho, pois não quero depender de ninguém.": "Autossuficiência",
            "Me perco mentalmente, sem saber exatamente por onde recomeçar.": "Desordem",

            // PERGUNTA 9: Quando preciso tomar uma decisão importante:
            "Evito contrariar pessoas ao tomar decisões.": "Validação",
            "Faço o que der na hora. Depois eu vejo se foi o certo.": "Desordem",
            "Avalio rapidamente e tomo minha decisão.": "Autossuficiência",
            "Adio até o último segundo.": "Medo",
            "Coloco no papel, penso e ajo com o que tenho em mãos.": "Prosperidade",

            // PERGUNTA 10: Como lido com os meus próprios erros:
            "Realmente aprendi com eles.": "Prosperidade",
            "Fico péssimo, me martirizando.": "Validação",
            "Evito pensar nisso. Fico mal quando lembro.": "Desordem",
            "Odeio errar. Mas as vezes acontece.": "Autossuficiência",
            "Me culpo até hoje. Aquilo nunca deveria ter acontecido.": "Medo",

            // PERGUNTA 11: Como lido com períodos emocionalmente difíceis:
            "Desorganizo tudo. Depois tento arrumar.": "Desordem",
            "Reavalio com calma, sabendo que emoção e realidade não se misturam.": "Prosperidade",
            "Choro muito. Todas as minhas falhas vêm à tona ao mesmo tempo.": "Validação",
            "Fico firme e busco resolver rápido.": "Autossuficiência",
            "Me retraio, o que eu fizer a mais poderá dar errado.": "Medo",

            // PERGUNTA 12: Como costumo reagir quando uma meta não é alcançada no prazo:
            "Avalio onde errei e ajusto com calma.": "Prosperidade",
            "Me incomoda, mas faço quando der.": "Desordem",
            "Fico com a sensação que fracassei.": "Validação",
            "Fico com vontade de sumir para não lidar com as consequências.": "Medo",
            "Eu corro para compensar.": "Autossuficiência",

            // PERGUNTA 13: O que mais me trava quando penso em alinhar minha vida ao meu propósito é:
            "A correria e obrigações do dia a dia, que sempre tomam todo meu tempo.": "Desordem",
            "Parece que ninguém me enxerga e esse propósito nunca vai acontecer.": "Validação",
            "Ter que aprender a esperar tempo que leva para ter mais respostas.": "Prosperidade",
            "O medo de que seja tarde demais — ou que não tenha propósito nenhum na minha vida.": "Medo",
            "Não posso abrir mão do que já construí.": "Autossuficiência",

            // PERGUNTA 14: Se alguém me pedisse hoje para descrever meu propósito em poucas palavras, eu diria:
            "Servir é o meu propósito.": "Autossuficiência",
            "Uma jornada mágica, que conecta quem eu sou com o que posso oferecer ao mundo.": "Prosperidade",
            "Depende do dia. Ora tenho dúvida, ora convicção.": "Desordem",
            "Quero me sentir útil e realizada cumprindo meu propósito.": "Validação",
            "Não sei ao certo… e isso me constrange mais do que eu gostaria de admitir.": "Medo",

            // PERGUNTA 15: Se eu partisse hoje, o que acredito que deixaria para os outros:
            "Uma pessoa que venceu muitas lutas e adversidades.": "Autossuficiência",
            "Exemplo de fé, transformação e sementes plantadas.": "Prosperidade",
            "Nada claro. Vivo dia após dia fazendo meu melhor.": "Desordem",
            "Deixaria pouco, mas com orgulho de que conquistei com luta e honestidade.": "Medo",
            "A imagem de alguém que quis acertar embora nem sempre conseguisse.": "Validação"
        };
    
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
    // NOVA FUNÇÃO: CALCULAR ENERGIA DAS RESPOSTAS
    // ============================================
    calcularEnergia(respostas) {
        console.log('🧮 Iniciando cálculo da energia predominante');
        console.log('📋 Respostas recebidas:', respostas.length, 'respostas');

        // Contador de cada tipo de energia
        const contagem = {
            "Medo": 0,
            "Desordem": 0,
            "Validação": 0,
            "Autossuficiência": 0,
            "Prosperidade": 0
        };

        // Contagem das respostas
        let respostasEncontradas = 0;
        respostas.forEach((resposta, index) => {
            const tipo = this.mapaRespostas[resposta];
            if (tipo) {
                contagem[tipo]++;
                respostasEncontradas++;
                console.log(`✅ Pergunta ${index + 1}: "${resposta}" → ${tipo}`);
            } else {
                console.warn(`⚠️ Pergunta ${index + 1}: Resposta não encontrada no mapa: "${resposta}"`);
            }
        });

        console.log(`📊 Total de respostas mapeadas: ${respostasEncontradas}/15`);
        console.log('🔢 Contadores finais:', contagem);

        if (respostasEncontradas === 0) {
            console.error('❌ Nenhuma resposta foi mapeada!');
            return "Erro no cálculo da energia";
        }

        // Calcular percentuais
        const total = Object.values(contagem).reduce((acc, val) => acc + val, 0);
        const percentuais = {};
        for (let tipo in contagem) {
            percentuais[tipo] = total > 0 ? Math.round((contagem[tipo] / total) * 100) : 0;
        }

        console.log('📈 Percentuais calculados:', percentuais);

        // Encontrar tipo predominante
        let max = 0;
        let elementoPredominante = "";
        for (let tipo in contagem) {
            if (contagem[tipo] > max) {
                max = contagem[tipo];
                elementoPredominante = tipo;
            }
        }

        // Determinar diagnóstico final
        let diagnostico = "";
        switch (elementoPredominante) {
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
                // LÓGICA DOS NÍVEIS baseada no percentual
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

        console.log(`🎯 Energia predominante calculada: ${diagnostico}`);
        console.log(`📊 ${elementoPredominante}: ${max}/${total} (${percentuais[elementoPredominante]}%)`);
        
        return diagnostico;
    }

    // ============================================
    // NOVA FUNÇÃO: PROCESSAR WEBHOOK DO TALLY
    // ============================================
    async processarWebhookTally(tallyData) {
        try {
            console.log('📝 Processando dados do webhook Tally');
            
            // Extrair dados dos campos do Tally
            let nome = '';
            let email = '';
            const respostas = [];
            
            // Percorrer os campos do Tally
            if (tallyData.fields) {
                tallyData.fields.forEach(field => {
                    if (field.type === 'INPUT_TEXT' && !email && field.value) {
                        // Primeiro campo de texto é o nome
                        nome = field.value.trim();
                    } else if (field.type === 'EMAIL' && field.value) {
                        // Campo de email
                        email = field.value.trim();
                    } else if (field.type === 'MULTIPLE_CHOICE' && field.value) {
                        // Respostas de múltipla escolha (as 15 perguntas)
                        respostas.push(field.value.trim());
                    }
                });
            }
            
            if (!email) {
                throw new Error('Email não encontrado nos dados do Tally');
            }
            
            if (respostas.length !== 15) {
                console.warn(`⚠️ Esperadas 15 respostas, recebidas ${respostas.length}`);
            }
            
            console.log(`👤 Nome: ${nome}`);
            console.log(`📧 Email: ${email}`);
            console.log(`📋 Respostas: ${respostas.length}`);
            
            // Calcular energia predominante
            const energiaCalculada = this.calcularEnergia(respostas);
            
            // Preparar dados para salvar no Supabase
            const userData = {
                uid: tallyData.responseId || require('crypto').randomUUID(),
                nome: nome || 'Nome não informado',
                email: email,
                respostas: JSON.stringify(respostas),
                energia_calculada: energiaCalculada,
                data_registro: this.getBrazilianDateTime(),
                iniciar_teste: true,
                concluir_teste: true,
                status_pgto_teste: 'PENDENTE',
                aceita_emails: true
            };
            
            console.log('💾 Salvando no Supabase:', userData);
            
            // Usar UPSERT para evitar duplicatas
            const { data: insertedData, error } = await this.supabase
                .from(this.tableName)
                .upsert(userData, { onConflict: 'email' }) // Usar email como chave única
                .select();
                
            if (error) {
                console.error('❌ Erro ao salvar no Supabase:', error);
                throw error;
            }
            
            console.log('✅ Dados salvos com sucesso no Supabase');
            return insertedData[0];
            
        } catch (error) {
            console.error('❌ Erro ao processar webhook Tally:', error);
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
            return 'Erro ao obter resultado';
        }
    }
}

module.exports = TallySync;
