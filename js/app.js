// Gestão da Qualidade — Lion Fitness (versão web / GitHub Pages). Porta do app.py (Streamlit).
import * as db from "./db.js?v=20260929h";
import { esc, $, $$, num, brl, fdate, hoje, addDias, hora, toast, alerta, heading, card, row, exp, metric, tip,
  inp, inum, idate, itxt, isel, ichk, icombo, comboValor, tabela, modal, verImagem, confirmar, baixarCSV } from "./ui.js?v=20260929h";
import { paginaAdmin } from "./admin.js?v=20260929h";

// ---------------- constantes ----------------
export const APONTADO = "Apontado";
export const PDCA = ["P · Planejar", "D · Executar", "C · Verificar", "A · Padronizar"];
export const FINAIS = ["Finalizada", "Cancelada"];
export const RNC_STATUS = [APONTADO, ...PDCA, ...FINAIS];
const LEGADO = { "Aberta": PDCA[0], "Em análise": PDCA[0], "Aguardando ações": PDCA[1], "Em andamento": PDCA[1],
  "Verificação de eficácia": PDCA[2], "Fechada": "Finalizada", "Encerrada": "Finalizada" };
export const ACAO_STATUS = ["Pendente", "Em andamento", "Concluída", "Cancelada"];
const arr = (v) => Array.isArray(v) ? v : v && typeof v === "object" ? Object.keys(v).sort().map((k) => v[k]) : v ? [String(v)] : [];
const CLI_ORIG = ["Fornecedor", "Cliente / Assistência técnica"];
const ORIGENS = ["Interna (processo)", "Fornecedor", "Cliente / Assistência técnica", "Auditoria", "Inspeção de recebimento"];
const DISPOSICAO = ["Retrabalho", "Refugo / Sucata", "Uso condicional (concessão)", "Devolução ao fornecedor", "Reclassificação", "Em avaliação"];
const GRAVIDADE = ["Baixa", "Média", "Alta", "Crítica"];
const TIPO_ACAO = ["Contenção", "Corretiva", "Preventiva", "Melhoria"];
const TURNOS = ["1º", "2º", "3º", "Comercial"];
const M6 = [["metodo", "Método"], ["maquina", "Máquina"], ["material", "Material"], ["mao_obra", "Mão de obra"], ["meio_ambiente", "Meio ambiente"], ["medicao", "Medição"]];
const BRAND = "#d4501e";
const MENU = ["📊 Visão geral", "📝 Não conformidades", "🗂️ Tratativas PDCA", "✅ Plano de ações"];
const ADMIN_MENU = "⚙️ Administração";
const LOGO = "assets/logo-lion-fitness.png";
// Icons are presentation only; MENU values remain the navigation keys.
const NAV_ICONS = [
  '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  '<path d="M14 3H5v18h14V8Z"/><path d="M14 3v5h5M8 12h8M8 16h6"/>',
  '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16m6-16v16M5 8h2m4 0h2m4 0h2"/>',
  '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m7 12 3 3 7-7"/>',
  '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>'
];
const menuLabel = (m, i) => `<svg class="nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[i]}</svg><span>${esc(m.slice(m.indexOf(" ") + 1))}</span>`;

// ---------------- estado ----------------
const S = { user: null, cfg: null, perfis: [], rnc: [], acoes: [], pagina: MENU[0], edit: null, draft: null, filtros: {}, timer: null };
window.GQ = S;
const admin = () => S.user?.perfil === "admin";
export const SETORES = () => Object.keys(S.cfg?.setores || {});
const setUser = () => (admin() ? SETORES() : SETORES().filter((s) => (S.user.setores || []).includes(s)));
export const nome = (login) => S.perfis.find((p) => p.login === login)?.nome || login || "";
const pessoas = () => S.perfis.filter((p) => p.ativo).map((p) => [p.login, `${p.nome} (${p.login})`]);
const statusDe = (r) => LEGADO[r.status] || r.status || APONTADO;
export function custo(r) { return num(r.horas_homem) * num(r.custo_hora) + num(r.horas_maquina) * num(r.custo_hora_maquina) + num(r.custo_material); }
const atrasada = (a) => !!a.quando && !["Concluída", "Cancelada"].includes(a.status) && a.quando.slice(0, 10) < hoje();
const visivel = (r) => admin() || (S.user.setores || []).includes(r.setor_origem);
const rncLbl = (r) => `${r.id} · ${r.setor_origem || ""} · ${r.tipo_nc || (r.descricao || "").slice(0, 40)}`;

async function carregar() {
  const [rnc, acoes, perfis] = await Promise.all([db.listar("rnc"), db.listar("acoes"), db.listarPerfis()]);
  S.perfis = perfis;
  S.rnc = rnc.map((r) => ({ ...r, status: statusDe(r) })).filter(visivel)
    .sort((a, b) => String(b.data || "").localeCompare(String(a.data || "")) || b.id.localeCompare(a.id));
  const ids = new Set(S.rnc.map((r) => r.id));
  S.acoes = acoes.filter((a) => admin() || (a.rnc_id ? ids.has(a.rnc_id) : (S.user.setores || []).includes(a.onde)));
}

// ---------------- shell / navegação ----------------
const app = () => $("#app");
function shell() {
  const menu = admin() ? [...MENU, ADMIN_MENU] : MENU;
  app().innerHTML = `<div class="shell">
    <aside class="sidebar">
      <div class="brand"><img src="${LOGO}" alt="Lion Fitness"></div>
      <div class="caption">GESTÃO DA QUALIDADE</div><hr>
      <nav class="nav" aria-label="Navegação principal">${menu.map((m, i) => `<button data-nav="${esc(m)}" class="${m === S.pagina ? "on" : ""}">${menuLabel(m, i)}</button>`).join("")}</nav><hr>
      <div><b>${esc(S.user.nome)}</b><div class="caption">${esc(S.user.login)} · ${admin() ? "Administrador" : "Usuário"}</div></div>
      <button class="btn block" id="bt-senha">Trocar senha</button>
      <button class="btn block" id="bt-sair">Sair</button>
      <div class="caption">Dados atualizados automaticamente.</div>
    </aside><div class="backdrop"></div>
    <div class="main"><div class="topbar"><button id="bt-menu" aria-label="Menu">☰</button><img src="${LOGO}" alt=""><span>Gestão da Qualidade</span></div>
      <div class="container" id="page"></div></div></div>`;
  const sh = $(".shell");
  $("#bt-menu").onclick = () => sh.classList.add("menu");
  $(".backdrop").onclick = () => sh.classList.remove("menu");
  $$("[data-nav]").forEach((b) => (b.onclick = () => { sh.classList.remove("menu"); navegar(b.dataset.nav); }));
  $("#bt-sair").onclick = async () => { await db.sair(); location.reload(); };
  $("#bt-senha").onclick = trocarSenha;
}
// navegação instantânea: desenha com os dados em memória e atualiza em segundo plano
let _nav = 0, _bg = null;
function navegar(p, extra) {
  if (S.edit && S.pagina !== p) guardarRascunho();
  S.pagina = p; S.edit = extra || null;
  $$("[data-nav]").forEach((b) => b.classList.toggle("on", b.dataset.nav === p));
  const n = ++_nav;
  render(); window.scrollTo(0, 0);
  if (_bg) return; // já existe uma atualização em andamento
  const antes = JSON.stringify([S.rnc, S.acoes]);
  _bg = carregar().then(() => {
    // redesenha só se algo mudou e o usuário não está editando
    if (n === _nav && !S.edit && !document.querySelector(".modal") && JSON.stringify([S.rnc, S.acoes]) !== antes) render();
  }).catch((e) => console.warn(e)).finally(() => { _bg = null; });
}
const secsAtual = (E) => E._sec;
function guardarRascunho() { if (S.edit?.rec) S.draft = { tipo: S.edit.tipo, rec: JSON.parse(JSON.stringify(S.edit.rec)), pagina: S.pagina }; }
function render() {
  const pg = $("#page"); if (!pg) return;
  try {
    const ed = S.edit?.tipo === "rnc" ? editorRnc : S.edit?.tipo === "acao" ? editorAcao : null;
    if (ed) {
      if (ed === editorRnc && !fichaCache) pg.innerHTML = `<div class="loading">Abrindo formulário…</div>`;
      return Promise.resolve(ed(pg)).catch((e) => { console.error(e); pg.innerHTML = alerta("error", esc(e.message)); });
    }
    ({ [MENU[0]]: paginaGeral, [MENU[1]]: paginaRnc, [MENU[2]]: paginaKanban, [MENU[3]]: paginaAcoes,
       [ADMIN_MENU]: (el) => (admin() ? paginaAdmin(el, ctx) : (el.innerHTML = alerta("error", "Acesso restrito ao administrador."))) })[S.pagina](pg);
  } catch (e) { console.error(e); pg.innerHTML = alerta("error", esc(e.message)); }
}
function trocarSenha() {
  const m = modal(`<h3>Trocar senha</h3>${inp("a", "Senha atual", "", { type: "password" })}${inp("n", "Nova senha", "", { type: "password" })}
    ${inp("r", "Repita a nova senha", "", { type: "password" })}<div class="btnrow" style="margin-top:1rem"><button class="btn primary">Salvar</button></div><div class="msg"></div>`, { sm: true });
  m.querySelector(".btn.primary").onclick = async () => {
    const v = (k) => m.querySelector(`[data-k=${k}]`).value;
    const msg = m.querySelector(".msg");
    if (v("n").length < 4) return (msg.innerHTML = alerta("error", "A senha deve ter pelo menos 4 caracteres."));
    if (v("n") !== v("r")) return (msg.innerHTML = alerta("error", "As senhas não conferem."));
    try { await db.trocarSenha(v("a"), v("n"), S.user.login); m.fechar(); toast("Senha alterada."); }
    catch (e) { msg.innerHTML = alerta("error", esc(e.message)); }
  };
}

