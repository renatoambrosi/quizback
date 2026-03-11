// ============================================
// CONFIG.JS — Edite aqui todas as mensagens
// sem precisar mexer no código principal
// ============================================

module.exports = {

    // ── LINK DO GOOGLE MEET ──
    // Configure no Railway: GOOGLE_MEET_LINK=https://meet.google.com/xxx-xxxx-xxx
    meetLink: process.env.GOOGLE_MEET_LINK || 'https://meet.google.com',

    // ── MENSAGENS ──
    mensagens: {

        // 1. Enviada imediatamente após confirmação
        confirmacao: (nome, dataFormatada) =>
            `Olá, ${nome}! 🎉\n\nSua vaga na Sessão de Diagnóstico está confirmada!\n\n📅 ${dataFormatada} às 14h\n\nVocê receberá o link para entrar na sessão aqui pelo WhatsApp na véspera. Qualquer dúvida, é só falar comigo!\n\nAté sábado! 🌟\n— Suellen Seragi`,

        // 2. Enviada ~5 minutos após confirmação com o link do Meet
        linkMeet: (nome, meetLink) =>
            `${nome}, aqui está o link para entrar na sua Sessão de Diagnóstico! 🔗\n\n👉 ${meetLink}\n\nSalva esse link aqui no WhatsApp para não perder. Nos vemos lá! 🌟`,

        // 3. Reconvite — para quem não confirmou após 48h
        reconvite: (nome, link) =>
            `Olá, ${nome}! 👋\n\nAinda dá tempo de garantir sua vaga na Sessão de Diagnóstico do Teste de Prosperidade!\n\nAs vagas são limitadas e eu adoraria te ver por lá. 💛\n\n👉 Clique aqui para confirmar:\n${link}`,

        convite: (nome, link) =>
            `Olá, ${nome}! 🌟\n\n*Você gostou do seu resultado do Teste de Prosperidade?* Gostaria de te convidar para uma Sessão de Diagnóstico ao vivo e gratuita onde vamos aprofundar o que o teste revelou sobre você.\n\n👉 Clique aqui para saber mais e agendar:\n${link}`,

        // 4. Mensagem de quarta-feira — aquecimento
        quarta: (nome) =>
            `Olá, ${nome}! ✨\n\nEstou te esperando na Sessão de Diagnóstico esse sábado às 14h!\n\nFui pensando em você essa semana e tenho certeza que o que vamos trabalhar juntos vai abrir portas que você nem imagina ainda. 🚪💛\n\nAté sábado! 🌟\n— Suellen Seragi`,

        // 5. Mensagem de sexta-feira — "é amanhã"
        sexta: (nome) =>
            `Olá, ${nome}! 🌟\n\nAmanhã é o grande dia! Nossa Sessão de Diagnóstico começa às 14h.\n\nSepara um lugar tranquilo, sem distrações, e chega no horário — o início é muito importante para aproveitar tudo. 🙏\n\nAté amanhã! 💛\n— Suellen Seragi`,

        // 6. Sábado 1 hora antes (13h)
        sabadoUmaHora: (nome, meetLink) =>
            `${nome}, falta 1 hora! ⏰\n\nNossa Sessão de Diagnóstico começa às 14h. Já deixa o link aberto:\n\n👉 ${meetLink}\n\nAté já! 🌟`,

        // 7. Sábado 15 minutos antes (13h45)
        sabadoQuinzeMin: (nome, meetLink) =>
            `${nome}, faltam 15 minutos! 🚀\n\nEntra agora para não perder o início:\n\n👉 ${meetLink}\n\nTe vejo já! 💛`
    },

    // ── HORÁRIOS DOS DISPAROS AUTOMÁTICOS ──
    horarios: {
        envioConvite:    '40 13 * * 1-6',  // Seg-Sab às 13h40
        reconvite:       '40 13 * * 1-6',  // Seg-Sab às 13h40 (verifica 48h no banco)
        quarta:          '00 10 * * 3',    // Quarta às 10h
        sexta:           '00 10 * * 5',    // Sexta às 10h
        sabadoUmaHora:   '00 13 * * 6',    // Sábado às 13h
        sabadoQuinzeMin: '45 13 * * 6',    // Sábado às 13h45
    }
};
