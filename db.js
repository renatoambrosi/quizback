const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.WHATSAPP_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDb() {
    try {
        // Leads — todos que pagaram e receberam o resultado
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                uid VARCHAR(50) NOT NULL UNIQUE,
                nome VARCHAR(255),
                telefone VARCHAR(20),
                email VARCHAR(255),
                status VARCHAR(30) DEFAULT 'aguardando_convite',
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        // Adiciona coluna status se não existir (migração)
        await pool.query(`
            ALTER TABLE leads ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'aguardando_convite'
        `).catch(() => {});

        await pool.query(`
            CREATE TABLE IF NOT EXISTS sessoes_agendadas (
                id SERIAL PRIMARY KEY,
                nome VARCHAR(255) NOT NULL,
                telefone VARCHAR(20) NOT NULL,
                data_sessao DATE NOT NULL,
                confirmado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS mensagens_enviadas (
                id SERIAL PRIMARY KEY,
                referencia_id INTEGER NOT NULL,
                tabela_origem VARCHAR(50) NOT NULL,
                etapa VARCHAR(50) NOT NULL,
                enviado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS cancelados (
                id SERIAL PRIMARY KEY,
                uid VARCHAR(50),
                nome VARCHAR(255),
                telefone VARCHAR(20),
                email VARCHAR(255),
                cancelado_em TIMESTAMP DEFAULT NOW(),
                criado_em TIMESTAMP
            )
        `);

        await pool.query(`
            CREATE TABLE IF NOT EXISTS passados (
                id SERIAL PRIMARY KEY,
                uid VARCHAR(50),
                nome VARCHAR(255),
                telefone VARCHAR(20),
                email VARCHAR(255),
                semana DATE NOT NULL,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        // Mensagens editáveis pelo painel
        await pool.query(`
            CREATE TABLE IF NOT EXISTS mensagens_config (
                id SERIAL PRIMARY KEY,
                chave VARCHAR(50) NOT NULL UNIQUE,
                titulo VARCHAR(100) NOT NULL,
                texto TEXT NOT NULL,
                atualizado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        // Configurações gerais (chave/valor) — toggle de pausa etc
        await pool.query(`
            CREATE TABLE IF NOT EXISTS configuracoes (
                chave VARCHAR(80) PRIMARY KEY,
                valor TEXT NOT NULL,
                atualizado_em TIMESTAMP DEFAULT NOW()
            )
        `);

        // Seed: toggle de pausa padrão = 'false' (envios ATIVOS por padrão)
        await pool.query(
            `INSERT INTO configuracoes (chave, valor)
             VALUES ('envios_sessao_pausados', 'false')
             ON CONFLICT (chave) DO NOTHING`
        );

        // Seed das mensagens padrão
        const mensagensPadrao = [
            {
                chave: 'convite',
                titulo: 'Convite (15min após pagamento)',
                texto: 'Olá, {nome}! 🌟\n\n*Você gostou do seu resultado do Teste de Prosperidade?* Gostaria de te convidar para uma Sessão de Diagnóstico ao vivo e gratuita onde vamos aprofundar o que o teste revelou sobre você.\n\n👉 Clique aqui para saber mais e agendar:\n{link}'
            },
            {
                chave: 'reconvite',
                titulo: 'Reconvite (apenas manual)',
                texto: 'Olá, {nome}! 👋 Ainda dá tempo de garantir sua vaga na Sessão de Diagnóstico! As vagas são limitadas e eu adoraria te ver por lá. 💛\n\n👉 Clique aqui para confirmar:\n{link}'
            },
            {
                chave: 'confirmacao',
                titulo: 'Confirmação de agendamento',
                texto: 'Olá, {nome}! 🎉\n\nSua vaga na Sessão de Diagnóstico está confirmada!\n\n📅 Sábado às 14h\n\nEntre no grupo da sessão pelo link abaixo para receber todas as informações:\n\n👉 {grupo_link}\n\nAté sábado! 🌟\n— Suellen Seragi'
            },
            {
                chave: 'quarta',
                titulo: 'Quarta-feira — aquecimento (grupo)',
                texto: 'Olá, amores! ✨\n\nEstou te esperando na Sessão de Diagnóstico, nesse sábado às 14h pra falarmos como nossa mente vence as travas para prosperar!\n\nO que vou falar para vocês na nossa reunião, abrirá uma janela de Deus na sua vida, que você nem imagina ainda. 🪟☀️\n\nAté lá!⚡\n— Suellen Seragi'
            },
            {
                chave: 'sexta',
                titulo: 'Sexta-feira — é amanhã (grupo)',
                texto: 'Olá, amores! 🌟\n\nAmanhã é o grande dia! Nossa Sessão de Diagnóstico começa às 14h.\n\nSepara um lugar tranquilo, sem distrações, e chega no horário — o início é muito importante para aproveitar tudo. 🙏\n\nAté amanhã! 💛\n— Suellen Seragi'
            },
            {
                chave: 'sabado_1h',
                titulo: 'Sábado 13h — falta 1 hora (grupo)',
                texto: 'Amores, falta 1 hora! ⏰\n\nNossa Sessão de Diagnóstico começa às 14h. Já deixa o link aberto:\n\n👉 {meet_link}\n\nAté já! 🌟'
            },
            {
                chave: 'sabado_15min',
                titulo: 'Sábado 13h45 — faltam 15 minutos (grupo)',
                texto: 'Amores, faltam 15 minutos! 🚀\n\nEntra agora para não perder o início:\n\n👉 {meet_link}\n\nTe vejo já! 💛'
            }
        ];

        for (const msg of mensagensPadrao) {
            await pool.query(
                `INSERT INTO mensagens_config (chave, titulo, texto)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (chave) DO NOTHING`,
                [msg.chave, msg.titulo, msg.texto]
            );
        }

        console.log('✅ Banco de dados iniciado');
    } catch (error) {
        console.error('❌ Erro ao iniciar banco:', error.message);
    }
}

// ── SÁBADO VIGENTE ──
function proximoSabado() {
    const hoje = new Date();
    const diasParaSabado = (6 - hoje.getDay() + 7) % 7 || 7;
    const sabado = new Date(hoje);
    sabado.setDate(hoje.getDate() + diasParaSabado);
    return sabado.toISOString().split('T')[0];
}

// ── CONFIGURAÇÕES (chave/valor) ──

async function getConfig(chave) {
    try {
        const result = await pool.query(`SELECT valor FROM configuracoes WHERE chave = $1`, [chave]);
        return result.rows[0]?.valor ?? null;
    } catch (error) {
        console.error('❌ Erro ao buscar config:', error.message);
        return null;
    }
}

async function setConfig(chave, valor) {
    try {
        await pool.query(
            `INSERT INTO configuracoes (chave, valor, atualizado_em)
             VALUES ($1, $2, NOW())
             ON CONFLICT (chave) DO UPDATE SET valor = $2, atualizado_em = NOW()`,
            [chave, String(valor)]
        );
        console.log(`✅ Config '${chave}' = ${valor}`);
    } catch (error) {
        console.error('❌ Erro ao salvar config:', error.message);
        throw error;
    }
}

async function enviosSessaoPausados() {
    const valor = await getConfig('envios_sessao_pausados');
    return valor === 'true';
}

// ── MENSAGENS CONFIG ──

async function getMensagemConfig(chave) {
    try {
        const result = await pool.query(`SELECT texto FROM mensagens_config WHERE chave = $1`, [chave]);
        return result.rows[0]?.texto || null;
    } catch (error) {
        console.error('❌ Erro ao buscar mensagem:', error.message);
        return null;
    }
}

async function listarMensagensConfig() {
    try {
        const result = await pool.query(`SELECT * FROM mensagens_config ORDER BY id`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar mensagens config:', error.message);
        return [];
    }
}

async function atualizarMensagemConfig(chave, texto) {
    try {
        await pool.query(
            `UPDATE mensagens_config SET texto = $1, atualizado_em = NOW() WHERE chave = $2`,
            [texto, chave]
        );
        console.log(`✅ Mensagem '${chave}' atualizada`);
    } catch (error) {
        console.error('❌ Erro ao atualizar mensagem:', error.message);
        throw error;
    }
}

// ── LEADS ──

async function registrarLead(uid, nome, telefone, email) {
    try {
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, status)
             VALUES ($1, $2, $3, $4, 'aguardando_convite')
             ON CONFLICT (uid) DO UPDATE SET nome = $2, telefone = $3, email = $4`,
            [uid, nome, telefone, email]
        );
        console.log(`✅ Lead registrado: ${nome} (${uid})`);
    } catch (error) {
        console.error('❌ Erro ao registrar lead:', error.message);
    }
}

async function atualizarStatusLead(uid, status) {
    try {
        await pool.query(`UPDATE leads SET status = $1 WHERE uid = $2`, [status, uid]);
        console.log(`✅ Lead ${uid} → status: ${status}`);
    } catch (error) {
        console.error('❌ Erro ao atualizar status lead:', error.message);
    }
}

async function marcarLeadConfirmadoPorTelefone(telefone) {
    try {
        await pool.query(
            `UPDATE leads SET status = 'confirmado' WHERE telefone = $1`,
            [telefone]
        );
        console.log(`✅ Lead ${telefone} marcado como confirmado`);
    } catch (error) {
        console.error('❌ Erro ao marcar lead confirmado:', error.message);
    }
}

async function buscarLeadPorUid(uid) {
    try {
        const result = await pool.query(`SELECT * FROM leads WHERE uid = $1`, [uid]);
        return result.rows[0] || null;
    } catch (error) {
        console.error('❌ Erro ao buscar lead:', error.message);
        return null;
    }
}

async function listarLeads() {
    try {
        const result = await pool.query(`SELECT * FROM leads ORDER BY criado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar leads:', error.message);
        return [];
    }
}

async function atualizarLead(id, campos) {
    try {
        const sets = Object.keys(campos).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const valores = [id, ...Object.values(campos)];
        await pool.query(`UPDATE leads SET ${sets} WHERE id = $1`, valores);
    } catch (error) {
        console.error('❌ Erro ao atualizar lead:', error.message);
        throw error;
    }
}

async function deletarLead(id) {
    try {
        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao deletar lead:', error.message);
        throw error;
    }
}

async function adicionarLead(uid, nome, telefone, email) {
    try {
        const result = await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, status) VALUES ($1, $2, $3, $4, 'aguardando_convite') RETURNING id`,
            [uid || `manual-${Date.now()}`, nome, telefone, email]
        );
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Erro ao adicionar lead:', error.message);
        throw error;
    }
}

async function cancelarLead(id) {
    try {
        const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
        if (!lead.rows.length) throw new Error('Lead não encontrado');
        const l = lead.rows[0];
        await pool.query(
            `INSERT INTO cancelados (uid, nome, telefone, email, criado_em) VALUES ($1, $2, $3, $4, $5)`,
            [l.uid, l.nome, l.telefone, l.email, l.criado_em]
        );
        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao cancelar lead:', error.message);
        throw error;
    }
}

async function moverParaPassados(id) {
    try {
        const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
        if (!lead.rows.length) throw new Error('Lead não encontrado');
        const l = lead.rows[0];
        const semana = proximoSabado();
        await pool.query(
            `INSERT INTO passados (uid, nome, telefone, email, semana, criado_em) VALUES ($1, $2, $3, $4, $5, $6)`,
            [l.uid, l.nome, l.telefone, l.email, semana, l.criado_em]
        );
        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao mover para passados:', error.message);
        throw error;
    }
}

// ── SESSOES_AGENDADAS ──

async function salvarSessaoAgendada(nome, telefone, dataSessao) {
    try {
        const result = await pool.query(
            `INSERT INTO sessoes_agendadas (nome, telefone, data_sessao) VALUES ($1, $2, $3) RETURNING id`,
            [nome, telefone, dataSessao]
        );
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Erro ao salvar sessão:', error.message);
        throw error;
    }
}

async function listarSessoes() {
    try {
        const result = await pool.query(`SELECT * FROM sessoes_agendadas ORDER BY confirmado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar sessoes:', error.message);
        return [];
    }
}

async function atualizarSessao(id, campos) {
    try {
        const sets = Object.keys(campos).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const valores = [id, ...Object.values(campos)];
        await pool.query(`UPDATE sessoes_agendadas SET ${sets} WHERE id = $1`, valores);
    } catch (error) {
        console.error('❌ Erro ao atualizar sessão:', error.message);
        throw error;
    }
}

async function deletarSessao(id) {
    try {
        await pool.query(`DELETE FROM sessoes_agendadas WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao deletar sessão:', error.message);
        throw error;
    }
}

async function adicionarSessao(nome, telefone, dataSessao) {
    try {
        const result = await pool.query(
            `INSERT INTO sessoes_agendadas (nome, telefone, data_sessao) VALUES ($1, $2, $3) RETURNING id`,
            [nome, telefone, dataSessao]
        );
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Erro ao adicionar sessão:', error.message);
        throw error;
    }
}

// ── MENSAGENS_ENVIADAS ──

async function registrarMensagem(referenciaId, tabelaOrigem, etapa) {
    try {
        await pool.query(
            `INSERT INTO mensagens_enviadas (referencia_id, tabela_origem, etapa) VALUES ($1, $2, $3)`,
            [referenciaId, tabelaOrigem, etapa]
        );
    } catch (error) {
        console.error('❌ Erro ao registrar mensagem:', error.message);
    }
}

async function jaEnviou(referenciaId, tabelaOrigem, etapa) {
    try {
        const result = await pool.query(
            `SELECT 1 FROM mensagens_enviadas WHERE referencia_id = $1 AND tabela_origem = $2 AND etapa = $3`,
            [referenciaId, tabelaOrigem, etapa]
        );
        return result.rows.length > 0;
    } catch (error) {
        return false;
    }
}

async function listarMensagensEnviadas() {
    try {
        const result = await pool.query(`SELECT * FROM mensagens_enviadas ORDER BY enviado_em DESC`);
        return result.rows;
    } catch (error) {
        return [];
    }
}

// ── CANCELADOS ──

async function listarCancelados() {
    try {
        const result = await pool.query(`SELECT * FROM cancelados ORDER BY cancelado_em DESC`);
        return result.rows;
    } catch (error) {
        return [];
    }
}

async function reativarCancelado(id) {
    try {
        const row = await pool.query(`SELECT * FROM cancelados WHERE id = $1`, [id]);
        if (!row.rows.length) throw new Error('Cancelado não encontrado');
        const c = row.rows[0];
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, status, criado_em)
             VALUES ($1, $2, $3, $4, 'aguardando_convite', $5)
             ON CONFLICT (uid) DO NOTHING`,
            [c.uid || `reativado-${Date.now()}`, c.nome, c.telefone, c.email, c.criado_em || new Date()]
        );
        await pool.query(`DELETE FROM cancelados WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao reativar cancelado:', error.message);
        throw error;
    }
}

async function deletarCancelado(id) {
    try {
        await pool.query(`DELETE FROM cancelados WHERE id = $1`, [id]);
    } catch (error) {
        throw error;
    }
}

// ── PASSADOS ──

async function listarPassados() {
    try {
        const result = await pool.query(`SELECT * FROM passados ORDER BY semana DESC, criado_em DESC`);
        return result.rows;
    } catch (error) {
        return [];
    }
}

async function reativarPassado(id) {
    try {
        const row = await pool.query(`SELECT * FROM passados WHERE id = $1`, [id]);
        if (!row.rows.length) throw new Error('Passado não encontrado');
        const p = row.rows[0];
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, status, criado_em)
             VALUES ($1, $2, $3, $4, 'aguardando_convite', $5)
             ON CONFLICT (uid) DO NOTHING`,
            [p.uid || `reativado-${Date.now()}`, p.nome, p.telefone, p.email, p.criado_em || new Date()]
        );
        await pool.query(`DELETE FROM passados WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao reativar passado:', error.message);
        throw error;
    }
}

async function deletarPassado(id) {
    try {
        await pool.query(`DELETE FROM passados WHERE id = $1`, [id]);
    } catch (error) {
        throw error;
    }
}

module.exports = {
    initDb,
    proximoSabado,
    // configurações (chave/valor)
    getConfig,
    setConfig,
    enviosSessaoPausados,
    // mensagens config
    getMensagemConfig,
    listarMensagensConfig,
    atualizarMensagemConfig,
    // leads
    registrarLead,
    atualizarStatusLead,
    marcarLeadConfirmadoPorTelefone,
    buscarLeadPorUid,
    listarLeads,
    atualizarLead,
    deletarLead,
    adicionarLead,
    cancelarLead,
    moverParaPassados,
    // sessoes
    salvarSessaoAgendada,
    listarSessoes,
    atualizarSessao,
    deletarSessao,
    adicionarSessao,
    // mensagens enviadas
    registrarMensagem,
    jaEnviou,
    listarMensagensEnviadas,
    // cancelados
    listarCancelados,
    reativarCancelado,
    deletarCancelado,
    // passados
    listarPassados,
    reativarPassado,
    deletarPassado,
};
