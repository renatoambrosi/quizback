const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const PRECOS_PATH = path.join(__dirname, '../precos.json');

function lerPrecos() {
    const raw = fs.readFileSync(PRECOS_PATH, 'utf-8');
    return JSON.parse(raw);
}

function salvarPrecos(dados) {
    fs.writeFileSync(PRECOS_PATH, JSON.stringify(dados, null, 2), 'utf-8');
}

function calcularDesconto(preco_de, preco_avista) {
    const de = parseFloat(String(preco_de).replace(',', '.'));
    const por = parseFloat(String(preco_avista).replace(',', '.'));
    if (!de || !por) return null;
    return Math.round(((de - por) / de) * 100);
}

// ── ENDPOINT PÚBLICO — usado pelo Wix e landing pages ──
router.get('/precos', (req, res) => {
    try {
        const precos = lerPrecos();

        // Enriquecer com percentual de desconto calculado
        Object.keys(precos).forEach(key => {
            const p = precos[key];
            if (p.tem_preco_de) {
                if (p.promo_ativa) {
                    p.desconto_pct = calcularDesconto(p.preco_de, p.promo_avista);
                    p.exibir_avista = p.promo_avista;
                    p.exibir_parcelas_valor = p.promo_parcelas_valor;
                } else {
                    p.desconto_pct = null;
                    p.exibir_avista = p.preco_avista;
                    p.exibir_parcelas_valor = p.parcelas_valor;
                }
            } else {
                p.desconto_pct = null;
                p.exibir_avista = p.preco_avista;
                p.exibir_parcelas_valor = p.parcelas_valor || null;
            }
        });

        res.json(precos);
    } catch (err) {
        console.error('❌ Erro ao ler precos.json:', err.message);
        res.status(500).json({ error: 'Erro ao carregar preços' });
    }
});

// ── AUTENTICAÇÃO ──
function autenticar(req, res, next) {
    const auth = req.headers['authorization'];
    if (!auth || !auth.startsWith('Basic ')) {
        res.set('WWW-Authenticate', 'Basic realm="Admin Preços"');
        return res.status(401).send('Acesso negado');
    }
    const [user, pass] = Buffer.from(auth.split(' ')[1], 'base64').toString().split(':');
    if (user === process.env.ADMIN_USER && pass === process.env.ADMIN_PASSWORD) return next();
    res.set('WWW-Authenticate', 'Basic realm="Admin Preços"');
    return res.status(401).send('Usuário ou senha incorretos');
}

// ── PAINEL ADMIN ──
router.get('/admin/precos', autenticar, (req, res) => {
    res.sendFile(path.join(__dirname, '../precos-admin.html'));
});

// ── API ADMIN: LER PREÇOS ──
router.get('/admin/precos/dados', autenticar, (req, res) => {
    try {
        const precos = lerPrecos();
        res.json(precos);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API ADMIN: SALVAR PREÇOS ──
router.post('/admin/precos/salvar', autenticar, (req, res) => {
    try {
        const dados = req.body;
        if (!dados || typeof dados !== 'object') {
            return res.status(400).json({ error: 'Dados inválidos' });
        }
        salvarPrecos(dados);
        console.log('✅ precos.json atualizado via painel admin');
        res.json({ success: true });
    } catch (err) {
        console.error('❌ Erro ao salvar precos.json:', err.message);
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