// contexto compartilhado com admin.js
const ctx = { S, recarregarCfg: async () => { S.cfg = await db.carregarConfig(); S.perfis = await db.listarPerfis(); }, render };

// ---------------- login ----------------
function telaLogin(erro = "") {
  app().innerHTML = `<div class="login"><div class="brand" style="margin:0 auto 1.5rem"><img src="${LOGO}" alt="Lion Fitness"></div>
    ${heading("Gestão da Qualidade", "Entre com sua conta para registrar ocorrências e acompanhar ações.")}
    <form class="card" id="flogin">${inp("login", "Login", "", { ph: "ex.: joao.silva" })}<div style="height:.6rem"></div>
      ${inp("senha", "Senha", "", { type: "password" })}${ichk("manter", "Manter conectado neste dispositivo", true)}
      <button class="btn primary block" type="submit">Entrar</button><div class="msg">${erro ? alerta("error", esc(erro)) : ""}</div></form>
    <div class="caption" style="text-align:center">Esqueceu a senha? Peça ao administrador.</div></div>`;
  $("#flogin").onsubmit = async (e) => {
    e.preventDefault();
    const v = (k) => $(`[data-k=${k}]`);
    if (!v("login").value.trim() || !v("senha").value) return ($("#flogin .msg").innerHTML = alerta("error", "Informe login e senha."));
    try { S.user = await db.entrar(v("login").value, v("senha").value, v("manter").checked); await iniciar(); }
    catch (err) { $("#flogin .msg").innerHTML = alerta("error", esc(err.message)); }
  };
}
function avisoFicha() {
  if ($("#aviso-ficha")) return;
  const d = document.createElement("div"); d.id = "aviso-ficha";
  d.style.cssText = "position:fixed;left:50%;bottom:1rem;transform:translateX(-50%);z-index:1200;max-width:92vw;background:var(--ink);color:var(--surface,#fff);padding:.8rem 1rem;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,.3);display:flex;gap:.8rem;align-items:center;flex-wrap:wrap";
  d.innerHTML = `<span>📄 A ficha técnica foi atualizada. ${S.edit ? "Salve o que estiver editando e " : ""}recarregue a página.</span><button class="btn primary sm">Recarregar agora</button>`;
  d.querySelector("button").onclick = () => { if (S.edit) guardarRascunho(); location.reload(); };
  document.body.append(d);
}
async function iniciar() {
  app().innerHTML = `<div class="loading">Carregando dados…</div>`;
  S.cfg = await db.carregarConfig();
  await carregar();
  shell(); render();
  // pré-carrega a ficha técnica quando o aparelho estiver ocioso (não disputa com a 1ª tela)
  (window.requestIdleCallback || ((f) => setTimeout(f, 2500)))(() => ficha(), { timeout: 4000 });
  // celular: gráficos sem animação (bem mais leve)
  if (window.Chart && matchMedia("(max-width: 900px), (pointer: coarse)").matches) Chart.defaults.animation = false;
  clearInterval(S.timer);
  try { S.fv = await db.fichaVersao(); } catch {}
  S.timer = setInterval(async () => {
    try { const v = await db.fichaVersao(); if (S.fv != null && v != null && v !== S.fv) avisoFicha(); if (S.fv == null) S.fv = v; } catch {}
    if (S.edit || document.querySelector(".modal") || document.hidden || S.pagina === ADMIN_MENU) return;
    try { await carregar(); render(); } catch {}
  }, Math.max(10, num(S.cfg.parametros.refresh_segundos) || 30) * 1000);
}

