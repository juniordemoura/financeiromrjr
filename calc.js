/* calc.js — regras do dashboard (sem DOM; também roda no Node para testes)
 *
 * Conceitos:
 *  - Orçamento mensal = quanto você aceita gastar no mês.
 *  - Contas fixas     = parte do orçamento já "comprometida" (aluguel, internet...).
 *  - Orçamento variável = orçamento − contas fixas. É ele que mede o seu dia a dia.
 *  - Ritmo esperado   = orçamento variável × (dia atual ÷ dias do mês).
 *
 *  Status (só para o mês atual/passado):
 *   🔴 vermelho: gastou mais que o orçamento total, ou o ritmo está >10% acima do esperado
 *   🟢 bom:      ritmo entre 90% e 110% do esperado
 *   🏆 ótimo:    ritmo até 90% do esperado
 */
(function (raiz) {
    'use strict';

    const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
    const MESES_CURTOS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

    const CATEGORIAS_GASTO = [
        { nome: 'Moradia', icone: '🏠', grupo: 'essencial' },
        { nome: 'Mercado', icone: '🛒', grupo: 'essencial' },
        { nome: 'Transporte', icone: '🚌', grupo: 'essencial' },
        { nome: 'Contas', icone: '💡', grupo: 'essencial' },
        { nome: 'Saúde', icone: '💊', grupo: 'essencial' },
        { nome: 'Educação', icone: '🎓', grupo: 'essencial' },
        { nome: 'Dívidas', icone: '💳', grupo: 'essencial' },
        { nome: 'Comida fora', icone: '🍔', grupo: 'desejo' },
        { nome: 'Lazer', icone: '🎮', grupo: 'desejo' },
        { nome: 'Compras', icone: '🛍️', grupo: 'desejo' },
        { nome: 'Assinaturas', icone: '📺', grupo: 'desejo' },
        { nome: 'Outros', icone: '📦', grupo: 'desejo' }
    ];
    const CATEGORIAS_RECEITA = ['Salário', 'Freelance', 'Outros'];

    const ICONES = { 'Salário': '💰', 'Freelance': '💻' };
    CATEGORIAS_GASTO.forEach((c) => { ICONES[c.nome] = c.icone; });

    function iconeCategoria(nome) { return ICONES[nome] || '📦'; }
    function grupoCategoria(nome) {
        const c = CATEGORIAS_GASTO.find((x) => x.nome === nome);
        return c ? c.grupo : 'desejo';
    }

    // ---------- utilidades ----------
    const pad = (n) => String(n).padStart(2, '0');
    const numero = (x) => Number(x) || 0;
    const arred = (x) => Math.round(x * 100) / 100;

    function isoData(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
    function hojeISO() { return isoData(new Date()); }
    function diasNoMes(ano, mes) { return new Date(ano, mes + 1, 0).getDate(); }
    function inicioFimMes(ano, mes) {
        const c = ano + '-' + pad(mes + 1);
        return [c + '-01', c + '-' + pad(diasNoMes(ano, mes))];
    }
    function moeda(v) {
        return numero(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    }
    function pct(n) { return Number.isFinite(n) ? Math.round(n * 100) + '%' : '—'; }

    // aceita "12,50", "1.250,50", "12.5", "R$ 30"
    function parseValor(txt) {
        let s = String(txt == null ? '' : txt).trim().replace(/[R$\s]/g, '');
        if (!s) return NaN;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        const n = Number(s);
        return Number.isFinite(n) ? arred(n) : NaN;
    }

    function somar(lista, fn) {
        let t = 0;
        for (const x of lista) t += numero(fn(x));
        return arred(t);
    }

    function doMes(ts, ano, mes) {
        const chave = ano + '-' + pad(mes + 1);
        return ts.filter((t) => String(t.data).slice(0, 7) === chave);
    }

    function ehMesAtual(ano, mes, hoje) {
        return ano === hoje.getFullYear() && mes === hoje.getMonth();
    }

    // 0 = mês futuro; dias do mês = mês passado; senão, o dia de hoje
    function diaAtualDoMes(ano, mes, hoje) {
        const a = hoje.getFullYear();
        const m = hoje.getMonth();
        if (ano < a || (ano === a && mes < m)) return diasNoMes(ano, mes);
        if (ano === a && mes === m) return hoje.getDate();
        return 0;
    }

    // ---------- resumo e status do mês ----------
    function resumoMes(ts, cfg, ano, mes, hoje) {
        hoje = hoje || new Date();
        cfg = cfg || {};
        const lista = doMes(ts, ano, mes);
        const gastosL = lista.filter((t) => t.tipo === 'gasto');

        const receitas = somar(lista.filter((t) => t.tipo === 'receita'), (t) => t.valor);
        const gastos = somar(gastosL, (t) => t.valor);
        const gastosFixos = somar(gastosL.filter((t) => t.fixo), (t) => t.valor);
        const gastosVar = arred(gastos - gastosFixos);

        const orcamento = numero(cfg.orcamento_mensal);
        const contasFixas = numero(cfg.contas_fixas);
        const metaEconomia = numero(cfg.meta_economia);
        const configurado = orcamento > 0;

        const dias = diasNoMes(ano, mes);
        const diaAtual = diaAtualDoMes(ano, mes, hoje);
        const mesAtual = ehMesAtual(ano, mes, hoje);
        const futuro = diaAtual === 0;
        const passado = !mesAtual && !futuro;

        const orcVar = Math.max(orcamento - contasFixas, 0);
        const limiteDia = orcVar / dias;
        const progresso = diaAtual / dias;
        const esperadoVar = orcVar * progresso;
        const ratio = esperadoVar > 0 ? gastosVar / esperadoVar : (gastosVar > 0 ? Infinity : 0);

        // Projeção do fechamento do mês.
        // Até o 5º dia usa "o que já gastou + limite diário nos dias restantes" (evita ruído);
        // depois disso extrapola o ritmo real.
        let projecaoGastos;
        if (futuro) {
            projecaoGastos = orcamento || gastos;
        } else if (passado) {
            projecaoGastos = gastos;
        } else {
            const fixosPrevistos = Math.max(gastosFixos, contasFixas);
            const projVar = diaAtual >= 5 ? gastosVar / progresso : gastosVar + limiteDia * (dias - diaAtual);
            projecaoGastos = fixosPrevistos + projVar;
        }
        projecaoGastos = arred(projecaoGastos);

        const diasRestantes = mesAtual ? dias - diaAtual + 1 : 0; // hoje ainda conta
        const restanteVar = arred(orcVar - gastosVar);
        const podeGastarPorDia = diasRestantes > 0 ? restanteVar / diasRestantes : 0;
        const gastoHoje = mesAtual
            ? somar(gastosL.filter((t) => !t.fixo && t.data === isoData(hoje)), (t) => t.valor)
            : 0;

        let nivel = 'neutro';
        if (configurado) {
            if (gastos > orcamento) nivel = 'vermelho';
            else if (futuro) nivel = 'neutro';
            else if (ratio > 1.10) nivel = 'vermelho';
            else if (ratio > 0.90) nivel = 'bom';
            else nivel = 'otimo';
        }

        return {
            ano, mes, dias, diaAtual, mesAtual, futuro, passado, progresso,
            receitas, gastos, gastosFixos, gastosVar, saldo: arred(receitas - gastos),
            orcamento, contasFixas, metaEconomia, configurado, orcVar, limiteDia,
            esperadoVar, ratio, projecaoGastos, diasRestantes, restanteVar,
            podeGastarPorDia, gastoHoje, nivel
        };
    }

    function mensagemStatus(r) {
        if (!r.configurado) {
            return { icone: '🧭', titulo: 'Vamos começar!', texto: 'Defina seu orçamento do mês em "Meu planejamento" para eu poder avisar quando você estiver no vermelho, bem ou ótimo.' };
        }
        if (r.futuro && r.nivel !== 'vermelho') {
            return { icone: '🗓️', titulo: 'Mês futuro', texto: `Este mês ainda não começou. Seu orçamento planejado é ${moeda(r.orcamento)}.` };
        }
        if (r.nivel === 'vermelho') {
            if (r.gastos > r.orcamento) {
                const dif = moeda(r.gastos - r.orcamento);
                return r.passado
                    ? { icone: '🔴', titulo: 'Mês fechou no vermelho', texto: `Este mês passou do orçamento em ${dif}. Veja nas categorias o que mais pesou e ajuste o plano do próximo.` }
                    : { icone: '🔴', titulo: 'Você está no vermelho!', texto: `Você passou do orçamento em ${dif}. Pause o que não é essencial pelo resto do mês e revise as categorias que mais pesaram.` };
            }
            if (r.orcVar <= 0) {
                return { icone: '🔴', titulo: 'Orçamento todo comprometido', texto: 'Suas contas fixas já ocupam todo o orçamento: qualquer gasto variável deixa o mês no vermelho. Reveja o planejamento.' };
            }
            if (r.passado) {
                return { icone: '🔴', titulo: 'Ritmo ficou acima do planejado', texto: `Os gastos variáveis fecharam em ${pct(r.gastosVar / r.orcVar)} do que estava planejado.` };
            }
            return { icone: '🔴', titulo: 'Ritmo acima do planejado', texto: `Você já usou ${pct(r.gastosVar / r.orcVar)} do orçamento variável com ${pct(r.progresso)} do mês. Para voltar ao trilho, gaste no máximo ${moeda(Math.max(r.podeGastarPorDia, 0))} por dia.` };
        }
        if (r.nivel === 'bom') {
            return r.passado
                ? { icone: '🟢', titulo: 'Mês dentro do planejado', texto: `Você fechou o mês dentro do orçamento e ainda sobraram ${moeda(Math.max(r.orcamento - r.gastos, 0))}.` }
                : { icone: '🟢', titulo: 'Tudo dentro do planejado', texto: `Você está no ritmo do orçamento. Pode gastar cerca de ${moeda(Math.max(r.podeGastarPorDia, 0))} por dia até o fim do mês e manter o equilíbrio.` };
        }
        // ótimo
        return r.passado
            ? { icone: '🏆', titulo: 'Mês excelente!', texto: `Você gastou bem menos que o planejado: sobraram ${moeda(Math.max(r.orcamento - r.gastos, 0))} do orçamento.` }
            : { icone: '🏆', titulo: 'Ótimo! Você está voando', texto: `Seus gastos variáveis estão ${moeda(Math.max(r.esperadoVar - r.gastosVar, 0))} abaixo do esperado para hoje. Se continuar assim, o mês fecha com cerca de ${moeda(Math.max(r.orcamento - r.projecaoGastos, 0))} de folga.` };
    }

    // ---------- estímulo ----------
    const FRASES = [
        'Cada real anotado hoje é uma decisão melhor amanhã.',
        'Controle não é privação: é escolher onde o seu dinheiro trabalha por você.',
        'Pequenos gastos repetidos viram grandes buracos. Observe-os.',
        'Quem acompanha o dinheiro todo dia não é pego de surpresa no fim do mês.',
        'Guardar primeiro, gastar depois: inverta a ordem e sinta a diferença.',
        'Você não precisa ser perfeito, só constante.',
        'Reserva de emergência é o presente que você dá ao seu eu do futuro.',
        'Antes de comprar, espere 24 horas. Se ainda fizer sentido, compre.',
        'Meta de hoje: um mês inteiro dentro do orçamento.',
        'Juros compostos premiam quem começa cedo. Comece agora, mesmo com pouco.',
        'Dê um trabalho para cada real que entra. Dinheiro sem destino some.',
        'Dias de disciplina se somam: sua sequência é a prova de que está funcionando.'
    ];

    function fraseDoDia(hoje) {
        const inicio = new Date(hoje.getFullYear(), 0, 0);
        const dia = Math.floor((hoje - inicio) / 86400000);
        return FRASES[dia % FRASES.length];
    }

    // dias seguidos (até hoje) com gasto variável dentro do limite diário
    function sequencia(ts, cfg, hoje) {
        const orcVar = Math.max(numero(cfg.orcamento_mensal) - numero(cfg.contas_fixas), 0);
        if (!ts.length || orcVar <= 0) return 0;
        const porDia = {};
        for (const t of ts) {
            if (t.tipo === 'gasto' && !t.fixo) porDia[t.data] = (porDia[t.data] || 0) + numero(t.valor);
        }
        const primeira = ts.reduce((m, t) => (t.data < m ? t.data : m), '9999-12-31');
        let n = 0;
        const d = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
        for (let i = 0; i < 400; i++) {
            const iso = isoData(d);
            if (iso < primeira) break;
            const limite = orcVar / diasNoMes(d.getFullYear(), d.getMonth());
            if ((porDia[iso] || 0) > limite + 0.005) break;
            n++;
            d.setDate(d.getDate() - 1);
        }
        return n;
    }

    const NIVEIS = [
        { min: 0, nome: 'Aprendiz', icone: '🌱' },
        { min: 3, nome: 'Atento', icone: '👀' },
        { min: 7, nome: 'Disciplinado', icone: '🔥' },
        { min: 14, nome: 'Mestre do Orçamento', icone: '🏆' },
        { min: 30, nome: 'Lenda das Finanças', icone: '👑' }
    ];

    function nivelPorSequencia(n) {
        let idx = 0;
        NIVEIS.forEach((x, i) => { if (n >= x.min) idx = i; });
        const atual = NIVEIS[idx];
        const proximo = NIVEIS[idx + 1] || null;
        return {
            atual, proximo,
            falta: proximo ? proximo.min - n : 0,
            pct: proximo ? (n - atual.min) / (proximo.min - atual.min) : 1
        };
    }

    // ---------- séries para os gráficos ----------
    function porCategoria(ts, ano, mes) {
        const m = {};
        for (const t of doMes(ts, ano, mes)) {
            if (t.tipo !== 'gasto') continue;
            const c = t.categoria || 'Outros';
            m[c] = (m[c] || 0) + numero(t.valor);
        }
        return Object.entries(m)
            .map(([categoria, total]) => ({ categoria, total: arred(total) }))
            .sort((a, b) => b.total - a.total);
    }

    // gastos VARIÁVEIS por dia, acumulado e ritmo ideal
    function serieDiaria(ts, cfg, ano, mes, hoje) {
        const dias = diasNoMes(ano, mes);
        const diaAtual = diaAtualDoMes(ano, mes, hoje);
        const orcVar = Math.max(numero(cfg.orcamento_mensal) - numero(cfg.contas_fixas), 0);
        const limiteDia = orcVar / dias;
        const porDia = new Array(dias).fill(0);
        for (const t of doMes(ts, ano, mes)) {
            if (t.tipo === 'gasto' && !t.fixo) porDia[Number(String(t.data).slice(8, 10)) - 1] += numero(t.valor);
        }
        const labels = [];
        const diario = [];
        const acumulado = [];
        const ideal = [];
        let acc = 0;
        for (let d = 1; d <= dias; d++) {
            labels.push(String(d));
            diario.push(arred(porDia[d - 1]));
            acc += porDia[d - 1];
            acumulado.push(d <= diaAtual ? arred(acc) : null);
            ideal.push(arred(limiteDia * d));
        }
        return { labels, diario, acumulado, ideal, limiteDia, diaAtual };
    }

    // 6 meses até o mês visto + 3 meses previstos
    function historico(ts, cfg, ano, mes, hoje) {
        const r = resumoMes(ts, cfg, ano, mes, hoje);
        const reais = [];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(ano, mes - i, 1);
            const lista = doMes(ts, d.getFullYear(), d.getMonth());
            reais.push({
                rotulo: MESES_CURTOS[d.getMonth()],
                receitas: somar(lista.filter((t) => t.tipo === 'receita'), (t) => t.valor),
                gastos: somar(lista.filter((t) => t.tipo === 'gasto'), (t) => t.valor),
                temDados: lista.length > 0
            });
        }
        const anteriores = reais.slice(0, 5).filter((x) => x.temDados);
        let mediaR = 0;
        let mediaG = 0;
        let base = 'nenhuma';
        let nBase = 0;
        if (anteriores.length) {
            mediaR = arred(somar(anteriores, (x) => x.receitas) / anteriores.length);
            mediaG = arred(somar(anteriores, (x) => x.gastos) / anteriores.length);
            base = 'historico';
            nBase = anteriores.length;
        } else if (reais[5].temDados) {
            mediaR = r.receitas;
            mediaG = r.projecaoGastos;
            base = 'mes';
            nBase = 1;
        }
        const temBase = base !== 'nenhuma';

        const rotulos = reais.map((x) => x.rotulo);
        const receitas = reais.map((x) => x.receitas);
        const gastos = reais.map((x) => x.gastos);
        const previsto = reais.map(() => false);
        for (let i = 1; i <= 3; i++) {
            const d = new Date(ano, mes + i, 1);
            rotulos.push(MESES_CURTOS[d.getMonth()] + '*');
            receitas.push(temBase ? mediaR : null);
            gastos.push(temBase ? mediaG : null);
            previsto.push(true);
        }
        const saldoMensal = arred(mediaR - mediaG);
        return {
            rotulos, receitas, gastos, previsto, temBase, base, nBase, mediaR, mediaG, saldoMensal,
            acumulado: { m3: arred(saldoMensal * 3), m6: arred(saldoMensal * 6), m12: arred(saldoMensal * 12) }
        };
    }

    // ---------- dicas para os próximos meses ----------
    function dicas(ts, cfg, ano, mes, hoje) {
        const r = resumoMes(ts, cfg, ano, mes, hoje);
        const h = historico(ts, cfg, ano, mes, hoje);
        const out = [];

        if (!ts.length) {
            out.push({ icone: '✍️', titulo: 'Comece anotando tudo', texto: 'Lance cada gasto e cada receita por 30 dias. Sem dados não existe controle; com eles, as previsões melhoram a cada semana.' });
            return out;
        }
        if (!r.configurado) {
            out.push({ icone: '🎯', titulo: 'Defina seu orçamento', texto: 'Preencha "Meu planejamento". Com um limite claro, os alertas vermelho / bom / ótimo passam a funcionar.' });
        }

        if (r.metaEconomia > 0 && h.temBase) {
            if (h.saldoMensal >= r.metaEconomia) {
                out.push({ icone: '✅', titulo: 'Meta de economia no caminho', texto: `Mantendo a média, você guarda cerca de ${moeda(h.saldoMensal)} por mês, acima da meta de ${moeda(r.metaEconomia)}.` });
            } else {
                out.push({ icone: '⚠️', titulo: 'Falta para a meta de economia', texto: `Na média atual sobram ${moeda(h.saldoMensal)} por mês e a meta é ${moeda(r.metaEconomia)}. Faltam ${moeda(r.metaEconomia - h.saldoMensal)} por mês: o caminho mais fácil é cortar nas categorias de desejo.` });
            }
        }

        // categoria com mais espaço para cortar (média mensal)
        const mesesComDados = new Set(ts.map((t) => String(t.data).slice(0, 7)));
        const n = Math.max(mesesComDados.size, 1);
        const tot = {};
        for (const t of ts) {
            if (t.tipo === 'gasto') tot[t.categoria || 'Outros'] = (tot[t.categoria || 'Outros'] || 0) + numero(t.valor);
        }
        const cats = Object.entries(tot)
            .map(([nome, total]) => ({ nome, media: total / n, grupo: grupoCategoria(nome) }))
            .sort((a, b) => b.media - a.media);
        const alvo = cats.find((c) => c.grupo === 'desejo') || cats[0];
        if (alvo && alvo.media > 0) {
            const eco = alvo.media * 0.10;
            out.push({ icone: '✂️', titulo: `Teste cortar 10% em ${alvo.nome}`, texto: `Você gasta em média ${moeda(alvo.media)} por mês aqui. Reduzindo 10%, são ${moeda(eco)} a mais por mês, ou ${moeda(eco * 12)} em um ano.` });
        }

        // regra 50/30/20
        if (r.receitas > 0 && r.gastos > 0) {
            const gl = doMes(ts, ano, mes).filter((t) => t.tipo === 'gasto');
            const ess = somar(gl.filter((t) => grupoCategoria(t.categoria) === 'essencial'), (t) => t.valor);
            const des = r.gastos - ess;
            const pEss = ess / r.receitas;
            const pDes = des / r.receitas;
            const pSobra = r.saldo / r.receitas;
            if (pEss > 0.5) out.push({ icone: '🏠', titulo: 'Essenciais acima de 50%', texto: `Moradia, mercado, transporte e contas consomem ${pct(pEss)} da renda do mês. A regra 50/30/20 sugere até 50%.` });
            if (pDes > 0.3) out.push({ icone: '🎮', titulo: 'Desejos acima de 30%', texto: `Lazer, compras e extras levaram ${pct(pDes)} da renda. A referência é até 30%.` });
            if (pSobra >= 0.2) out.push({ icone: '👏', titulo: 'Você está guardando bem', texto: `Sobrou ${pct(pSobra)} da renda do mês, acima dos 20% que a regra 50/30/20 recomenda.` });
            else out.push({ icone: '🐖', titulo: 'Guarde primeiro', texto: `Sobrou ${pct(Math.max(pSobra, 0))} da renda; a referência é 20%. Separe a poupança assim que o dinheiro entrar, antes de gastar.` });
        }
        return out.slice(0, 5);
    }

    const api = {
        MESES, MESES_CURTOS, CATEGORIAS_GASTO, CATEGORIAS_RECEITA, iconeCategoria, grupoCategoria,
        isoData, hojeISO, diasNoMes, inicioFimMes, moeda, pct, parseValor,
        doMes, ehMesAtual, resumoMes, mensagemStatus, fraseDoDia, sequencia, nivelPorSequencia,
        porCategoria, serieDiaria, historico, dicas
    };
    raiz.Calc = api;
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
