const { Pool } = require('pg');
const pool = new Pool({
    connectionString: process.env.WHATSAPP_DB_URL,
    ssl: { rejectUnauthorized: false }
});

async function initDb() {
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS whatsapp_agendados (
                id SERIAL PRIMARY KEY,
                uid VARCHAR(50) NOT NULL,
                nome VARCHAR(255),
                telefone VARCHAR(20),
                email VARCHAR(255),
                enviar_em TIMESTAMP NOT NULL,
                enviado BOOLEAN DEFAULT FALSE,
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
        console.log('✅ Banco de dados iniciado (whatsapp_agendados + sessoes_agendadas + mensagens_enviadas)');
    } catch (error) {
        console.error('❌ Erro ao iniciar banco:', error.message);
    }
}

// ── CÁLCULO DO HORÁRIO DE ENVIO ──
function calcularEnviarEm() {
    const agora = new Date();
    const hora = agora.getHours();
    const base = new Date(agora);
    if (hora >= 6) base.setDate(base.getDate() + 1);
    base.setHours(13, 40, 0, 0);
    if (base.getDay() === 0) base.setDate(base.getDate() + 1);
    return base;
}

// ── WHATSAPP_AGENDADOS ──
async function agendarEnvio(uid, nome, telefone, email) {
    try {
        const duplicata = await pool.query(
            `SELECT 1 FROM whatsapp_agendados 
             WHERE telefone = $1 
             AND criado_em >= NOW() - INTERVAL '24 hours'`,
            [telefone]
        );
        if (duplicata.rows.length > 0) {
            console.log(`⚠️ Agendamento ignorado — telefone ${telefone} já registrado nas últimas 24h`);
            return;
        }
        const enviarEm = calcularEnviarEm();
        await pool.query(
            `INSERT INTO whatsapp_agendados (uid, nome, telefone, email, enviar_em) VALUES ($1, $2, $3, $4, $5)`,
            [uid, nome, telefone, email, enviarEm]
        );
        console.log(`📅 WhatsApp agendado para ${nome} em ${enviarEm}`);
    } catch (error) {
        console.error('❌ Erro ao agendar envio:', error.message);
    }
}

async function buscarPendentes() {
    try {
        const result = await pool.query(
            `SELECT * FROM whatsapp_agendados WHERE enviar_em <= NOW() AND enviado = FALSE`
        );
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao buscar pendentes:', error.message);
        return [];
    }
}

async function buscarParaReconvite() {
    try {
        const result = await pool.query(`
            SELECT w.* FROM whatsapp_agendados w
            WHERE w.enviado = TRUE
            AND w.enviar_em <= NOW() - INTERVAL '48 hours'
            AND NOT EXISTS (
                SELECT 1 FROM sessoes_agendadas s WHERE s.telefone = w.telefone
            )
            AND NOT EXISTS (
                SELECT 1 FROM mensagens_enviadas m
                WHERE m.referencia_id = w.id
                AND m.tabela_origem = 'whatsapp_agendados'
                AND m.etapa = 'reconvite'
            )
        `);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao buscar reconvites:', error.message);
        return [];
    }
}

async function marcarEnviado(id) {
    try {
        await pool.query(`UPDATE whatsapp_agendados SET enviado = TRUE WHERE id = $1`, [id]);
    } catch (error) {
        console.error('❌ Erro ao marcar enviado:', error.message);
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
        const hoje = new Date();
        const diasParaSabado = (6 - hoje.getDay() + 7) % 7 || 7;
        const sabado = new Date(hoje);
        sabado.setDate(hoje.getDate() + diasParaSabado);
        const dataSabado = sabado.toISOString().split('T')[0];
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

// ── ADMIN ──
async function listarLeads() {
    try {
        const result = await pool.query(`SELECT * FROM whatsapp_agendados ORDER BY criado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar leads:', error.message);
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

async function listarMensagensEnviadas() {
    try {
        const result = await pool.query(`SELECT * FROM mensagens_enviadas ORDER BY enviado_em DESC`);
        return result.rows;
    } catch (error) {
        console.error('❌ Erro ao listar mensagens:', error.message);
        return [];
    }
}

async function atualizarLead(id, campos) {
    try {
        const sets = Object.keys(campos).map((k, i) => `${k} = $${i + 2}`).join(', ');
        const valores = [id, ...Object.values(campos)];
        await pool.query(`UPDATE whatsapp_agendados SET ${sets} WHERE id = $1`, valores);
        console.log(`✅ Lead ${id} atualizado`);
    } catch (error) {
        console.error('❌ Erro ao atualizar lead:', error.message);
        throw error;
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

module.exports = {
    initDb,
    agendarEnvio,
    buscarPendentes,
    buscarParaReconvite,
    marcarEnviado,
    salvarSessaoAgendada,
    buscarConfirmadosParaSabado,
    registrarMensagem,
    jaEnviou,
    listarLeads,
    listarSessoes,
    listarMensagensEnviadas,
    atualizarLead,
    atualizarSessao
};