// ---------------- Visão geral ----------------
function filtroPeriodo(el, chave) {
  const f = (S.filtros[chave] ||= { de: addDias(hoje(), -365), ate: hoje(), setor: "" });
  return { f, html: row("c3", idate("de", "Data inicial", f.de), idate("ate", "Data final", f.ate),
    isel("setor", "Setor", setUser(), f.setor, { ph: "Todos os meus setores" })) };
}
function ligarFiltros(el, f, cb) {
  $$("[data-k]", el).forEach((i) => (i.onchange = () => { f[i.dataset.k] = i.type === "checkbox" ? i.checked : i.value; cb(); }));
}
function paginaGeral(el) {
  const { f, html } = filtroPeriodo(el, "painel");
  const aba = S.filtros.painelAba || 0;
  el.innerHTML = heading("Visão geral", "Acompanhe os resultados da qualidade e identifique o que precisa de atenção.") +
    `<div class="btnrow"><button class="btn primary" id="g-nova" ${setUser().length ? "" : "disabled"}>+ Registrar não conformidade</button>
     <button class="btn" id="g-trat">Ver tratativas</button><button class="btn" id="g-acoes">Ver plano de ações</button></div>` +
    card(html) + `<div class="tabs"><button class="${aba ? "" : "on"}" data-t="0">Resultados e indicadores</button><button class="${aba ? "on" : ""}" data-t="1">Metas por setor</button></div><div id="g-body"></div>`;
  $("#g-nova").onclick = () => novaRnc(); $("#g-trat").onclick = () => navegar(MENU[2]); $("#g-acoes").onclick = () => navegar(MENU[3]);
  $$(".tabs button", el).forEach((b) => (b.onclick = () => { S.filtros.painelAba = +b.dataset.t; paginaGeral(el); }));
  ligarFiltros($(".card", el), f, () => paginaGeral(el));
  if (f.de > f.ate) return ($("#g-body").innerHTML = alerta("warn", "A data inicial deve ser anterior ou igual à data final."));
  (aba ? painelMetas : painel)($("#g-body"), f);
}
const noPeriodo = (f) => S.rnc.filter((r) => (!f.setor || r.setor_origem === f.setor) && String(r.data || "").slice(0, 10) >= f.de && String(r.data || "").slice(0, 10) <= f.ate);
const charts = [];
function grafico(canvas, cfg) { charts.push(new Chart(canvas, { ...cfg, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: !!cfg.legend } }, ...cfg.options } })); }
function painel(el, f) {
  charts.splice(0).forEach((c) => c.destroy());
  const R = noPeriodo(f); const ids = new Set(R.map((r) => r.id));
  const A = S.acoes.filter((a) => ids.has(a.rnc_id));
  const verif = R.filter((r) => ["Sim", "Não"].includes(r.eficaz));
  // componentes de custo
  const cHH = (r) => num(r.horas_homem) * num(r.custo_hora);
  const cHM = (r) => num(r.horas_maquina) * num(r.custo_hora_maquina);
  const cRef = (r) => num(r.custo_material);
  const hTot = (r) => num(r.horas_homem);
  const soma = (fn) => R.reduce((s, r) => s + fn(r), 0);
  const hfmt = (v) => v.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " h";
  const k = [metric("RNCs no período", R.length), metric("Peças não conformes", soma((r) => num(r.qtd_nc)).toLocaleString("pt-BR")),
    metric("Custo com retrabalho", brl(soma(custo))), metric("Custo h/homem", brl(soma(cHH))),
    metric("Custo refugo (peças)", brl(soma(cRef))), metric("Horas de retrabalho", hfmt(soma(hTot)))];
  const k2 = [metric("Tratativas em aberto", R.filter((r) => PDCA.includes(r.status)).length), metric("Reincidências", R.filter((r) => r.reincidente === "Sim").length),
    metric("Ações pendentes", A.filter((a) => ["Pendente", "Em andamento"].includes(a.status)).length), metric("Ações atrasadas", A.filter(atrasada).length),
    metric("Custo h/máquina", brl(soma(cHM))), metric("Eficácia das ações", verif.length ? Math.round(100 * verif.filter((r) => r.eficaz === "Sim").length / verif.length) + "%" : "—")];
  const aba = Math.min(S.filtros.painelSub || 0, 3);
  const visao = S.filtros.painelVisao || "m";
  const abas = ["Custos e horas", "Produtos e peças", "Problemas e setores", "Situação e atrasos"];
  el.innerHTML = `<div class="metrics">${k.join("")}</div>` + exp("Outros indicadores", `<div class="metrics">${k2.join("")}</div>`) +
    `<div class="tabs">${abas.map((t, i) => `<button class="${i === aba ? "on" : ""}" data-s="${i}">${t}</button>`).join("")}</div>` +
    (aba < 3 ? `<div class="tabs" style="margin-top:-.4rem">${[["d", "🗓️ Dia a dia"], ["m", "📅 Mês a mês"], ["a", "📆 Ano a ano"]].map(([v, t]) => `<button class="${v === visao ? "on" : ""}" data-v="${v}">${t}</button>`).join("")}</div>` : "") +
    (R.length ? `<div class="row c2" id="g-ch"></div>` : alerta("info", "Sem dados no período.")) +
    `<div class="caption">Top 10 = soma do período filtrado. Atualizado às ${hora()}</div>`;
  $$("[data-s]", el).forEach((b) => (b.onclick = () => { S.filtros.painelSub = +b.dataset.s; painel(el, f); }));
  $$("[data-v]", el).forEach((b) => (b.onclick = () => { S.filtros.painelVisao = b.dataset.v; painel(el, f); }));
  if (!R.length) return;
  if (aba === 1 && !fichaCache) { ficha().then(() => painel(el, f)); return; }
  const box = $("#g-ch");
  const bloco = (t, largo) => { const d = document.createElement("div"); d.className = "card"; if (largo) d.style.gridColumn = "1 / -1";
    d.innerHTML = `<div class="ttl">${t}</div><div class="chart"><canvas></canvas></div>`; box.append(d); return d.querySelector("canvas"); };
  const conta = (arr, fk, fv = () => 1) => { const m = {}; arr.forEach((x) => { const kk = fk(x) || "—"; m[kk] = (m[kk] || 0) + fv(x); }); return Object.entries(m).sort((a, b) => b[1] - a[1]); };
  const barh = (cv, pares, lbl, fmt) => grafico(cv, { type: "bar", data: { labels: pares.map((p) => p[0]), datasets: [{ label: lbl, data: pares.map((p) => p[1]), backgroundColor: BRAND }] },
    options: { indexAxis: "y", plugins: { legend: { display: false }, tooltip: fmt ? { callbacks: { label: (c) => fmt(c.raw) } } : {} } } });
  const top = (pares) => pares.filter((x) => x[1] > 0).slice(0, 10);
  // eixo temporal (mês a mês ou ano a ano)
  const per = (r) => String(r.data || "").slice(0, visao === "a" ? 4 : visao === "d" ? 10 : 7);
  let PER = [...new Set(R.map(per).filter(Boolean))].sort();
  if (visao === "d" && PER.length) { // dia a dia: todos os dias do período (inclusive sem registros)
    const ini = f.de || PER[0], fim = f.ate || PER[PER.length - 1]; const dias = [];
    for (let d = ini; d <= fim && dias.length < 800; d = addDias(d, 1)) dias.push(d);
    if (dias.length) PER = dias;
  }
  const lblPer = PER.map((p) => visao === "d" ? p.slice(8, 10) + "/" + p.slice(5, 7) : p.split("-").reverse().join("/"));
  const serie = (fn, arr = R) => PER.map((p) => arr.filter((r) => per(r) === p).reduce((s, r) => s + fn(r), 0));
  const CORES = [BRAND, "#1f2a44", "#e8a33d", "#3a8f5c", "#7b5ea7", "#c0504d", "#2e86ab", "#8c8c8c", "#b5651d", "#5d9b9b"];
  const temporal = (titulo, datasets, fmt, empilhado) => grafico(bloco(titulo, true), { type: "bar", legend: datasets.length > 1,
    data: { labels: lblPer, datasets: datasets.map((d, i) => ({ backgroundColor: CORES[i % 10], borderColor: CORES[i % 10], ...d })) },
    options: { plugins: { legend: { display: datasets.length > 1 }, tooltip: fmt ? { callbacks: { label: (c) => `${c.dataset.label}: ${fmt(c.raw)}` } } : {} },
      scales: { x: { stacked: !!empilhado }, y: { stacked: !!empilhado, beginAtZero: true }, ...(datasets.some((d) => d.yAxisID === "y1") ? { y1: { position: "right", beginAtZero: true, grid: { display: false } } } : {}) } } });
  // séries por categoria (top 10 no período) ao longo do tempo
  const porCategoria = (titulo, fk, fv, fmt) => {
    const cats = top(conta(R, fk, fv)).map((x) => x[0]);
    temporal(titulo, cats.map((c) => ({ label: c, data: serie(fv, R.filter((r) => (fk(r) || "—") === c)) })), fmt, true);
  };
  const qtd = (r) => num(r.qtd_nc);
  if (aba === 0) {
    temporal("Custo com retrabalho (R$)", [{ label: "H/homem", data: serie(cHH) }, { label: "H/máquina", data: serie(cHM) }, { label: "Refugo (peças)", data: serie(cRef) }], brl, true);
    temporal("Custo h/homem (R$)", [{ label: "Custo h/homem", data: serie(cHH) }], brl);
    temporal("Custo refugo – peças (R$)", [{ label: "Refugo", data: serie(cRef) }], brl);
    temporal("Horas totais de retrabalho", [{ label: "Horas homem", data: serie(hTot) }, { label: "Horas máquina", data: serie((r) => num(r.horas_maquina)) }], hfmt);
  } else if (aba === 1) {
    const fp = fichaCache.produtos || {};
    const prod = (r) => r.produto ? (fp[r.produto]?.nome ? `${r.produto} - ${fp[r.produto].nome}` : r.produto).slice(0, 45) : "";
    const Rp = R.filter((r) => r.produto);
    barh(bloco("NC por produto – Top 10 (un)"), top(conta(Rp, prod, qtd)), "Unidades NC");
    // peça: código/descrição informados na RNC + partes substituídas
    const pecas = [];
    R.forEach((r) => {
      if (r.cod_peca || r.desc_peca) pecas.push({ r, k: [r.cod_peca, r.desc_peca].filter(Boolean).join(" - ").slice(0, 45), q: qtd(r) });
      (r.pecas_subst || []).forEach((p) => pecas.push({ r, k: [p.codigo, p.nome].filter(Boolean).join(" - ").slice(0, 45), q: num(p.qtd) }));
    });
    const tp = top(conta(pecas, (x) => x.k, (x) => x.q));
    barh(bloco("NC por peça – Top 10 (un)"), tp, "Unidades");
    porCategoria("NC por produto ao longo do tempo (Top 10, un)", prod, qtd);
    const cats = tp.map((x) => x[0]);
    temporal("NC por peça ao longo do tempo (Top 10, un)", cats.map((c) => ({ label: c, data: PER.map((p) => pecas.filter((x) => x.k === c && per(x.r) === p).reduce((s, x) => s + x.q, 0)) })), null, true);
  } else if (aba === 2) {
    barh(bloco("NC por tipo de problema – Top 10 (ocorrências)"), top(conta(R, (r) => r.tipo_nc)), "RNCs");
    barh(bloco("NC por setor de origem (ocorrências)"), conta(R, (r) => r.setor_origem), "RNCs");
    porCategoria("Tipo de problema ao longo do tempo (Top 10)", (r) => r.tipo_nc, () => 1);
    porCategoria("Setores ao longo do tempo", (r) => r.setor_origem, () => 1);
    const p = top(conta(R, (r) => r.tipo_nc, qtd)); const tot = p.reduce((s, x) => s + x[1], 0) || 1; let ac = 0;
    grafico(bloco("Pareto de defeitos – Top 10 (peças NC)", true), { type: "bar", legend: true, data: { labels: p.map((x) => x[0]), datasets: [
      { label: "Peças", data: p.map((x) => x[1]), backgroundColor: BRAND, yAxisID: "y" },
      { label: "% acumulado", type: "line", data: p.map((x) => ((ac += x[1]) / tot) * 100), borderColor: "#1f2a44", yAxisID: "y1" }] },
      options: { plugins: { legend: { display: true } }, scales: { y1: { position: "right", min: 0, max: 100, grid: { display: false }, ticks: { callback: (v) => v + "%" } }, x: { ticks: { maxRotation: 35, minRotation: 35 } } } } });
  } else {
    barh(bloco("Status das RNCs"), conta(R, (r) => r.status), "RNCs");
    const at = S.acoes.filter((a) => atrasada(a) && (!a.rnc_id || ids.has(a.rnc_id))).sort((a, b) => a.quando.localeCompare(b.quando));
    const d = document.createElement("div"); d.className = "card";
    d.innerHTML = `<div class="ttl">Ações atrasadas</div>` + (at.length ? tabela([["id", "Ação"], ["rnc_id", "RNC"], ["o_que", "O que", "wrap"], ["quem", "Quem"], ["prazo", "Prazo"]],
      at.map((a) => ({ ...a, quem: nome(a.quem), prazo: fdate(a.quando) })), { h: 300 }) : `<div class="caption">Nenhuma ação atrasada. 👍</div>`);
    box.append(d);
  }
}
function painelMetas(el, f) {
  const sp = S.cfg.setor_params || {};
  const lista = Object.keys(sp).filter((s) => setUser().includes(s) && (!f.setor || s === f.setor) && (sp[s].meta_rnc_mes != null || sp[s].meta_custo_mes != null)).sort();
  if (!lista.length) return (el.innerHTML = alerta("info", "Nenhuma meta cadastrada para os setores selecionados."));
  const [ai, mi] = f.de.split("-").map(Number), [af, mf] = f.ate.split("-").map(Number);
  const meses = (af - ai) * 12 + mf - mi + 1;
  const linhas = lista.map((s) => {
    const R = S.rnc.filter((r) => r.setor_origem === s && String(r.data).slice(0, 10) >= f.de && String(r.data).slice(0, 10) <= f.ate);
    const qtd = R.length, cst = R.reduce((a, r) => a + custo(r), 0);
    const mr = sp[s].meta_rnc_mes != null ? num(sp[s].meta_rnc_mes) * meses : null, mc = sp[s].meta_custo_mes != null ? num(sp[s].meta_custo_mes) * meses : null;
    const ok = (mr == null || qtd <= mr) && (mc == null || cst <= mc);
    return { setor: s, rncs: qtd, meta_rnc: mr ?? "—", custo: cst, meta_custo: mc ?? "", sit: ok ? "🟢 Dentro da meta" : "🔴 Acima da meta" };
  });
  el.innerHTML = `<h4>Metas por setor — período de ${meses} ${meses === 1 ? "mês" : "meses"} (meta mensal × meses)</h4>` +
    tabela([["setor", "Setor"], ["rncs", "RNCs", "num"], ["meta_rnc", "Meta RNCs", "num"], ["custo", "Custo NC (R$)", "brl"], ["meta_custo", "Meta custo (R$)", "brl"], ["sit", "Situação"]], linhas);
}

