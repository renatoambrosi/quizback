const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.WHATSAPP_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDb() {
    try {
        // Tabela de leads — todos que pagaram e receberam o resultado
        await pool.query(`
            CREATE TABLE IF NOT EXISTS leads (
                id SERIAL PRIMARY KEY,
                uid VARCHAR(50) NOT NULL UNIQUE,
                nome VARCHAR(255),
                telefone VARCHAR(20),
                email VARCHAR(255),
                confirmado BOOLEAN DEFAULT FALSE,
                criado_em TIMESTAMP DEFAULT NOW()
            )
        `);

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

        console.log('✅ Banco de dados iniciado (leads + sessoes_agendadas + mensagens_enviadas + cancelados + passados)');
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

// ── LEADS ──

async function registrarLead(uid, nome, telefone, email) {
    try {
        // Upsert — se o uid já existe, atualiza nome/telefone/email
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (uid) DO UPDATE SET nome = $2, telefone = $3, email = $4`,
            [uid, nome, telefone, email]
        );
        console.log(`✅ Lead registrado: ${nome} (${uid})`);
    } catch (error) {
        console.error('❌ Erro ao registrar lead:', error.message);
    }
}

async function marcarLeadConfirmado(uid) {
    try {
        await pool.query(`UPDATE leads SET confirmado = TRUE WHERE uid = $1`, [uid]);
        console.log(`✅ Lead ${uid} marcado como confirmado`);
    } catch (error) {
        console.error('❌ Erro ao marcar lead como confirmado:', error.message);
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
        console.log(`✅ Lead ${id} atualizado`);
    } catch (error) {
        console.error('❌ Erro ao atualizar lead:', error.message);
        throw error;
    }
}

async function deletarLead(id) {
    try {
        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
        console.log(`🗑️ Lead ${id} deletado`);
    } catch (error) {
        console.error('❌ Erro ao deletar lead:', error.message);
        throw error;
    }
}

async function adicionarLead(uid, nome, telefone, email) {
    try {
        const result = await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email) VALUES ($1, $2, $3, $4) RETURNING id`,
            [uid || `manual-${Date.now()}`, nome, telefone, email]
        );
        console.log(`✅ Lead ${nome} adicionado manualmente`);
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
        console.log(`❌ Lead ${l.nome} cancelado`);
    } catch (error) {
        console.error('❌ Erro ao cancelar lead:', error.message);
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
        console.log(`✅ Sessão agendada salva para ${nome} (${telefone})`);
        return result.rows[0].id;
    } catch (error) {
        console.error('❌ Erro ao salvar sessão agendada:', error.message);
        throw error;
    }
}

async function buscarConfirmadosParaSabado() {
    try {
        const dataSabado = proximoSabado();
        const result = await pool.query(
            `SELECT * FROM sessoes_agendadas WHERE data_sessao = $1`,
            [dataSabado]
        );
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao buscar confirmados:', error.message);
        return [];
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
        console.log(`✅ Sessão ${id} atualizada`);
    } catch (error) {
        console.error('❌ Erro ao atualizar sessão:', error.message);
        throw error;
    }
}

async function deletarSessao(id) {
    try {
        await pool.query(`DELETE FROM sessoes_agendadas WHERE id = $1`, [id]);
        console.log(`🗑️ Sessão ${id} deletada`);
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
        console.log(`✅ Sessão de ${nome} adicionada manualmente`);
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
        console.error('❌ Erro ao verificar mensagem:', error.message);
        return false;
    }
}

async function listarMensagensEnviadas() {
    try {
        const result = await pool.query(`SELECT * FROM mensagens_enviadas ORDER BY enviado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar mensagens:', error.message);
        return [];
    }
}

// ── CANCELADOS ──

async function listarCancelados() {
    try {
        const result = await pool.query(`SELECT * FROM cancelados ORDER BY cancelado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar cancelados:', error.message);
        return [];
    }
}

async function reativarCancelado(id) {
    try {
        const row = await pool.query(`SELECT * FROM cancelados WHERE id = $1`, [id]);
        if (!row.rows.length) throw new Error('Cancelado não encontrado');
        const c = row.rows[0];
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, criado_em)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (uid) DO NOTHING`,
            [c.uid || `reativado-${Date.now()}`, c.nome, c.telefone, c.email, c.criado_em || new Date()]
        );
        await pool.query(`DELETE FROM cancelados WHERE id = $1`, [id]);
        console.log(`♻️ Cancelado ${c.nome} reativado`);
    } catch (error) {
        console.error('❌ Erro ao reativar cancelado:', error.message);
        throw error;
    }
}

async function deletarCancelado(id) {
    try {
        await pool.query(`DELETE FROM cancelados WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao deletar cancelado:', error.message);
        throw error;
    }
}

// ── PASSADOS ──

async function moverParaPassados(id) {
    try {
        const lead = await pool.query(`SELECT * FROM leads WHERE id = $1`, [id]);
        if (!lead.rows.length) throw new Error('Lead não encontrado');
        const l = lead.rows[0];
        const semana = proximoSabado();
        await pool.query(
            `INSERT INTO passados (uid, nome, telefone, email, semana, criado_em)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [l.uid, l.nome, l.telefone, l.email, semana, l.criado_em]
        );
        await pool.query(`DELETE FROM leads WHERE id = $1`, [id]);
        console.log(`📦 Lead ${l.nome} movido para passados (semana ${semana})`);
    } catch (error) {
        console.error('❌ Erro ao mover para passados:', error.message);
        throw error;
    }
}

async function listarPassados() {
    try {
        const result = await pool.query(`SELECT * FROM passados ORDER BY semana DESC, criado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar passados:', error.message);
        return [];
    }
}

async function reativarPassado(id) {
    try {
        const row = await pool.query(`SELECT * FROM passados WHERE id = $1`, [id]);
        if (!row.rows.length) throw new Error('Passado não encontrado');
        const p = row.rows[0];
        await pool.query(
            `INSERT INTO leads (uid, nome, telefone, email, criado_em)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (uid) DO NOTHING`,
            [p.uid || `reativado-${Date.now()}`, p.nome, p.telefone, p.email, p.criado_em || new Date()]
        );
        await pool.query(`DELETE FROM passados WHERE id = $1`, [id]);
        console.log(`♻️ Passado ${p.nome} reativado`);
    } catch (error) {
        console.error('❌ Erro ao reativar passado:', error.message);
        throw error;
    }
}

async function deletarPassado(id) {
    try {
        await pool.query(`DELETE FROM passados WHERE id = $1`, [id]);
        console.log(`🗑️ Passado ${id} deletado`);
    } catch (error) {
        console.error('❌ Erro ao deletar passado:', error.message);
        throw error;
    }
}

module.exports = {
    initDb,
    // leads
    registrarLead,
    marcarLeadConfirmado,
    buscarLeadPorUid,
    listarLeads,
    atualizarLead,
    deletarLead,
    adicionarLead,
    cancelarLead,
    moverParaPassados,
    // sessoes
    salvarSessaoAgendada,
    buscarConfirmadosParaSabado,
    listarSessoes,
    atualizarSessao,
    deletarSessao,
    adicionarSessao,
    // mensagens
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
    // util
    proximoSabado,
};
