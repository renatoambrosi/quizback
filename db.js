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
        console.log('✅ Banco de dados whatsapp_agendados iniciado');
    } catch (error) {
        console.error('❌ Erro ao iniciar banco:', error.message);
    }
}

async function agendarEnvio(uid, nome, telefone, email) {
    try {
        const enviarEm = new Date(Date.now() + 24 * 60 * 60 * 1000);
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

async function marcarEnviado(id) {
    try {
        await pool.query(
            `UPDATE whatsapp_agendados SET enviado = TRUE WHERE id = $1`,
            [id]
        );
    } catch (error) {
        console.error('❌ Erro ao marcar enviado:', error.message);
    }
}

module.exports = { initDb, agendarEnvio, buscarPendentes, marcarEnviado };