// ---------------- Não conformidades (lista) ----------------
function paginaRnc(el) {
  const f = (S.filtros.rnc ||= { setor: "", status: "", q: "" });
  el.innerHTML = heading("Não conformidades", "Registre uma ocorrência e acompanhe sua resolução. Selecione uma linha para ver os detalhes.") +
    (S.draft?.tipo === "rnc" ? alerta("warn", `Você tem um formulário em andamento${S.draft.rec.id ? ` (${S.draft.rec.id})` : ""}. <button class="btn sm" id="r-ret">Continuar preenchimento</button> <button class="btn sm" id="r-desc">Descartar</button>`) : "") +
    `<div class="btnrow"><button class="btn primary" id="r-nova" ${setUser().length ? "" : "disabled"}>+ Registrar não conformidade</button></div>` +
    (setUser().length ? "" : alerta("info", "Solicite ao administrador acesso a um setor para registrar ocorrências.")) +
    card(row("c3", isel("setor", "Setor", setUser(), f.setor, { ph: "Todos os meus setores" }), isel("status", "Etapa", RNC_STATUS, f.status, { ph: "Todas as etapas" }),
      inp("q", "Buscar ocorrência", f.q, { ph: "Número, descrição, peça ou OP" }))) + `<div id="r-tab"></div>`;
  $("#r-nova").onclick = () => novaRnc();
  if ($("#r-ret")) { $("#r-ret").onclick = retomar; $("#r-desc").onclick = () => { S.draft = null; paginaRnc(el); }; }
  ligarFiltros($(".card", el), f, () => paginaRnc(el));
  const q = f.q.trim().toLowerCase();
  const L = S.rnc.filter((r) => (!f.setor || r.setor_origem === f.setor) && (!f.status || r.status === f.status) &&
    (!q || [r.id, r.descricao, r.cod_peca, r.desc_peca, r.op, r.tipo_nc].some((x) => String(x || "").toLowerCase().includes(q))));
  const rows = L.map((r) => { const A = S.acoes.filter((a) => a.rnc_id === r.id);
    return { id: r.id, data: fdate(r.data), setor: r.setor_origem, tipo: r.tipo_nc, qtd: r.qtd_nc, status: r.status, resp: nome(r.responsavel),
      acoes: A.length, atr: A.filter(atrasada).length, custo: custo(r) }; });
  const cols = [["id", "Nº"], ["data", "Data"], ["setor", "Setor origem"], ["tipo", "Tipo de NC"], ["qtd", "Qtd NC", "num"], ["status", "Status"], ["resp", "Responsável"], ["acoes", "Ações", "num"], ["atr", "Atrasadas", "num"], ["custo", "Custo", "brl"]];
  const box = $("#r-tab");
  if (!rows.length) return (box.innerHTML = alerta("info", "Nenhuma ocorrência encontrada. Ajuste os filtros ou registre uma nova não conformidade."));
  box.innerHTML = `<div class="caption">${rows.length} registro(s) · clique em uma linha para abrir · atualizado ${hora()}</div>` + tabela(cols, rows, { click: true }) +
    `<div class="btnrow" style="margin-top:.8rem"><button class="btn" id="r-csv">⬇ Exportar CSV</button></div>`;
  $$("tr[data-i]", box).forEach((t) => (t.onclick = () => abrirRnc(rows[+t.dataset.i].id)));
  $("#r-csv").onclick = () => baixarCSV("rncs.csv", cols, rows);
}
function novaRnc() {
  if (!setUser().length) return toast("Você não tem setor liberado.");
  navegar(MENU[1], { tipo: "rnc", rec: { data: hoje(), emitente: S.user.login, status: APONTADO, reincidente: "Não", eficaz: "Pendente", setor_origem: setUser().length === 1 ? setUser()[0] : "", porques: ["", "", "", "", ""], ishikawa: {}, pecas_subst: [] }, volta: S.pagina });
}
async function abrirRnc(id, volta) {
  const r = await db.obter("rnc", id);
  if (!r) return toast("RNC não encontrada (pode ter sido excluída).");
  r.status = statusDe(r);
  navegar(MENU[1], { tipo: "rnc", rec: r, volta: volta || S.pagina, fotos: await db.listarFotos(id) });
}
function retomar() { const d = S.draft; S.draft = null; navegar(d.pagina, { tipo: d.tipo, rec: d.rec, volta: d.pagina }); }
function fechar() { const v = S.edit?.volta || S.pagina; S.edit = null; S.draft = null; navegar(v); }

// ---------------- Editor RNC ----------------
let fichaCache = null;
let fichaP = null; // carga única compartilhada (evita baixar a ficha duas vezes ao mesmo tempo)
function ficha() {
  if (fichaCache) return Promise.resolve(fichaCache);
  return (fichaP ||= db.carregarFicha().then((f) => (fichaCache = f))
    .catch((e) => { console.warn(e); return { produtos: {}, partes: {} }; }).finally(() => { fichaP = null; }));
}

