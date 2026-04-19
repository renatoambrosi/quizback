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

function calcularDesconto(preco_de, preco_por) {
    const de = parseFloat(String(preco_de).replace(',', '.'));
    const por = parseFloat(String(preco_por).replace(',', '.'));
    if (!de || !por || por >= de) return null;
    return Math.round(((de - por) / de) * 100);
}

// ── ENDPOINT PÚBLICO ──
router.get('/precos', (req, res) => {
    try {
        const precos = lerPrecos();

        Object.keys(precos).forEach(key => {
            const p = precos[key];

            if (p.tipo === 'curso') {
                if (p.mostrar_promo) {
                    // Exibe preço promo: De 711 por 511
                    p.exibir_de = p.preco_padrao;
                    p.exibir_avista = p.preco_promo;
                    p.exibir_parcelas_valor = p.parcelas_valor_promo;
                    p.desconto_pct = calcularDesconto(p.preco_padrao, p.preco_promo);
                } else {
                    // Exibe preço padrão: 711 sem De/Por
                    p.exibir_de = null;
                    p.exibir_avista = p.preco_padrao;
                    p.exibir_parcelas_valor = p.parcelas_valor_padrao;
                    p.desconto_pct = null;
                }
                // Preço alunos sempre disponível via funil
                p.alunos_desconto_pct = calcularDesconto(p.preco_padrao, p.preco_alunos);
            } else {
                p.exibir_avista = p.preco_avista;
                p.exibir_parcelas_valor = p.parcelas_valor || null;
                p.desconto_pct = null;
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

// ── API ADMIN: LER ──
router.get('/admin/precos/dados', autenticar, (req, res) => {
    try {
        res.json(lerPrecos());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ── API ADMIN: SALVAR ──
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
