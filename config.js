// ============================================
// CONFIG.JS — Edite aqui todas as mensagens
// sem precisar mexer no código principal
// ============================================

module.exports = {

    // ── LINK DO GOOGLE MEET ──
    meetLink: process.env.GOOGLE_MEET_LINK || 'https://meet.google.com',

    // ── LINK DO GRUPO DA SESSÃO ──
    grupoSessaoLink: 'https://chat.whatsapp.com/F9XSTevtPPO6gvSxvevXvW?mode=gi_t',

    // ── JID DO GRUPO DA SESSÃO (para envio via Evolution API) ──
    grupoSessaoJid: '120363423552674236@g.us',

    // ── MENSAGENS ──
    mensagens: {

        // 1. Convite — enviado 15 minutos após o pagamento (individual)
        convite: (nome, link) =>
            `Olá, ${nome}! 🌟\n\n*Você gostou do seu resultado do Teste de Prosperidade?* Gostaria de te convidar para uma Sessão de Diagnóstico ao vivo e gratuita onde vamos aprofundar o que o teste revelou sobre você.\n\n👉 Clique aqui para saber mais e agendar:\n${link}`,

        // 2. Confirmação — enviada quando a pessoa agenda (individual)
        confirmacao: (nome, grupoLink) =>
            `Olá, ${nome}! 🎉\n\nSua vaga na Sessão de Diagnóstico está confirmada!\n\n📅 Sábado às 14h\n\nEntre no grupo da sessão pelo link abaixo para receber todas as informações:\n\n👉 ${grupoLink}\n\nAté sábado! 🌟\n— Suellen Seragi`,

        // 3. Quarta-feira — aquecimento (enviado no GRUPO)
        quarta: () =>
            `Olá, amores! ✨\n\nEstou te esperando na Sessão de Diagnóstico, nesse sábado às 14h pra falarmos como nossa mente vence as travas para prosperar!\n\nO que vou falar para vocês na nossa reunião, abrirá uma janela de Deus na sua vida, que você nem imagina ainda. 🪟☀️\n\nAté lá!⚡\n— Suellen Seragi`,

        // 4. Sexta-feira — "é amanhã" (enviado no GRUPO)
        sexta: () =>
            `Olá, amores! 🌟\n\nAmanhã é o grande dia! Nossa Sessão de Diagnóstico começa às 14h.\n\nSepara um lugar tranquilo, sem distrações, e chega no horário — o início é muito importante para aproveitar tudo. 🙏\n\nAté amanhã! 💛\n— Suellen Seragi`,

        // 5. Sábado 1 hora antes — 13h (enviado no GRUPO)
        sabadoUmaHora: (meetLink) =>
            `Amores, falta 1 hora! ⏰\n\nNossa Sessão de Diagnóstico começa às 14h. Já deixa o link aberto:\n\n👉 ${meetLink}\n\nAté já! 🌟`,

        // 6. Sábado 15 minutos antes — 13h45 (enviado no GRUPO)
        sabadoQuinzeMin: (meetLink) =>
            `Amores, faltam 15 minutos! 🚀\n\nEntra agora para não perder o início:\n\n👉 ${meetLink}\n\nTe vejo já! 💛`,
    },

    // ── HORÁRIOS DOS DISPAROS AUTOMÁTICOS ──
    horarios: {
        quarta:          '00 10 * * 3',    // Quarta às 10h
        sexta:           '00 10 * * 5',    // Sexta às 10h
        sabadoUmaHora:   '00 13 * * 6',    // Sábado às 13h
        sabadoQuinzeMin: '45 13 * * 6',    // Sábado às 13h45
    }
};