async function editorRnc(el) {
  const E = S.edit, r = E.rec, P = S.cfg.parametros;
  // não espera a ficha técnica: abre o formulário já e redesenha a aba Custos quando ela chegar
  const semFicha = !fichaCache;
  if (semFicha) ficha().then(() => { if (fichaCache && S.edit === E && secsAtual(E) === "2") editorRnc(el); });
  const FT = fichaCache || { produtos: {}, partes: {} };
  const novo = !r.id, fin = FINAIS.includes(r.status), trat = r.status !== APONTADO;
  const dis = fin && !admin();
  const secs = trat ? ["1 · Registro", "2 · Custos", "3 · Tratativa", "4 · Evidências"] : ["1 · Registro", "2 · Custos", "4 · Evidências"];
  E.aba = Math.min(E.aba || 0, secs.length - 1);
  // sugestões automáticas (só preenchem vazio ou sugestão anterior)
  const sugerir = (k, v) => { v = Math.round(v * 100) / 100; if (!num(r[k]) || num(r[k]) === num(r["auto_" + k])) r[k] = v; r["auto_" + k] = v; };
  const sp = (S.cfg.setor_params || {})[r.setor_origem] || {};
  if (!fin) r.custo_hora = num(sp.hora_media) || num(P.custo_hora_padrao);
  const MAQ = (S.cfg.maquinas || []).map((m) => ({ ...m, codigo: m.nome || m.descricao || m.codigo, descricao: "" })).filter((m) => !r.setor_origem || m.setor === r.setor_origem);
  if (!Array.isArray(r.maquinas)) r.maquinas = r.maquina ? [{ codigo: r.maquina, horas: num(r.horas_maquina) }] : [];
  if (!fin) {
    r.maquinas.forEach((m) => { const c = MAQ.find((x) => x.codigo === m.codigo); m.valor_hora = c ? num(c.custo_hora) : num(m.valor_hora); });
    const hm = r.maquinas.reduce((s, m) => s + num(m.horas), 0), vm = r.maquinas.reduce((s, m) => s + num(m.horas) * num(m.valor_hora), 0);
    r.horas_maquina = hm; r.custo_hora_maquina = hm ? Math.round((vm / hm) * 100) / 100 : 0;
  }
  if (r.produto && FT.produtos[r.produto]) {
    if (!fin) r.custo_material = Math.round((r.produto_inteiro ? FT.produtos[r.produto].valor * num(r.qtd_nc) : (r.pecas_subst || []).reduce((s, p) => s + num(p.qtd) * num(p.valor_unit), 0)) * 100) / 100;
  }

  const defeitos = (S.cfg.setores || {})[r.setor_origem] || [];
  const tit = novo ? "Nova não conformidade" : `${trat ? "Tratativa" : "Apontamento"} ${r.id}`;
  let h = `<div class="btnrow"><button class="btn" id="e-volta">← Voltar</button></div>` + heading(tit, novo ? "Preencha os campos com *. Salve as alterações antes de sair." : `Etapa: ${r.status}`) +
    (dis ? alerta("info", "Registro encerrado — somente o administrador pode alterar.") : "") +
    `<div class="tabs">${secs.map((s, i) => `<button data-a="${i}" class="${i === E.aba ? "on" : ""}">${s}</button>`).join("")}</div>`;
  const sec = secs[E.aba]; E._sec = sec[0];
  const o = { dis };
  if (sec.startsWith("1")) {
    h += card(row("c4 keep2", idate("data", "Data *", r.data, o), isel("setor_origem", "Setor de origem (gerador) *", setUser(), r.setor_origem, { ...o, ph: "Selecione…" }),
        isel("setor_detectado", "Setor onde foi detectada", [...SETORES(), "Inspeção final", "Expedição", "Cliente"], r.setor_detectado, { ...o, ph: "" }), isel("turno", "Turno", TURNOS, r.turno, { ...o, ph: "" })) +
      row("c4 keep2", isel("emitente", "Emitente", pessoas(), r.emitente, { dis: true }), isel("status", "Etapa", RNC_STATUS, r.status, { dis: true }),
        isel("origem", "Classificação / origem", ORIGENS, r.origem, { ...o, ph: "" }), inp("cliente", "Cliente / Fornecedor", CLI_ORIG.includes(r.origem) ? r.cliente : "", { ...o, dis: o.dis || !CLI_ORIG.includes(r.origem), ph: CLI_ORIG.includes(r.origem) ? "" : "Selecione Fornecedor ou Cliente" })) +
      row("c2", inp("op", "Ordem de produção (OP)", r.op, o), isel("tipo_nc", "Tipo de não conformidade", defeitos, r.tipo_nc, { ...o, ph: defeitos.length ? "Selecione…" : "Selecione o setor" })) +
      row("c4 keep2", inum("qtd_nc", "Qtd NC", r.qtd_nc, o), inum("qtd_lote", "Qtd do lote", r.qtd_lote, o), isel("gravidade", "Gravidade", GRAVIDADE, r.gravidade, { ...o, ph: "" }),
        isel("reincidente", "Reincidente?", ["Não", "Sim"], r.reincidente, o)), "Identificação") +
      card(itxt("descricao", "Descrição do problema (o que, onde, quando, quanto) *", r.descricao, o), "Descrição");
  } else if (sec.startsWith("2")) {
    if (semFicha) h += alerta("info", "⏳ Carregando ficha técnica… os produtos aparecem em instantes.");
    const prods = Object.values(FT.produtos).map((p) => [p.codigo, `${p.codigo} — ${p.nome}`]);
    let ft = "";
    if (prods.length) {
      const pr = FT.produtos[r.produto];
      ft = row("w31", icombo("produto", "Produto / Máquina (ficha técnica)", prods, r.produto, o),
          pr ? `<div class="field"><label>&nbsp;</label>${ichk("produto_inteiro", "Máquina inteira retrabalhada/refugada", r.produto_inteiro, o)}</div>` : "");
      if (pr) {
        ft += `<div class="caption">Valor unitário do produto: ${brl(pr.valor)}${pr.familia ? " · " + esc(pr.familia) : ""}</div>`;
        if (r.produto_inteiro) ft += `<div class="caption">Custo = ${brl(pr.valor)} × ${num(r.qtd_nc)} peça(s) NC</div>`;
        else {
          const pts = FT.partes[r.produto] || {};
          const sel = r.pecas_subst || [];
          const opts = Object.entries(pts).filter(([k]) => !sel.some((s) => s.chave === k)).map(([k, p]) => [k, `${p.codigo} — ${p.nome} (${brl(p.valor_unit)}/${p.un || "un"})`]);
          ft += icombo("_addparte", "Partes substituídas (busque por nome, código ou desenho)", opts, "", { ...o, help: "Passe o cursor no ⓘ de cada parte para ver as características." }) +
            sel.map((p, i) => { const d = pts[p.chave] || p;
              const info = [`Tipo: ${d.tipo || ""}`, d.desenho ? `Desenho: ${d.desenho}` : "", d.grupo ? `Grupo: ${d.grupo}` : "", d.familia ? `Família: ${d.familia}` : "", `Unidade: ${d.un || "un"}`, d.qtd_no_produto ? `Qtd. por produto: ${d.qtd_no_produto}` : "", `Valor unitário: ${brl(p.valor_unit)}`].filter(Boolean).join("\n");
              return `<div class="parte"><div><b>${esc(p.codigo)}</b> — ${esc(p.nome)}${tip(info)}</div>
                <input type="number" min="0" step="any" inputmode="decimal" value="${num(p.qtd)}" data-pq="${i}" ${dis ? "disabled" : ""} aria-label="Quantidade">
                <div class="num">${brl(num(p.qtd) * num(p.valor_unit))} ${dis ? "" : `<button class="btn sm danger" data-prm="${i}" title="Remover">✕</button>`}</div></div>`; }).join("") +
            (sel.length ? `<div class="caption">Total das partes: ${brl(sel.reduce((s, p) => s + num(p.qtd) * num(p.valor_unit), 0))}</div>` : "");
        }
      }
    }
    h += card(ft + row("c4 keep2", inum("horas_homem", "Horas de retrabalho (pessoas)", r.horas_homem, o),
        inum("custo_hora", "Valor hora-homem (R$/h)", r.custo_hora, { dis: true, help: "Automático: hora média do setor de origem (cadastro admin)" }),
        inum("custo_material", "Material e refugo (R$)", r.custo_material, { dis: true, help: "Automático: soma das partes/produto selecionados na ficha técnica" })) +
      `<div class="field"><label>Máquinas usadas no retrabalho</label>` +
      (r.maquinas.length ? `<div class="tbl-wrap"><table class="edit"><thead><tr><th>Máquina</th><th>Horas</th><th>R$/h</th><th>Custo</th><th></th></tr></thead><tbody>` +
        r.maquinas.map((m, i) => { const c = MAQ.find((x) => x.codigo === m.codigo);
          return `<tr><td>${esc(c ? c.codigo : m.codigo)}</td><td><input type="number" step="any" min="0" inputmode="decimal" data-mh="${i}" value="${esc(m.horas ?? "")}" ${dis ? "disabled" : ""}></td>
            <td>${brl(m.valor_hora)}</td><td>${brl(num(m.horas) * num(m.valor_hora))}</td><td>${dis ? "" : `<button class="btn sm danger" data-mrm="${i}">✕</button>`}</td></tr>`; }).join("") +
        `</tbody></table></div>` : `<div class="caption">Nenhuma máquina adicionada.</div>`) +
      (!dis && MAQ.length ? isel("_addmaq", "Adicionar máquina", MAQ.filter((m) => !r.maquinas.some((x) => x.codigo === m.codigo)).map((m) => [m.codigo, m.codigo]), "", { ph: "Selecione para adicionar…" }) : "") +
      (!MAQ.length ? `<div class="caption">${r.setor_origem ? "Nenhuma máquina cadastrada para o setor " + esc(r.setor_origem) + "." : "Selecione o setor de origem para ver as máquinas."}</div>` : "") + `</div>` +
      row("c4 keep2",
        `<div class="metric"><div class="l">Custo total da ocorrência</div><div class="v" id="e-custo">${brl(custo(r))}</div></div>`), "Custo da não conformidade");
  } else if (sec.startsWith("3")) {
    const A = S.acoes.filter((a) => a.rnc_id === r.id);
    const tarefas = A.length ? tabela([["id", "Ação"], ["tipo", "Tipo"], ["o_que", "O que", "wrap"], ["quem", "Quem"], ["prazo", "Prazo"], ["status", "Status"]],
      A.map((a) => ({ ...a, quem: nome(a.quem), prazo: fdate(a.quando) + (atrasada(a) ? " ⚠️ Atrasada" : "") })), { click: true, h: 320 }) : `<div class="caption">Nenhuma ação vinculada.</div>`;
    h += card(row("c2", isel("responsavel", "Responsável pela tratativa *", pessoas(), r.responsavel, { ...o, ph: "Selecione…" }), isel("status", "Etapa PDCA", PDCA, PDCA.includes(r.status) ? r.status : "", { dis: !PDCA.includes(r.status) || dis, ph: r.status }))
        + row("w21", itxt("contencao", "Ação de contenção imediata", r.contencao, o), isel("disposicao", "Disposição do material", DISPOSICAO, r.disposicao, { ...o, ph: "" })) +
        row("c1", isel("resp_contencao", "Responsável pela contenção", pessoas(), r.resp_contencao, { ...o, ph: "" })), "P · Planejar — responsável e contenção") +
      exp("Análise de causa — Ishikawa e 5 Porquês", `<div class="row c3">${M6.map(([k, t]) => itxt("ishikawa." + k, t, (r.ishikawa || {})[k], o)).join("")}</div>` +
        [0, 1, 2, 3, 4].map((i) => inp("porques." + i, `${i + 1}º Por quê?`, arr(r.porques)[i], o)).join("") + itxt("causa_raiz", "Causa raiz identificada", r.causa_raiz, o), r.status === PDCA[0]) +
      exp("D · Plano de ações — execução", tarefas + (r.id ? `<div class="btnrow" style="margin-top:.8rem"><button class="btn" id="e-nacao">+ Adicionar ação</button></div>` : `<div class="caption">Salve a RNC para adicionar ações.</div>`), r.status === PDCA[1]) +
      exp("C · Verificação de eficácia / A · Padronização", row("c4 keep2", isel("eficaz", "Ações foram eficazes?", ["Pendente", "Sim", "Não"], r.eficaz, o), idate("data_verificacao", "Data da verificação", r.data_verificacao, o),
        isel("resp_verificacao", "Responsável verificação", pessoas(), r.resp_verificacao, { ...o, ph: "" }), isel("necessita_nova_rnc", "Necessita nova RNC?", ["Não", "Sim"], r.necessita_nova_rnc || "Não", o)) +
        itxt("obs_eficacia", "Evidências / observações da verificação", r.obs_eficacia, o), PDCA.slice(2).includes(r.status));
  } else {
    const F = E.fotos || [];
    h += card((r.id ? "" : `<div class="caption">Os anexos serão enviados ao salvar o registro.</div>`) +
      `<div class="fotos">${F.map((f) => `<figure><img src="${f.conteudo}" alt="${esc(f.nome)}" data-img><figcaption>${esc(f.nome)}</figcaption>${dis ? "" : `<button class="btn sm danger" data-fdel="${f.id}">Remover</button>`}</figure>`).join("")}
       ${(E.novas || []).map((f) => `<figure><img src="${URL.createObjectURL(f)}" alt=""><figcaption>(nova) ${esc(f.name)}</figcaption></figure>`).join("")}</div>` +
      (dis ? "" : `<div class="field" style="margin-top:1rem"><label>Adicionar fotos</label><input type="file" id="e-fotos" accept="image/*" multiple></div>`), "Fotos e evidências") +
      exp("Histórico", (r.historico || []).slice().reverse().map((x) => `<div class="caption">${esc((x.em || "").replace("T", " "))} · ${esc(nome(x.por))} · ${esc(x.acao === "status" ? `${x.de} → ${x.para}` : x.acao)}</div>`).join("") ||
        `<div class="caption">Criado por ${esc(nome(r.criado_por))}</div>`);
  }
  // botões
  const podeAbrir = !novo && r.status === APONTADO;
  h += `<hr><div class="btnrow">${dis ? "" : `<button class="btn primary" id="e-salvar">💾 Salvar</button>`}
    ${r.status === APONTADO && !dis ? `<button class="btn" id="e-trat" title="Transforma o apontamento em tratativa (Planejar)">🚩 Abrir tratativa (PDCA)</button>` : ""}
    ${admin() && trat && !fin ? `<button class="btn" id="e-fin">✅ Finalizar</button><button class="btn" id="e-canc">Cancelar RNC</button>` : ""}
    ${admin() && fin ? `<button class="btn" id="e-reab">↩ Reabrir</button>` : ""}
    ${!novo && admin() ? `<button class="btn danger" id="e-del">🗑 Excluir</button>` : ""}</div><div id="e-msg"></div>`;
  el.innerHTML = h;
  void podeAbrir;

  // ligações
  const set = (k, v) => { const p = k.split("."); if (p.length === 1) r[k] = v; else if (p[0] === "porques") { r.porques = arr(r.porques); while (r.porques.length < 5) r.porques.push(""); r.porques[+p[1]] = v; } else (r[p[0]] ||= {})[p[1]] = v; };
  const RERENDER = ["origem", "setor_origem", "maquina", "produto_inteiro", "qtd_nc"];
  $$("[data-k]", el).forEach((i) => {
    const ev = i.tagName === "SELECT" || i.type === "checkbox" ? "change" : "input";
    i.addEventListener(ev, () => {
      if (i.dataset.k === "_addmaq") { if (i.value) r.maquinas.push({ codigo: i.value, horas: 0 }); return editorRnc(el); }
      set(i.dataset.k, i.type === "checkbox" ? i.checked : i.type === "number" ? num(i.value) : i.value);
      if (i.dataset.k === "setor_origem") { r.tipo_nc = ""; r.maquinas = []; }
      if (i.dataset.k === "origem" && !CLI_ORIG.includes(r.origem)) r.cliente = "";
      if (RERENDER.includes(i.dataset.k) && ev === "change") editorRnc(el);
      else if ($("#e-custo")) $("#e-custo").textContent = brl(custo(r));
    });
    if (i.dataset.k === "qtd_nc") i.addEventListener("change", () => editorRnc(el));
  });
  $$("[data-combo]", el).forEach((i) => i.addEventListener("change", () => {
    const v = comboValor(i), k = i.dataset.combo;
    if (k === "_addparte") { const d = FT.partes[r.produto]?.[v]; if (d) (r.pecas_subst ||= []).push({ chave: v, tipo: d.tipo, codigo: d.codigo, nome: d.nome, qtd: 1, valor_unit: d.valor_unit }); }
    else if (k === "produto") { if (v !== r.produto) { r.produto = v; r.pecas_subst = []; r.produto_inteiro = false; } }
    else if (k === "cod_peca") { r.cod_peca = v; const pc = (S.cfg.pecas || []).find((p) => p.codigo === v); if (pc && !r.desc_peca) r.desc_peca = pc.descricao; }
    else r[k] = v;
    editorRnc(el);
  }));
  $$("[data-mh]", el).forEach((i) => i.addEventListener("change", () => { r.maquinas[+i.dataset.mh].horas = num(i.value); editorRnc(el); }));
  $$("[data-mrm]", el).forEach((b) => (b.onclick = () => { r.maquinas.splice(+b.dataset.mrm, 1); editorRnc(el); }));
  $$("[data-pq]", el).forEach((i) => i.addEventListener("change", () => { r.pecas_subst[+i.dataset.pq].qtd = num(i.value); editorRnc(el); }));
  $$("[data-prm]", el).forEach((b) => (b.onclick = () => { r.pecas_subst.splice(+b.dataset.prm, 1); editorRnc(el); }));
  $$("[data-a]", el).forEach((b) => (b.onclick = () => { E.aba = +b.dataset.a; editorRnc(el); }));
  $$("[data-img]", el).forEach((i) => (i.onclick = () => verImagem(i.src)));
  $$("tr[data-i]", el).forEach((t) => (t.onclick = () => { const A = S.acoes.filter((a) => a.rnc_id === r.id); abrirAcao(A[+t.dataset.i].id, { tipo: "rnc", rec: r, volta: E.volta, fotos: E.fotos, aba: E.aba }); }));
  $("#e-volta").onclick = fechar;
  if ($("#e-nacao")) $("#e-nacao").onclick = () => novaAcao(r.id, { tipo: "rnc", rec: r, volta: E.volta, fotos: E.fotos, aba: E.aba });
  if ($("#e-fotos")) $("#e-fotos").onchange = (e) => { E.novas = [...(E.novas || []), ...e.target.files]; editorRnc(el); };
  $$("[data-fdel]", el).forEach((b) => (b.onclick = async () => { if (!(await confirmar("Remover esta foto?", "Remover"))) return;
    await db.excluirFoto(+b.dataset.fdel); E.fotos = await db.listarFotos(r.id); editorRnc(el); }));
  const msg = (t, m) => ($("#e-msg").innerHTML = alerta(t, esc(m)));
  const salvar = async (novoStatus) => {
    const d = JSON.parse(JSON.stringify(r));
    if (novoStatus) d.status = novoStatus;
    if (!d.setor_origem || !String(d.descricao || "").trim()) return msg("error", "Informe o setor de origem e a descrição.");
    if (!admin() && !setUser().includes(d.setor_origem)) return msg("error", "Você não tem autorização para apontar neste setor.");
    if (d.status === "Finalizada" && d.eficaz !== "Sim") return msg("error", "Para finalizar, a eficácia deve estar verificada como 'Sim'.");
    if (d.status === "Finalizada" && S.acoes.some((a) => a.rnc_id === d.id && !["Concluída", "Cancelada"].includes(a.status))) return msg("error", "Existem tarefas abertas nesta tratativa.");
    if (FINAIS.includes(d.status) && d.status !== r.status && !admin()) return msg("error", "Somente o gestor pode finalizar ou cancelar.");
    try {
      const s = await db.salvar("rnc", d, S.user.login);
      const erros = [];
      for (const f of E.novas || []) { try { await db.salvarFoto(s.id, f); } catch (e) { erros.push(`${f.name}: ${e.message}`); } }
      E.novas = []; E.rec = s; E.fotos = await db.listarFotos(s.id); S.draft = null;
      if (erros.length) toast("Algumas fotos não foram gravadas: " + erros.join("; "));
      toast(`${s.id} salvo${E.fotos.length ? ` (${E.fotos.length} foto(s))` : ""}.`);
      await carregar(); editorRnc(el);
    } catch (e) { msg("error", e.message); }
  };
  if ($("#e-salvar")) $("#e-salvar").onclick = () => salvar();
  if ($("#e-trat")) $("#e-trat").onclick = () => salvar(PDCA[0]);
  if ($("#e-fin")) $("#e-fin").onclick = () => salvar("Finalizada");
  if ($("#e-canc")) $("#e-canc").onclick = async () => (await confirmar(`Cancelar a ${r.id}?`, "Cancelar RNC")) && salvar("Cancelada");
  if ($("#e-reab")) $("#e-reab").onclick = () => salvar(PDCA[0]);
  if ($("#e-del")) $("#e-del").onclick = async () => {
    if (!(await confirmar(`Excluir a ${r.id}? Ela vai para a lixeira.`))) return;
    try { await db.excluir("rnc", r.id, S.user.login); toast(`${r.id} excluída.`); fechar(); } catch (e) { msg("error", e.message); }
  };
}

