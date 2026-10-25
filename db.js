/* db.js — camada de dados.
 * Se config.js estiver preenchido: usa Supabase (login + PostgreSQL + tempo real).
 * Se não: MODO DEMONSTRAÇÃO, com dados fictícios no localStorage deste navegador.
 * As telas só conversam com o objeto global `DB`, então a troca é transparente.
 */
(function () {
    'use strict';

    const CFG = window.APP_CONFIG || {};
    const DEMO = !CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || String(CFG.SUPABASE_URL).includes('COLE_AQUI');

    const ZEROS = { orcamento_mensal: 0, contas_fixas: 0, meta_economia: 0 };
    function normalizarConfig(c) {
        c = c || {};
        return {
            orcamento_mensal: Number(c.orcamento_mensal) || 0,
            contas_fixas: Number(c.contas_fixas) || 0,
            meta_economia: Number(c.meta_economia) || 0
        };
    }

    function traduzir(err) {
        const m = String((err && err.message) || err || '');
        if (/invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
        if (/email not confirmed/i.test(m)) return 'Confirme o e-mail antes de entrar (veja sua caixa de entrada).';
        if (/rate limit|too many/i.test(m)) return 'Muitas tentativas seguidas. Aguarde alguns minutos.';
        if (/failed to fetch|network/i.test(m)) return 'Sem conexão com o servidor. Verifique a internet.';
        if (/same password|different from the old/i.test(m)) return 'A nova senha precisa ser diferente da atual.';
        return m || 'Algo deu errado. Tente novamente.';
    }

    // =====================================================================
    //  SUPABASE
    // =====================================================================
    const FLAG = 'fin_lembrar';
    let usarLocal = localStorage.getItem(FLAG) !== 'nao';

    // "Lembrar-me": a sessão vai para o localStorage (fica) ou sessionStorage (some ao fechar a aba)
    const armazenamento = {
        getItem: (k) => (usarLocal ? localStorage : sessionStorage).getItem(k),
        setItem: (k, v) => (usarLocal ? localStorage : sessionStorage).setItem(k, v),
        removeItem: (k) => { localStorage.removeItem(k); sessionStorage.removeItem(k); }
    };

    let client = null;
    function cliente() {
        if (!client) {
            client = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
                auth: { storage: armazenamento, persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
            });
        }
        return client;
    }

    async function sessaoReal() {
        const { data } = await cliente().auth.getSession();
        return data.session ? { id: data.session.user.id, email: data.session.user.email } : null;
    }

    const real = {
        demo: false,
        sessao: sessaoReal,

        async entrar(email, senha, lembrar) {
            usarLocal = !!lembrar;
            localStorage.setItem(FLAG, lembrar ? 'sim' : 'nao');
            const { error } = await cliente().auth.signInWithPassword({ email, password: senha });
            if (error) throw new Error(traduzir(error));
        },
        async sair() { await cliente().auth.signOut(); },
        async recuperar(email) {
            const { error } = await cliente().auth.resetPasswordForEmail(email, {
                redirectTo: location.origin + location.pathname.replace(/[^/]*$/, 'index.html')
            });
            if (error) throw new Error(traduzir(error));
        },
        async novaSenha(senha) {
            const { error } = await cliente().auth.updateUser({ password: senha });
            if (error) throw new Error(traduzir(error));
        },
        aoRecuperarSenha(cb) {
            cliente().auth.onAuthStateChange((evento) => { if (evento === 'PASSWORD_RECOVERY') cb(); });
        },
        aoSair(cb) {
            cliente().auth.onAuthStateChange((evento) => { if (evento === 'SIGNED_OUT') cb(); });
        },

        async listar(de, ate) {
            const { data, error } = await cliente()
                .from('transacoes')
                .select('id,tipo,descricao,categoria,valor,data,fixo,criado_em')
                .gte('data', de).lte('data', ate)
                .order('data', { ascending: false })
                .order('criado_em', { ascending: false });
            if (error) throw new Error(traduzir(error));
            return (data || []).map((t) => ({ ...t, valor: Number(t.valor) }));
        },
        async adicionar(t) {
            const { error } = await cliente().from('transacoes').insert({
                tipo: t.tipo, descricao: t.descricao, categoria: t.categoria,
                valor: t.valor, data: t.data, fixo: !!t.fixo
            });
            if (error) throw new Error(traduzir(error));
        },
        async remover(id) {
            const { error } = await cliente().from('transacoes').delete().eq('id', id);
            if (error) throw new Error(traduzir(error));
        },
        async config() {
            const { data, error } = await cliente().from('configuracoes')
                .select('orcamento_mensal,contas_fixas,meta_economia').maybeSingle();
            if (error) throw new Error(traduzir(error));
            return normalizarConfig(data);
        },
        async salvarConfig(c) {
            const s = await sessaoReal();
            const { error } = await cliente().from('configuracoes').upsert({
                user_id: s.id,
                orcamento_mensal: c.orcamento_mensal,
                contas_fixas: c.contas_fixas,
                meta_economia: c.meta_economia,
                atualizado_em: new Date().toISOString()
            });
            if (error) throw new Error(traduzir(error));
        },

        // tempo real: avisa quando qualquer lançamento/planejamento mudar (neste ou em outro aparelho)
        assinar(aoMudar, aoStatus) {
            const canal = cliente().channel('financeiro-ao-vivo')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'transacoes' }, () => aoMudar())
                .on('postgres_changes', { event: '*', schema: 'public', table: 'configuracoes' }, () => aoMudar())
                .subscribe((status) => aoStatus && aoStatus(status));
            return () => cliente().removeChannel(canal);
        }
    };

    // =====================================================================
    //  MODO DEMONSTRAÇÃO (localStorage)
    // =====================================================================
    const K_DADOS = 'fin_demo_dados';
    const K_SESSAO = 'fin_demo_sessao';

    function semear() {
        const C = window.Calc;
        const hoje = new Date();
        const ts = [];
        let n = 0;
        const pseudo = (i) => ((i * 9301 + 49297) % 233280) / 233280;
        const add = (ano, mes, dia, tipo, descricao, categoria, valor, fixo) => {
            ts.push({
                id: 'demo' + (n++), tipo, descricao, categoria, valor,
                data: C.isoData(new Date(ano, mes, dia)), fixo: !!fixo, criado_em: new Date().toISOString()
            });
        };
        const variaveis = [['Mercado', 'Compras da semana'], ['Transporte', 'Ônibus / app'], ['Comida fora', 'Lanche'], ['Lazer', 'Saída'], ['Compras', 'Compra avulsa']];
        for (let m = 3; m >= 0; m--) {
            const base = new Date(hoje.getFullYear(), hoje.getMonth() - m, 1);
            const a = base.getFullYear();
            const mm = base.getMonth();
            const ultimo = m === 0 ? hoje.getDate() : C.diasNoMes(a, mm);
            if (ultimo >= 1) add(a, mm, 1, 'gasto', 'Aluguel', 'Moradia', 900, true);
            if (ultimo >= 5) add(a, mm, 5, 'receita', 'Salário', 'Salário', 2800, false);
            if (ultimo >= 8) add(a, mm, 8, 'gasto', 'Internet e celular', 'Contas', 140, true);
            if (ultimo >= 12) add(a, mm, 12, 'receita', 'Site para cliente', 'Freelance', 350, false);
            for (let d = 1; d <= ultimo; d++) {
                const p = pseudo(d * 7 + m * 31);
                if (p < 0.33) continue;
                const v = variaveis[Math.floor(pseudo(d * 13 + m) * variaveis.length)];
                add(a, mm, d, 'gasto', v[1], v[0], Math.round((8 + pseudo(d + m * 5) * 55) * 100) / 100, false);
            }
        }
        const dados = { transacoes: ts, config: { orcamento_mensal: 2200, contas_fixas: 1040, meta_economia: 400 } };
        localStorage.setItem(K_DADOS, JSON.stringify(dados));
        return dados;
    }
    function lerDemo() {
        try {
            const d = JSON.parse(localStorage.getItem(K_DADOS));
            if (d && Array.isArray(d.transacoes)) return d;
        } catch (e) { /* recria abaixo */ }
        return semear();
    }
    function gravarDemo(d) { localStorage.setItem(K_DADOS, JSON.stringify(d)); }

    const demo = {
        demo: true,
        async sessao() {
            const e = localStorage.getItem(K_SESSAO);
            return e ? { id: 'demo', email: e } : null;
        },
        async entrar(email, senha) {
            if (!email || !senha || senha.length < 4) throw new Error('Modo demonstração: use qualquer e-mail e senha com 4+ caracteres.');
            localStorage.setItem(K_SESSAO, email);
        },
        async sair() { localStorage.removeItem(K_SESSAO); },
        async recuperar() { throw new Error('Recuperar senha só funciona com o Supabase configurado.'); },
        async novaSenha() { throw new Error('Disponível apenas com o Supabase configurado.'); },
        aoRecuperarSenha() { /* nada */ },
        aoSair() { /* nada */ },

        async listar(de, ate) {
            return lerDemo().transacoes
                .filter((t) => t.data >= de && t.data <= ate)
                .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : String(b.criado_em).localeCompare(String(a.criado_em))));
        },
        async adicionar(t) {
            const d = lerDemo();
            d.transacoes.push({
                id: 'demo' + Date.now() + Math.random().toString(36).slice(2, 7),
                tipo: t.tipo, descricao: t.descricao, categoria: t.categoria,
                valor: t.valor, data: t.data, fixo: !!t.fixo, criado_em: new Date().toISOString()
            });
            gravarDemo(d);
        },
        async remover(id) {
            const d = lerDemo();
            d.transacoes = d.transacoes.filter((t) => t.id !== id);
            gravarDemo(d);
        },
        async config() { return normalizarConfig(lerDemo().config); },
        async salvarConfig(c) {
            const d = lerDemo();
            d.config = normalizarConfig(c);
            gravarDemo(d);
        },
        assinar(aoMudar, aoStatus) {
            const h = (e) => { if (e.key === K_DADOS) aoMudar(); };
            window.addEventListener('storage', h);
            if (aoStatus) aoStatus('SUBSCRIBED');
            return () => window.removeEventListener('storage', h);
        }
    };

    window.DB = DEMO ? demo : real;
    window.DB.ZEROS = ZEROS;
})();
