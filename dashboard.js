/* dashboard.js — tela principal */
(async function () {
    'use strict';

    const { moeda, pct } = Calc;
    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    // ---------- acesso: só entra quem fez login ----------
    const sessao = await DB.sessao();
    if (!sessao) {
        location.replace('index.html');
        return;
    }
    DB.aoSair(() => location.replace('index.html'));
    $('usuario').textContent = sessao.email || '';
    if (DB.demo) $('avisoDemo').hidden = false;

    // ---------- estado ----------
    const inicio = new Date();
    let ano = inicio.getFullYear();
    let mes = inicio.getMonth();
    let ts = [];
    let cfg = { orcamento_mensal: 0, contas_fixas: 0, meta_economia: 0 };
    let nivelAnterior = null;
    let carregando = false;
    let pendente = false;
    let timer = null;
    const charts = {};

    const COR = { vermelho: '#ff6b6b', bom: '#5fd68a', otimo: '#ffd24d', neutro: '#cfd8e3' };
    const PALETA = ['#ff8a80', '#ffd166', '#5fd68a', '#4dc3ff', '#b388ff', '#ff9f43', '#2ee6d6', '#f78fb3', '#c7ecee', '#a3cb38', '#fd79a8', '#dfe6e9'];

    Chart.defaults.color = '#f3eee8';
    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.borderColor = 'rgba(255,255,255,0.12)';

    // ---------- avisos ----------
    function aviso(texto, tipo, ms) {
        const el = document.createElement('div');
        el.className = 'toast ' + (tipo || '');
        el.textContent = texto;
        $('toasts').appendChild(el);
        setTimeout(() => el.remove(), ms || 6000);
    }

    function avisarMudanca(r) {
        const chave = ano + '-' + mes;
        const antes = nivelAnterior;
        nivelAnterior = { chave, nivel: r.nivel };
        if (!antes || antes.chave !== chave || antes.nivel === r.nivel) return;
        if (r.nivel === 'vermelho') aviso('🔴 Atenção: você entrou no vermelho!', 'vermelho', 9000);
        else if (r.nivel === 'bom') aviso('🟢 Você voltou ao trilho: está dentro do planejado.', 'bom');
        else if (r.nivel === 'otimo') aviso('🏆 Ótimo! Você está abaixo do ritmo planejado.', 'otimo', 8000);
    }

    // ---------- carregar dados ----------
    async function carregar() {
        if (carregando) { pendente = true; return; }
        carregando = true;
        try {
            const ini = new Date(ano, mes - 5, 1);
            const [de] = Calc.inicioFimMes(ini.getFullYear(), ini.getMonth());
            const [, ate] = Calc.inicioFimMes(ano, mes);
            const [lista, conf] = await Promise.all([DB.listar(de, ate), DB.config()]);
            ts = lista;
            cfg = conf;
            desenharTudo();
        } catch (e) {
            console.error(e);
            aviso('Não consegui carregar os dados: ' + e.message, 'vermelho');
        } finally {
            carregando = false;
            if (pendente) { pendente = false; carregar(); }
        }
    }

    function agendarRecarga() {
        clearTimeout(timer);
        timer = setTimeout(carregar, 200);
    }

    // ---------- desenho da tela ----------
    function desenharTudo() {
        const hoje = new Date();
        const r = Calc.resumoMes(ts, cfg, ano, mes, hoje);
        const serie = Calc.serieDiaria(ts, cfg, ano, mes, hoje);
        const cats = Calc.porCategoria(ts, ano, mes);
        const h = Calc.historico(ts, cfg, ano, mes, hoje);

        $('mesLabel').textContent = Calc.MESES[mes] + ' ' + ano;
        desenharBanner(r);
        desenharResumo(r);
        desenharMotivacao(r, hoje);
        desenharGraficos(r, serie, cats, h);
        desenharProximos(h, Calc.dicas(ts, cfg, ano, mes, hoje));
        desenharLista();
        preencherPlano(r);
        avisarMudanca(r);
    }

    function desenharBanner(r) {
        const m = Calc.mensagemStatus(r);
        $('banner').className = 'glass c12 banner ' + r.nivel;
        $('bSelo').textContent = m.icone;
        $('bTitulo').textContent = m.titulo;
        $('bTexto').textContent = m.texto;

        const usado = r.orcVar > 0 ? Math.min(r.gastosVar / r.orcVar, 1) : (r.gastosVar > 0 ? 1 : 0);
        $('bBarra').style.width = Math.round(usado * 100) + '%';
        $('bMarca').style.left = 'calc(' + Math.round(r.progresso * 100) + '% - 1px)';
        $('bMarca').hidden = !r.configurado || r.futuro;

        $('bVar').textContent = r.configurado
            ? 'Variáveis: ' + moeda(r.gastosVar) + ' de ' + moeda(r.orcVar) + ' (' + pct(r.orcVar > 0 ? r.gastosVar / r.orcVar : 0) + ')'
            : 'Defina seu orçamento para ver o ritmo';
        $('bFixo').textContent = r.contasFixas > 0 ? 'Contas fixas: ' + moeda(r.gastosFixos) + ' de ' + moeda(r.contasFixas) + ' previstas' : '';
        $('bDia').textContent = r.futuro ? '' : 'Dia ' + r.diaAtual + ' de ' + r.dias + ' · a linha branca é onde você deveria estar';
    }

    function desenharResumo(r) {
        $('vReceitas').textContent = moeda(r.receitas);
        $('vGastos').textContent = moeda(r.gastos);
        const s = $('vSaldo');
        s.textContent = moeda(r.saldo);
        s.className = r.saldo < 0 ? 'neg' : 'pos';

        if (r.mesAtual) {
            $('rDiaRot').textContent = 'Pode gastar hoje';
            $('vDia').textContent = moeda(Math.max(r.podeGastarPorDia, 0));
            $('sDia').textContent = !r.configurado
                ? 'Defina o orçamento para calcular'
                : r.restanteVar <= 0
                    ? 'Orçamento variável esgotado'
                    : 'Hoje já saiu ' + moeda(r.gastoHoje) + ' · ' + r.diasRestantes + ' dias restantes';
        } else if (r.passado) {
            $('rDiaRot').textContent = 'Média por dia';
            $('vDia').textContent = moeda(r.gastosVar / r.dias);
            $('sDia').textContent = 'Gastos variáveis do mês';
        } else {
            $('rDiaRot').textContent = 'Limite por dia';
            $('vDia').textContent = moeda(r.limiteDia);
            $('sDia').textContent = 'Planejado para este mês';
        }
    }

    function desenharMotivacao(r, hoje) {
        $('mFrase').textContent = Calc.fraseDoDia(hoje);

        if (r.mesAtual) {
            const seq = Calc.sequencia(ts, cfg, hoje);
            const n = Calc.nivelPorSequencia(seq);
            $('mSeq').textContent = String(seq);
            $('mNivelIcone').textContent = n.atual.icone;
            $('mNivel').textContent = n.atual.nome;
            $('mNivelBarra').style.width = Math.round(n.pct * 100) + '%';
            $('mNivelProx').textContent = n.proximo
                ? 'Faltam ' + n.falta + (n.falta === 1 ? ' dia' : ' dias') + ' para ' + n.proximo.icone + ' ' + n.proximo.nome
                : 'Nível máximo! Continue assim.';
        } else {
            $('mSeq').textContent = '—';
            $('mNivelIcone').textContent = '📅';
            $('mNivel').textContent = 'Mês ' + (r.passado ? 'passado' : 'futuro');
            $('mNivelBarra').style.width = '0%';
            $('mNivelProx').textContent = 'A sequência diária vale para o mês atual.';
        }

        if (r.metaEconomia > 0) {
            const guardado = Math.max(r.saldo, 0);
            $('mMetaTxt').textContent = moeda(r.saldo) + ' de ' + moeda(r.metaEconomia);
            $('mMetaBarra').style.width = Math.round(Math.min(guardado / r.metaEconomia, 1) * 100) + '%';
        } else {
            $('mMetaTxt').textContent = 'Defina em "Meu planejamento"';
            $('mMetaBarra').style.width = '0%';
        }
    }

    // ---------- gráficos ----------
    function eixosMoeda() {
        return {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                x: { ticks: { color: '#eee', maxRotation: 0, autoSkip: true }, grid: { display: false } },
                y: { beginAtZero: true, ticks: { color: '#eee', callback: (v) => 'R$ ' + v }, grid: { color: 'rgba(255,255,255,0.12)' } }
            },
            plugins: {
                legend: { labels: { color: '#fff', boxWidth: 14 } },
                tooltip: { callbacks: { label: (c) => ' ' + c.dataset.label + ': ' + moeda(c.parsed.y) } }
            }
        };
    }

    function desenhar(id, config) {
        const c = charts[id];
        if (c) {
            c.data = config.data;
            c.update();
            return;
        }
        charts[id] = new Chart($(id), config);
    }

    function desenharGraficos(r, serie, cats, h) {
        const corStatus = COR[r.nivel] || COR.neutro;

        desenhar('gCat', {
            type: 'doughnut',
            data: {
                labels: cats.map((c) => c.categoria),
                datasets: [{
                    data: cats.map((c) => c.total),
                    backgroundColor: cats.map((_, i) => PALETA[i % PALETA.length]),
                    borderColor: 'rgba(0,0,0,0.35)',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '62%',
                plugins: {
                    legend: { position: 'bottom', labels: { color: '#fff', boxWidth: 12 } },
                    tooltip: { callbacks: { label: (c) => ' ' + c.label + ': ' + moeda(c.parsed) } }
                }
            }
        });
        $('vCat').hidden = cats.length > 0;

        desenhar('gAcum', {
            type: 'line',
            data: {
                labels: serie.labels,
                datasets: [
                    { label: 'Gasto acumulado', data: serie.acumulado, borderColor: corStatus, backgroundColor: corStatus + '33', fill: true, tension: 0.25, pointRadius: 0, borderWidth: 3 },
                    { label: 'Ritmo ideal', data: serie.ideal, borderColor: 'rgba(255,255,255,0.75)', borderDash: [6, 6], pointRadius: 0, borderWidth: 2, fill: false }
                ]
            },
            options: eixosMoeda()
        });

        desenhar('gDia', {
            type: 'bar',
            data: {
                labels: serie.labels,
                datasets: [
                    {
                        label: 'Gasto do dia',
                        data: serie.diario,
                        backgroundColor: serie.diario.map((v) => (serie.limiteDia > 0 && v > serie.limiteDia ? COR.vermelho : COR.bom)),
                        borderRadius: 4
                    },
                    { type: 'line', label: 'Limite diário', data: serie.labels.map(() => serie.limiteDia), borderColor: '#fff', borderDash: [6, 6], pointRadius: 0, borderWidth: 2 }
                ]
            },
            options: eixosMoeda()
        });

        desenhar('gHist', {
            type: 'bar',
            data: {
                labels: h.rotulos,
                datasets: [
                    { label: 'Receitas', data: h.receitas, backgroundColor: h.previsto.map((p) => (p ? 'rgba(95,214,138,0.35)' : 'rgba(95,214,138,0.9)')), borderColor: COR.bom, borderWidth: h.previsto.map((p) => (p ? 1 : 0)), borderRadius: 4 },
                    { label: 'Gastos', data: h.gastos, backgroundColor: h.previsto.map((p) => (p ? 'rgba(255,138,128,0.35)' : 'rgba(255,138,128,0.9)')), borderColor: '#ff8a80', borderWidth: h.previsto.map((p) => (p ? 1 : 0)), borderRadius: 4 }
                ]
            },
            options: eixosMoeda()
        });
    }

    // ---------- próximos meses ----------
    function desenharProximos(h, dicas) {
        let topo;
        if (!h.temBase) {
            topo = '<p class="prev-nota">Ainda não há dados suficientes para prever. Continue lançando: com um mês completo as projeções aparecem aqui.</p>';
        } else {
            const classe = (v) => (v < 0 ? 'neg' : 'pos');
            const fonte = h.base === 'historico'
                ? 'Previsão pela média dos ' + h.nBase + (h.nBase === 1 ? ' mês anterior' : ' meses anteriores') + ': receitas ' + moeda(h.mediaR) + ' e gastos ' + moeda(h.mediaG) + '.'
                : 'Previsão baseada neste mês (projeção do fechamento). Com mais meses de histórico fica mais precisa.';
            topo =
                '<div class="prev-grid">' +
                '<div><span>Sobra em 3 meses</span><strong class="' + classe(h.acumulado.m3) + '">' + moeda(h.acumulado.m3) + '</strong></div>' +
                '<div><span>Sobra em 6 meses</span><strong class="' + classe(h.acumulado.m6) + '">' + moeda(h.acumulado.m6) + '</strong></div>' +
                '<div><span>Sobra em 12 meses</span><strong class="' + classe(h.acumulado.m12) + '">' + moeda(h.acumulado.m12) + '</strong></div>' +
                '</div><p class="prev-nota">' + esc(fonte) + '</p>';
        }
        $('prevResumo').innerHTML = topo;
        $('listaDicas').innerHTML = dicas
            .map((d) => '<li><span class="d-ico">' + d.icone + '</span><div><strong>' + esc(d.titulo) + '</strong><p>' + esc(d.texto) + '</p></div></li>')
            .join('');
    }

    // ---------- lista ----------
    function desenharLista() {
        const l = Calc.doMes(ts, ano, mes).slice().sort((a, b) => {
            if (a.data !== b.data) return a.data < b.data ? 1 : -1;
            return String(b.criado_em).localeCompare(String(a.criado_em));
        });
        if (!l.length) {
            $('lista').innerHTML = '<p class="vazio-txt">Nenhum lançamento neste mês. Use o formulário para começar.</p>';
            return;
        }
        $('lista').innerHTML = l.map((t) => {
            const sinal = t.tipo === 'receita' ? '+' : '−';
            const classe = t.tipo === 'receita' ? 'pos' : 'coral';
            const dd = String(t.data).slice(8, 10) + '/' + String(t.data).slice(5, 7);
            return '<div class="item">' +
                '<span class="dt">' + dd + '</span>' +
                '<span class="ico">' + Calc.iconeCategoria(t.categoria) + '</span>' +
                '<div class="txt"><strong>' + esc(t.descricao) + '</strong><small>' + esc(t.categoria) + (t.fixo ? ' · conta fixa' : '') + '</small></div>' +
                '<span class="val ' + classe + '">' + sinal + ' ' + moeda(t.valor) + '</span>' +
                '<button type="button" class="apagar" data-id="' + esc(t.id) + '" aria-label="Apagar lançamento"><i class="fa-solid fa-trash"></i></button>' +
                '</div>';
        }).join('');
    }

    $('lista').addEventListener('click', async (e) => {
        const b = e.target.closest('.apagar');
        if (!b) return;
        if (!confirm('Apagar este lançamento?')) return;
        try {
            await DB.remover(b.dataset.id);
            await carregar();
        } catch (err) {
            aviso('Não consegui apagar: ' + err.message, 'vermelho');
        }
    });

    // ---------- planejamento ----------
    function fmtInput(v) { return v > 0 ? String(v).replace('.', ',') : ''; }

    function preencherPlano(r) {
        $('plano').classList.toggle('destaque', !r.configurado);
        if (document.activeElement && document.activeElement.closest && document.activeElement.closest('#formPlano')) return;
        $('pOrc').value = fmtInput(cfg.orcamento_mensal);
        $('pFixas').value = fmtInput(cfg.contas_fixas);
        $('pMeta').value = fmtInput(cfg.meta_economia);
    }

    $('formPlano').addEventListener('submit', async (e) => {
        e.preventDefault();
        const num = (id) => {
            const t = $(id).value.trim();
            return t === '' ? 0 : Calc.parseValor(t);
        };
        const orc = num('pOrc');
        const fixas = num('pFixas');
        const meta = num('pMeta');
        if ([orc, fixas, meta].some((v) => !Number.isFinite(v) || v < 0)) return aviso('Use apenas números positivos.', 'vermelho');
        if (orc <= 0) return aviso('Informe o orçamento do mês.', 'vermelho');
        if (fixas > orc) return aviso('As contas fixas não podem ser maiores que o orçamento total.', 'vermelho');
        const btn = $('btnPlano');
        btn.disabled = true;
        try {
            await DB.salvarConfig({ orcamento_mensal: orc, contas_fixas: fixas, meta_economia: meta });
            aviso('Planejamento salvo.', 'bom', 3500);
            document.activeElement && document.activeElement.blur();
            await carregar();
        } catch (err) {
            aviso('Não consegui salvar: ' + err.message, 'vermelho');
        }
        btn.disabled = false;
    });

    // ---------- novo lançamento ----------
    function tipoAtual() { return document.querySelector('#formLancar input[name="tipo"]:checked').value; }

    function preencherCategorias() {
        const gasto = tipoAtual() === 'gasto';
        const lista = gasto ? Calc.CATEGORIAS_GASTO.map((c) => c.nome) : Calc.CATEGORIAS_RECEITA;
        $('fCat').innerHTML = lista.map((n) => '<option value="' + esc(n) + '">' + Calc.iconeCategoria(n) + ' ' + esc(n) + '</option>').join('');
        $('fixoWrap').hidden = !gasto;
        if (!gasto) $('fFixo').checked = false;
    }

    document.querySelectorAll('#formLancar input[name="tipo"]').forEach((r) => r.addEventListener('change', preencherCategorias));

    $('formLancar').addEventListener('submit', async (e) => {
        e.preventDefault();
        const tipo = tipoAtual();
        const valor = Calc.parseValor($('fValor').value);
        if (!(valor > 0)) return aviso('Informe um valor maior que zero.', 'vermelho');
        const categoria = $('fCat').value;
        const descricao = $('fDesc').value.trim() || categoria;
        const data = $('fData').value || Calc.hojeISO();
        const btn = $('btnLancar');
        btn.disabled = true;
        try {
            await DB.adicionar({ tipo, descricao, categoria, valor, data, fixo: tipo === 'gasto' && $('fFixo').checked });
            $('fValor').value = '';
            $('fDesc').value = '';
            $('fFixo').checked = false;
            aviso((tipo === 'gasto' ? 'Gasto de ' : 'Receita de ') + moeda(valor) + ' lançado.', '', 3000);
            await carregar();
            $('fValor').focus();
        } catch (err) {
            aviso('Não consegui salvar: ' + err.message, 'vermelho');
        }
        btn.disabled = false;
    });

    // ---------- navegação entre meses, sair, tempo real ----------
    function trocarMes(delta) {
        const d = new Date(ano, mes + delta, 1);
        ano = d.getFullYear();
        mes = d.getMonth();
        carregar();
    }
    $('mesAnt').addEventListener('click', () => trocarMes(-1));
    $('mesProx').addEventListener('click', () => trocarMes(1));

    $('sair').addEventListener('click', async () => {
        await DB.sair();
        location.replace('index.html');
    });

    function statusVivo(status) {
        const ok = status === 'SUBSCRIBED';
        $('vivo').className = 'vivo ' + (ok ? 'on' : 'off');
        $('vivo').textContent = ok ? '● ao vivo' : '● reconectando…';
    }
    DB.assinar(agendarRecarga, statusVivo);

    // ao voltar para a aba (celular desbloqueado, notebook reaberto), atualiza
    document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(); });

    // ---------- início ----------
    $('fData').value = Calc.hojeISO();
    preencherCategorias();
    await carregar();
})();