// ---------------- Plano de ações ----------------
function paginaAcoes(el) {
  const f = (S.filtros.acoes ||= { setor: "", status: "", q: "", atr: false, minhas: false });
  el.innerHTML = heading("Plano de ações", "Veja o que precisa ser feito, por quem e até quando. Selecione uma linha para atualizar a tarefa.") +
    (S.draft?.tipo === "acao" ? alerta("warn", `Você tem uma ação em edição. <button class="btn sm" id="a-ret">Continuar</button> <button class="btn sm" id="a-desc">Descartar</button>`) : "") +
    `<div class="btnrow"><button class="btn primary" id="a-nova">+ Criar ação</button></div>` +
    card(row("c3", isel("setor", "Setor", setUser(), f.setor, { ph: "Todos os meus setores" }), isel("status", "Situação", ACAO_STATUS, f.status, { ph: "Todas as situações" }),
      inp("q", "Buscar ação", f.q, { ph: "Número, tarefa ou responsável" })) + `<div class="btnrow">${ichk("atr", "Somente atrasadas", f.atr)}${ichk("minhas", "Somente minhas", f.minhas)}</div>`) + `<div id="a-tab"></div>`;
  $("#a-nova").onclick = () => novaAcao("");
  if ($("#a-ret")) { $("#a-ret").onclick = retomar; $("#a-desc").onclick = () => { S.draft = null; paginaAcoes(el); }; }
  ligarFiltros($(".card", el), f, () => paginaAcoes(el));
  const setorDe = (a) => S.rnc.find((r) => r.id === a.rnc_id)?.setor_origem || a.onde;
  const q = f.q.trim().toLowerCase();
  const L = S.acoes.filter((a) => (!f.setor || setorDe(a) === f.setor) && (!f.status || a.status === f.status) && (!f.atr || atrasada(a)) && (!f.minhas || a.quem === S.user.login) &&
    (!q || [a.id, a.o_que, nome(a.quem), a.rnc_id].some((x) => String(x || "").toLowerCase().includes(q))))
    .sort((a, b) => atrasada(b) - atrasada(a) || String(a.quando || "9999").localeCompare(String(b.quando || "9999")));
  const rows = L.map((a) => ({ id: a.id, rnc: a.rnc_id || "—", tipo: a.tipo, o_que: a.o_que, quem: nome(a.quem), prazo: fdate(a.quando), status: a.status, atr: atrasada(a) ? "Sim" : "Não", fim: fdate(a.data_conclusao) }));
  const cols = [["id", "Nº"], ["rnc", "RNC"], ["tipo", "Tipo"], ["o_que", "O que", "wrap"], ["quem", "Quem"], ["prazo", "Prazo"], ["status", "Status"], ["atr", "Atrasada"], ["fim", "Concluída em"]];
  const box = $("#a-tab");
  if (!rows.length) return (box.innerHTML = alerta("info", "Nenhuma ação encontrada. Ajuste os filtros ou crie uma nova ação."));
  box.innerHTML = termometro(L) + `<div class="caption">${rows.length} ação(ões) · clique em uma linha para abrir · atualizado ${hora()}</div>` + tabela(cols, rows, { click: true }) +
    `<div class="btnrow" style="margin-top:.8rem"><button class="btn" id="a-csv">⬇ Exportar CSV</button></div>`;
  $$("tr[data-i]", box).forEach((t) => (t.onclick = () => abrirAcao(rows[+t.dataset.i].id)));
  $$("[data-tm]", box).forEach((t) => (t.onclick = () => abrirAcao(t.dataset.tm)));
  $("#a-csv").onclick = () => baixarCSV("acoes.csv", cols, rows);
}
function termometro(L) {
  const hj = new Date(hoje() + "T12:00:00");
  const ab = L.filter((a) => !["Concluída", "Cancelada"].includes(a.status) && a.quando)
    .map((a) => ({ a, d: Math.round((hj - new Date(a.quando + "T12:00:00")) / 864e5) }));
  if (!ab.length) return "";
  const F = [["No prazo", (d) => d < -7, "#2e7d32"], ["Vence em 7 dias", (d) => d >= -7 && d <= 0, "#f9a825"], ["1–15 dias parada", (d) => d > 0 && d <= 15, "#fb8c00"],
    ["16–30 dias parada", (d) => d > 15 && d <= 30, "#e53935"], ["+30 dias parada", (d) => d > 30, "#8e0000"]];
  const cols = F.map(([t, f, c]) => { const it = ab.filter((x) => f(x.d)).sort((x, y) => y.d - x.d);
    return `<div style="flex:1 1 150px;min-width:150px;border-top:6px solid ${c};background:${c}14;border-radius:.5rem;padding:.5rem">
      <b style="color:${c}">${t}</b> <span class="caption">(${it.length})</span>` +
      it.slice(0, 8).map((x) => `<div data-tm="${esc(x.a.id)}" style="cursor:pointer;margin-top:.35rem;padding:.35rem .5rem;background:#fff;border-left:4px solid ${c};border-radius:.35rem;font-size:.8rem">
        <b>${esc(x.a.id)}</b> · ${x.d > 0 ? x.d + " d atraso" : -x.d + " d restantes"}<br>${esc(String(x.a.o_que || "").slice(0, 50))}<br><span class="caption">${esc(nome(x.a.quem))}</span></div>`).join("") +
      (it.length > 8 ? `<div class="caption">+${it.length - 8}…</div>` : "") + `</div>`; }).join("");
  return card(`<div class="ttl">🌡️ Termômetro de tarefas abertas (pelo prazo previsto)</div><div style="display:flex;gap:.6rem;overflow-x:auto">${cols}</div>`);
}
function novaAcao(rncId, pai) {
  const rn = S.rnc.find((r) => r.id === rncId);
  S.pagina = pai ? S.pagina : MENU[3];
  navegar(S.pagina, { tipo: "acao", rec: { status: "Pendente", tipo: "Corretiva", rnc_id: rncId || "", onde: rn?.setor_origem || "" }, volta: S.pagina, pai });
}
async function abrirAcao(id, pai) {
  const a = await db.obter("acoes", id);
  if (!a) return toast("Ação não encontrada.");
  navegar(pai ? S.pagina : MENU[3], { tipo: "acao", rec: a, volta: S.pagina, pai });
}
function editorAcao(el) {
  const E = S.edit, a = E.rec;
  const rncs = S.rnc.filter((r) => r.status !== APONTADO || r.id === a.rnc_id);
  el.innerHTML = `<div class="btnrow"><button class="btn" id="c-volta">← Voltar</button></div>` +
    heading(a.id ? `Ação ${a.id}` : "Nova ação", "Defina a tarefa, o responsável e o prazo. Os campos com * são obrigatórios.") +
    card(row("w21", isel("rnc_id", "RNC vinculada", rncs.map((r) => [r.id, rncLbl(r)]), a.rnc_id, { ph: "(ação avulsa)" }), isel("tipo", "Tipo de ação", TIPO_ACAO, a.tipo)) +
      row("c2", itxt("o_que", "O que será feito? *", a.o_que), itxt("por_que", "Por que esta ação é necessária?", a.por_que)) +
      row("c4 keep2", isel("onde", "Setor de execução", a.rnc_id ? SETORES() : setUser(), a.onde, { ph: "" }), isel("quem", "Responsável *", pessoas(), a.quem, { ph: "Selecione…" }),
        idate("quando", "Prazo de entrega *", a.quando), inum("quanto", "Custo previsto (R$)", a.quanto)) + itxt("como", "Como será executada?", a.como), "Planejamento da ação") +
    exp("Conclusão e evidência da execução", row("c3", isel("status", "Situação", ACAO_STATUS, a.status), idate("data_conclusao", "Data de conclusão", a.data_conclusao),
      inp("evidencia", "Evidência da execução", a.evidencia)), a.status === "Concluída") +
    (a.historico ? exp("Histórico", a.historico.slice().reverse().map((x) => `<div class="caption">${esc((x.em || "").replace("T", " "))} · ${esc(nome(x.por))} · ${esc(x.acao === "status" ? `${x.de} → ${x.para}` : x.acao)}</div>`).join("")) : "") +
    `<hr><div class="btnrow"><button class="btn primary" id="c-salvar">💾 Salvar</button>${a.id && admin() ? `<button class="btn danger" id="c-del">🗑 Excluir</button>` : ""}</div><div id="c-msg"></div>`;
  $$("[data-k]", el).forEach((i) => i.addEventListener(i.tagName === "SELECT" ? "change" : "input", () => {
    a[i.dataset.k] = i.type === "number" ? num(i.value) : i.value;
    if (i.dataset.k === "rnc_id") { a.onde = S.rnc.find((r) => r.id === a.rnc_id)?.setor_origem || a.onde; editorAcao(el); }
    if (i.dataset.k === "status" && a.status === "Concluída" && !a.data_conclusao) { a.data_conclusao = hoje(); editorAcao(el); }
  }));
  const voltar = () => { if (E.pai) { S.edit = E.pai; carregar().then(render); } else fechar(); };
  $("#c-volta").onclick = voltar;
  const msg = (m) => ($("#c-msg").innerHTML = alerta("error", esc(m)));
  $("#c-salvar").onclick = async () => {
    if (!String(a.o_que || "").trim() || !a.quem || !a.quando) return msg("Preencha O que, Quem e Prazo.");
    if (!a.rnc_id && !admin() && !setUser().includes(a.onde)) return msg("Informe um setor de execução autorizado.");
    try { E.rec = await db.salvar("acoes", a, S.user.login); toast(`Ação ${E.rec.id} salva.`); S.draft = null; await carregar(); voltar(); }
    catch (e) { msg(e.message); }
  };
  if ($("#c-del")) $("#c-del").onclick = async () => { if (await confirmar(`Excluir a ação ${a.id}?`)) { await db.excluir("acoes", a.id, S.user.login); toast("Ação excluída."); voltar(); } };
}

// ---------------- Kanban PDCA ----------------
function paginaKanban(el) {
  const f = (S.filtros.kanban ||= { setor: "", fin: false });
  const etapas = f.fin ? [...PDCA, "Finalizada"] : PDCA;
  el.innerHTML = heading("Tratativas PDCA", "Acompanhe cada problema do planejamento à verificação. Abra um cartão para avançar a etapa.") +
    card(row("w31", isel("setor", "Setor", setUser(), f.setor, { ph: "Todos os meus setores" }), `<div class="field"><label>&nbsp;</label>${ichk("fin", "Incluir finalizadas", f.fin)}</div>`)) +
    `<div class="kanban" style="--c:${etapas.length}">${etapas.map((et) => {
      const cards = S.rnc.filter((r) => r.status === et && (!f.setor || r.setor_origem === f.setor)).sort((a, b) => String(a.data).localeCompare(String(b.data)));
      return `<div class="kcol" data-et="${esc(et)}"><h4>${esc(et)}</h4><span class="caption">${cards.length} cartão(ões)</span>` + (cards.length ? cards.map((r) => {
        const A = S.acoes.filter((a) => a.rnc_id === r.id), atr = A.filter(atrasada).length;
        return `<div class="kcard" data-drag="${esc(r.id)}"><b>${esc(r.id)}</b> · ${esc(r.setor_origem || "")}<br>${esc(r.tipo_nc || (r.descricao || "").slice(0, 60))}
          <div class="caption">${r.gravidade ? "Gravidade: " + esc(r.gravidade) + " · " : ""}👤 ${esc(nome(r.responsavel) || "—")}<br>
          ✅ ${A.filter((a) => a.status === "Concluída").length}/${A.length} tarefas${atr ? ` · ⚠️ ${atr} atrasada(s)` : ""}</div>
          <button class="btn sm block" data-card="${esc(r.id)}">Abrir</button></div>`; }).join("") : `<div class="caption" style="margin-top:.75rem">Nenhuma tratativa nesta etapa.</div>`) + `</div>`;
    }).join("")}</div><div class="caption">Atualizado às ${hora()}</div>`;
  ligarFiltros($(".card", el), f, () => paginaKanban(el));
  $$("[data-card]", el).forEach((b) => (b.onclick = async () => { b.disabled = true; const t = b.textContent; b.textContent = "Abrindo…";
    try { await cartao(b.dataset.card); } catch (e) { toast("Erro ao abrir: " + e.message, "⚠️"); } finally { b.disabled = false; b.textContent = t; } }));
  arrastar(el, () => paginaKanban(el));
}
// arrastar e soltar (mouse: arraste direto; celular: segure ~0,3s e arraste)
function arrastar(el, render) {
  $$("[data-drag]", el).forEach((c) => {
    c.style.touchAction = "pan-y";
    c.addEventListener("touchmove", (e) => { if (c.dataset.arr) e.preventDefault(); }, { passive: false });
    c.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.button > 0) return;
      const x0 = e.clientX, y0 = e.clientY, touch = e.pointerType !== "mouse";
      let ghost = null, alvo = null, timer = null, pronto = !touch;
      if (touch) timer = setTimeout(() => { pronto = true; c.dataset.arr = "1"; navigator.vibrate?.(30); c.style.outline = "2px solid var(--brand)"; }, 300);
      const colDe = (x, y) => document.elementsFromPoint(x, y).find((n) => n.matches?.(".kcol"));
      const move = (ev) => {
        if (!pronto) { if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > 8) fim(); return; }
        if (!ghost) {
          if (Math.hypot(ev.clientX - x0, ev.clientY - y0) < 6) return;
          const b = c.getBoundingClientRect();
          ghost = c.cloneNode(true); Object.assign(ghost.style, { position: "fixed", width: b.width + "px", pointerEvents: "none", zIndex: 999, opacity: ".9", transform: "rotate(2deg)", boxShadow: "0 8px 24px rgba(0,0,0,.25)" });
          document.body.append(ghost); c.style.opacity = ".35"; try { c.setPointerCapture(ev.pointerId); } catch {}
        }
        ev.preventDefault();
        ghost.style.left = ev.clientX - 20 + "px"; ghost.style.top = ev.clientY - 20 + "px";
        const k = colDe(ev.clientX, ev.clientY);
        if (k !== alvo) { alvo?.classList.remove("drop"); alvo = k; alvo?.classList.add("drop"); }
        const kb = c.closest(".kanban"), rb = kb.getBoundingClientRect();
        if (ev.clientX > rb.right - 40) kb.scrollLeft += 12; else if (ev.clientX < rb.left + 40) kb.scrollLeft -= 12;
      };
      const fim = async () => {
        clearTimeout(timer); delete c.dataset.arr; c.style.outline = ""; c.style.opacity = "";
        removeEventListener("pointermove", move); removeEventListener("pointerup", fim); removeEventListener("pointercancel", fim);
        if (!ghost) return; ghost.remove(); alvo?.classList.remove("drop");
        const novo = alvo?.dataset.et, r = S.rnc.find((x) => x.id === c.dataset.drag);
        if (!r || !novo || novo === r.status) return;
        if (novo === "Finalizada" && !admin()) return toast("Somente o administrador finaliza.");
        if (FINAIS.includes(r.status) && !admin()) return toast("Somente o administrador reabre.");
        if (await mover(r, novo)) render();
      };
      addEventListener("pointermove", move, { passive: false }); addEventListener("pointerup", fim); addEventListener("pointercancel", fim);
    });
  });
}
async function mover(r, novo) {
  if (novo === "Finalizada") {
    if (r.eficaz !== "Sim") return toast("Para finalizar, a eficácia deve estar verificada como 'Sim' (em Editar).");
    if (S.acoes.some((a) => a.rnc_id === r.id && !["Concluída", "Cancelada"].includes(a.status))) return toast("Existem tarefas abertas nesta tratativa.");
  }
  const reg = await registroEtapa(r, novo); if (!reg) return false;
  try {
    const ev = [...arr(r.evolucao), { de: r.status || "", para: novo, em: new Date().toISOString().slice(0, 19), por: S.user.login, texto: reg.texto, fotos: reg.fotos.length }];
    await db.salvar("rnc", { ...r, status: novo, evolucao: ev }, S.user.login);
    const erros = [];
    for (const f of reg.fotos) { try { await db.salvarFoto(r.id, new File([f], `Etapa ${novo} - ${f.name}`, { type: f.type })); } catch (e) { erros.push(f.name); } }
    toast(`${r.id} → ${novo}` + (erros.length ? ` (fotos não gravadas: ${erros.join(", ")})` : "")); await carregar(); return true;
  } catch (e) { toast(e.message); return false; }
}
// pede o que foi feito (obrigatório) e fotos opcionais antes de mudar de etapa
function registroEtapa(r, novo) {
  return new Promise((ok) => {
    let feito = false;
    const m = modal(`<h3>${esc(r.id)}: ${esc(r.status || "")} → ${esc(novo)}</h3>
      <div class="field"><label for="et-txt">O que foi feito para mudar de etapa? *</label><textarea id="et-txt" rows="4" placeholder="Descreva as ações realizadas, resultados, evidências…"></textarea></div>
      <div class="field"><label for="et-fot">Anexar fotos (opcional)</label><input type="file" id="et-fot" accept="image/*" multiple></div>
      <div id="et-msg"></div>
      <div class="btnrow"><button class="btn primary" id="et-ok">Confirmar mudança</button><button class="btn" id="et-no">Cancelar</button></div>`,
      { sm: true, onClose: () => { if (!feito) ok(null); } });
    $("#et-no", m).onclick = () => m.fechar();
    $("#et-ok", m).onclick = () => {
      const texto = $("#et-txt", m).value.trim();
      if (!texto) { $("#et-msg", m).innerHTML = alerta("error", "Descreva o que foi feito."); return; }
      feito = true; const fotos = [...($("#et-fot", m).files || [])]; m.fechar(); ok({ texto, fotos });
    };
    setTimeout(() => $("#et-txt", m).focus(), 50);
  });
}
async function cartao(id) {
  const r = S.rnc.find((x) => x.id === id); if (!r) return;
  const A = S.acoes.filter((a) => a.rnc_id === id); let F = []; try { F = await db.listarFotos(id); } catch (e) { console.warn(e); }
  const kv = [["Data", fdate(r.data)], ["Setor de origem", r.setor_origem], ["Detectado em", r.setor_detectado], ["Turno", r.turno], ["Emitente", nome(r.emitente)], ["Responsável", nome(r.responsavel)],
    ["Classificação", r.origem], ["Cliente/Fornecedor", r.cliente], ["Peça", `${r.cod_peca || ""} ${r.desc_peca || ""}`], ["OP", r.op], ["Tipo de NC", r.tipo_nc], ["Qtd NC / lote", `${r.qtd_nc || 0} / ${r.qtd_lote || 0}`],
    ["Gravidade", r.gravidade], ["Reincidente", r.reincidente], ["Custo total", brl(custo(r))], ["Disposição", r.disposicao]];
  const ish = M6.filter(([k]) => (r.ishikawa || {})[k]).map(([k, t]) => `<b>${t}:</b> ${esc(r.ishikawa[k])}`).join("<br>");
  const pq = arr(r.porques).filter(Boolean);
  const i = PDCA.indexOf(r.status);
  const m = modal(`<h3>${esc(r.id)} · ${esc(r.status)}</h3><div class="kv">${kv.map(([k, v]) => `<div><b>${k}</b>${esc(v || "—")}</div>`).join("")}</div>` +
    card(`<b>Descrição</b><p>${esc(r.descricao || "")}</p>${r.contencao ? `<b>Contenção</b><p>${esc(r.contencao)}</p>` : ""}${ish ? `<p><b>Ishikawa</b><br>${ish}</p>` : ""}
      ${pq.length ? `<p><b>5 Porquês:</b> ${pq.map(esc).join(" → ")}</p>` : ""}${r.causa_raiz ? `<p><b>Causa raiz:</b> ${esc(r.causa_raiz)}</p>` : ""}
      <p><b>Eficácia:</b> ${esc(r.eficaz || "Pendente")}${r.data_verificacao ? ` (${fdate(r.data_verificacao)})` : ""}</p>`) +
    `<h4>Tarefas (${A.filter((a) => a.status === "Concluída").length}/${A.length} concluídas)</h4>` +
    (A.length ? tabela([["id", "Nº"], ["o_que", "O que", "wrap"], ["quem", "Responsável"], ["prazo", "Prazo"], ["status", "Status"], ["ev", "Evidência", "wrap"]],
      A.map((a) => ({ ...a, quem: nome(a.quem), prazo: fdate(a.quando) + (atrasada(a) ? " ⚠️" : ""), ev: a.evidencia || "" })), { h: 260 }) : `<div class="caption">Nenhuma tarefa.</div>`) +
    (F.length ? `<h4 style="margin-top:1rem">Fotos</h4><div class="fotos">${F.map((f) => `<figure><img src="${f.conteudo}" data-img alt=""><figcaption>${esc(f.nome)}</figcaption></figure>`).join("")}</div>` : "") +
    (arr(r.evolucao).length ? `<h4 style="margin-top:1rem">Evolução das etapas</h4>` + arr(r.evolucao).slice().reverse().map((x) =>
      card(`<div class="caption">${esc((x.em || "").replace("T", " "))} · ${esc(nome(x.por))} · <b>${esc(x.de)} → ${esc(x.para)}</b>${x.fotos ? ` · 📷 ${x.fotos}` : ""}</div><p style="white-space:pre-wrap;margin:.3rem 0 0">${esc(x.texto)}</p>`)).join("") : "") +
    exp("Histórico", (r.historico || []).slice().reverse().map((x) => `<div class="caption">${esc((x.em || "").replace("T", " "))} · ${esc(nome(x.por))} · ${esc(x.acao === "status" ? `${x.de} → ${x.para}` : x.acao)}</div>`).join("")) +
    `<hr><div class="btnrow">${i > 0 ? `<button class="btn" data-m="${PDCA[i - 1]}">← ${PDCA[i - 1]}</button>` : ""}
      ${i >= 0 && i < 3 ? `<button class="btn primary" data-m="${PDCA[i + 1]}">${PDCA[i + 1]} →</button>` : ""}
      <button class="btn" id="k-ed">✏️ Editar</button><button class="btn" id="k-tar">+ Tarefa</button>
      ${admin() && i === 3 ? `<button class="btn primary" data-m="Finalizada">✅ Finalizar</button>` : ""}
      ${admin() && FINAIS.includes(r.status) ? `<button class="btn" data-m="${PDCA[0]}">↩ Reabrir</button>` : ""}</div>`);
  $$("[data-img]", m).forEach((x) => (x.onclick = () => verImagem(x.src)));
  $$("[data-m]", m).forEach((b) => (b.onclick = async () => { if (await mover(r, b.dataset.m)) { m.fechar(); render(); } }));
  $("#k-ed", m).onclick = () => { m.fechar(); abrirRnc(id, MENU[2]); };
  $("#k-tar", m).onclick = () => { m.fechar(); S.pagina = MENU[2]; navegar(MENU[2], { tipo: "acao", rec: { status: "Pendente", tipo: "Corretiva", rnc_id: id, onde: r.setor_origem }, volta: MENU[2] }); };
}

// ---------------- boot ----------------
(async () => {
  try { S.user = await db.sessaoAtual(); } catch { S.user = null; }
  if (S.user) iniciar().catch((e) => telaLogin(e.message)); else telaLogin();
})();
