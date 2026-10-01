// Painel do administrador (porta do admin.py)
import * as db from "./db.js?v=20261001-area11";
import { esc, $, $$, num, brl, toast, alerta, heading, card, row, inp, isel, ichk, tabela, confirmar } from "./ui.js?v=20261001-area11";

const ABAS = ["Setores e metas", "Defeitos por setor", "Usuários", "Máquinas", "Ficha técnica", "📐 Áreas", "🔒 Segurança", "🗑 Dados"];
let aba = 0;

export function paginaAdmin(el, ctx) {
  el.innerHTML = heading("Administração", "Cadastre setores, metas, defeitos, usuários, máquinas e peças.") +
    `<div class="tabs">${ABAS.map((t, i) => `<button data-t="${i}" class="${i === aba ? "on" : ""}">${t}</button>`).join("")}</div><div id="ad"></div>`;
  $$("[data-t]", el).forEach((b) => (b.onclick = () => { aba = +b.dataset.t; paginaAdmin(el, ctx); }));
  const box = $("#ad");
  const again = async () => { await ctx.recarregarCfg(); paginaAdmin(el, ctx); };
  [setores, defeitos, usuarios, (b, c, a) => cadastro(b, c, a, "maquinas"), fichaTec, areasCalc, seguranca, dados][aba](box, ctx, again);
}
const salvarCfg = async (k, v, again, msg = "Salvo.") => {
  try { await db.salvarConfig(k, v); toast(msg); await again(); } catch (e) { toast("Erro: " + e.message); }
};

// tabela editável simples (linhas dinâmicas)
function grade(cols, linhas) {
  return `<div class="tbl-wrap"><table class="edit"><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join("")}<th></th></tr></thead><tbody>
    ${linhas.map((l) => `<tr>${cols.map((c) => celula(c, l[c[0]])).join("")}
    <td><button class="btn sm danger" data-rm>✕</button></td></tr>`).join("")}</tbody></table></div>
    <div class="btnrow" style="margin-top:.6rem"><button class="btn" data-add>+ Linha</button><button class="btn primary" data-save>💾 Salvar</button></div>`;
}
function celula(c, v = "") {
  if (c[2] === "sel") { const op = [...c[3]]; if (v && !op.includes(v)) op.push(v);
    return `<td><select data-c="${c[0]}"><option value=""></option>${op.map((o) => `<option ${o === v ? "selected" : ""}>${esc(o)}</option>`).join("")}</select></td>`; }
  return `<td><input data-c="${c[0]}" ${c[2] === "num" ? 'type="number" step="any" min="0" inputmode="decimal"' : ""} value="${esc(v ?? "")}"></td>`;
}
function ligarGrade(box, cols, onSave) {
  const tb = $("tbody", box);
  $("[data-add]", box).onclick = () => { const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => celula(c)).join("") + `<td><button class="btn sm danger" data-rm>✕</button></td>`;
    tb.append(tr); };
  tb.addEventListener("click", (e) => { if (e.target.matches("[data-rm]")) e.target.closest("tr").remove(); });
  $("[data-save]", box).onclick = () => onSave($$("tr", tb).map((tr) => Object.fromEntries($$("input,select", tr).map((i) => [i.dataset.c, i.value.trim()]))));
}

function setores(box, { S }, again) {
  const sp = S.cfg.setor_params || {};
  const cols = [["setor", "Setor"], ["hora_media", "Hora média (R$/h)", "num"], ["meta_rnc_mes", "Meta RNCs/mês (máx.)", "num"], ["meta_custo_mes", "Meta custo NC/mês (R$ máx.)", "num"]];
  const linhas = Object.keys(S.cfg.setores || {}).map((s) => ({ setor: s, ...(sp[s] || {}) }));
  box.innerHTML = alerta("info", "A <b>hora média</b> é usada no cálculo do custo das RNCs do setor de origem. As <b>metas</b> são mensais e aparecem na Visão geral.") +
    card(grade(cols, linhas)) + card(row("c2", inp("chp", "Custo hora padrão (R$/h) — setores sem hora média", S.cfg.parametros.custo_hora_padrao, { type: "number" }),
      inp("ref", "Atualização automática das telas (segundos)", S.cfg.parametros.refresh_segundos, { type: "number" })) + `<button class="btn primary" id="par">💾 Salvar parâmetros</button>`, "Parâmetros");
  ligarGrade(box, cols, async (rows) => {
    rows = rows.filter((r) => r.setor);
    const nomes = rows.map((r) => r.setor);
    if (new Set(nomes).size !== nomes.length) return toast("Há setores repetidos.");
    const removidos = Object.keys(S.cfg.setores).filter((s) => !nomes.includes(s));
    if (removidos.length && !(await confirmar(`Remover os setores: ${removidos.join(", ")}?`, "Remover"))) return;
    const setoresNovos = Object.fromEntries(nomes.map((n) => [n, S.cfg.setores[n] || []]));
    const params = Object.fromEntries(rows.map((r) => [r.setor, { hora_media: r.hora_media === "" ? null : num(r.hora_media),
      meta_rnc_mes: r.meta_rnc_mes === "" ? null : num(r.meta_rnc_mes), meta_custo_mes: r.meta_custo_mes === "" ? null : num(r.meta_custo_mes) }]));
    await db.salvarConfig("setores", setoresNovos); await salvarCfg("setor_params", params, again, "Setores salvos.");
  });
  $("#par").onclick = () => salvarCfg("parametros", { ...S.cfg.parametros, custo_hora_padrao: num($("[data-k=chp]").value), refresh_segundos: Math.max(10, num($("[data-k=ref]").value)) }, again);
}

function defeitos(box, { S }, again) {
  const nomes = Object.keys(S.cfg.setores || {});
  if (!nomes.length) return (box.innerHTML = alerta("info", "Cadastre um setor primeiro."));
  const st = (defeitos.sel = nomes.includes(defeitos.sel) ? defeitos.sel : nomes[0]);
  const cols = [["d", "Defeito"]];
  box.innerHTML = card(isel("s", "Setor", nomes, st) + `<div style="height:.8rem"></div>` + grade(cols, (S.cfg.setores[st] || []).map((d) => ({ d }))), "Tipos de defeito por setor");
  $("[data-k=s]", box).onchange = (e) => { defeitos.sel = e.target.value; defeitos(box, { S }, again); };
  ligarGrade(box, cols, (rows) => {
    const lista = [...new Set(rows.map((r) => r.d).filter(Boolean))];
    salvarCfg("setores", { ...S.cfg.setores, [st]: lista }, again, `${lista.length} defeito(s) salvos para ${st}.`);
  });
}

function usuarios(box, { S }, again) {
  const setores = Object.keys(S.cfg.setores || {});
  const P = S.perfis;
  const opSet = (sel = []) => `<div class="field"><label>Setores autorizados para apontamento (admin acessa todos)</label><div class="chips" style="gap:.2rem .9rem">${setores.map((s) =>
    `<label class="check" style="min-height:0"><input type="checkbox" data-set value="${esc(s)}" ${sel.includes(s) ? "checked" : ""}> ${esc(s)}</label>`).join("")}</div></div>`;
  const u = P.find((p) => p.id === usuarios.sel) || P[0];
  box.innerHTML = card(tabela([["login", "Login"], ["nome", "Nome"], ["perfil", "Perfil"], ["ativo", "Ativo"], ["setores", "Setores", "wrap"]],
      P.map((p) => ({ ...p, ativo: p.ativo ? "Sim" : "Não", setores: p.perfil === "admin" ? "(todos)" : (p.setores || []).join(", ") })), { h: 320 }), "Usuários") +
    `<div class="card" id="nu"><div class="ttl">Novo usuário</div>` + alerta("info", "Somente o <b>administrador</b> cria usuários. Cada usuário acessa com login e senha.") +
      row("c2", inp("login", "Login (sem espaços)", ""), inp("nome", "Nome completo", "")) + row("c3", inp("s1", "Senha", "", { type: "password", help: db.DICA_SENHA }), inp("s2", "Repita a senha", "", { type: "password" }),
      isel("perfil", "Perfil", [["usuario", "Usuário"], ["admin", "Administrador"]], "usuario")) + opSet() + inp("senhaAdmin", "Sua senha de administrador", "", { type: "password" }) + `<button class="btn primary" id="criar">Criar usuário</button></div>` +
    (u ? `<div class="card" id="eu"><div class="ttl">Editar / excluir usuário</div>` + isel("u", "Usuário", P.map((p) => [p.id, `${p.nome} (${p.login})`]), u.id) +
      row("c3", inp("nome", "Nome", u.nome), isel("perfil", "Perfil", [["usuario", "Usuário"], ["admin", "Administrador"]], u.perfil), `<div class="field"><label>&nbsp;</label>${ichk("ativo", "Ativo", u.ativo)}</div>`) +
      opSet(u.setores || []) + inp("senhaAdmin", "Sua senha de administrador", "", { type: "password" }) + inp("senha", "Nova senha (deixe em branco para manter)", "", { type: "password", help: db.DICA_SENHA }) +
      `<div class="btnrow" style="margin-top:1rem"><button class="btn primary" id="salv">💾 Salvar alterações</button><button class="btn danger" id="exc">🗑 Excluir usuário</button></div></div>` : "");
  const v = (id, k) => $(`#${id} [data-k=${k}]`);
  const sets = (id) => $$(`#${id} [data-set]`).filter((c) => c.checked).map((c) => c.value);
  $("#criar").onclick = async () => {
    const login = v("nu", "login").value.trim().toLowerCase();
    if (!login || /\s/.test(login)) return toast("Informe um login sem espaços.");
    if (P.some((p) => p.login === login)) return toast(`O login '${login}' já existe.`);
    const erro = db.erroSenha(v("nu", "s1").value);
    if (erro) return toast(erro);
    if (v("nu", "s1").value !== v("nu", "s2").value) return toast("As senhas não conferem.");
    try { await db.criarUsuario({ login, nome: v("nu", "nome").value.trim() || login, senha: v("nu", "s1").value, perfil: v("nu", "perfil").value, setores: sets("nu"), senhaAdmin: v("nu", "senhaAdmin")?.value });
      toast(`Usuário ${login} criado.`); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
  if (!u) return;
  v("eu", "u").onchange = (e) => { usuarios.sel = e.target.value; usuarios(box, { S }, again); };
  const adminsAtivos = (exceto) => P.filter((p) => p.id !== exceto && p.perfil === "admin" && p.ativo).length;
  $("#salv").onclick = async () => {
    const perfil = v("eu", "perfil").value, ativo = v("eu", "ativo").checked, senha = v("eu", "senha").value;
    if ((perfil !== "admin" || !ativo) && !adminsAtivos(u.id)) return toast("É preciso manter ao menos um administrador ativo.");
    const erro = senha ? db.erroSenha(senha) : "";
    if (erro) return toast(erro);
    try {
      if (senha) await db.definirSenha(u.id, senha, v("eu", "senhaAdmin")?.value);
      await db.salvarPerfil(u.id, { nome: v("eu", "nome").value.trim() || u.login, perfil, ativo, setores: sets("eu") }, v("eu", "senhaAdmin").value);
      toast(`Usuário ${u.login} atualizado.`); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
  $("#exc").onclick = async () => {
    if (u.id === S.user.id) return toast("Você não pode excluir o próprio usuário.");
    if (u.perfil === "admin" && !adminsAtivos(u.id)) return toast("É preciso manter ao menos um administrador ativo.");
    if (!(await confirmar(`Excluir ${u.login}? O histórico dos registros é mantido.`))) return;
    try { await db.excluirUsuario(u.id, v("eu", "senhaAdmin").value); usuarios.sel = null; toast("Usuário excluído."); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
}

const CAD = {
  maquinas: { t: "Máquinas", key: "nome", cols: (S) => [["nome", "Nome da máquina"], ["setor", "Setor", "sel", Object.keys(S.cfg.setores || {})], ["custo_hora", "Custo hora (R$/h)", "num"]], numk: "custo_hora" },
  pecas: { t: "Peças", key: "codigo", cols: () => [["codigo", "Código"], ["descricao", "Descrição"], ["custo_unit", "Custo unitário (R$)", "num"]], numk: "custo_unit" },
};
function cadastro(box, { S }, again, chave) {
  const c = { ...CAD[chave], cols: CAD[chave].cols(S) }, K = c.key;
  const lista = (S.cfg[chave] || []).map((x) => (K === "nome" && !x.nome ? { ...x, nome: x.descricao || x.codigo } : x));
  box.innerHTML = alerta("info", `Usado para preencher automaticamente os custos da RNC. Importe uma planilha (.xlsx/.csv) com as colunas: ${c.cols.map((x) => `<b>${x[1]}</b>`).join(", ")} — ou edite a tabela.`) +
    card(`<div class="field"><label>Importar planilha</label><input type="file" id="imp" accept=".xlsx,.xls,.csv"></div>`) + card(grade(c.cols, lista), c.t);
  const normal = (rows) => {
    const vistos = new Set(), out = [];
    for (const r of rows) { const cod = String(r[K] ?? "").trim(); if (!cod || vistos.has(cod)) continue; vistos.add(cod);
      out.push(Object.fromEntries(c.cols.map(([k, , t]) => [k, t === "num" ? num(r[k]) : String(r[k] ?? "").trim()]))); }
    return out;
  };
  ligarGrade(box, c.cols, (rows) => { const l = normal(rows); salvarCfg(chave, l, again, `${l.length} ${c.t.toLowerCase()} salvas.`); });
  $("#imp").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      if (f.size > 10 * 1024 * 1024) throw new Error("A planilha deve ter até 10 MB.");
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellHTML: false });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const sem = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
      const mapa = {}; for (const [k, t] of c.cols) mapa[sem(t)] = k, mapa[sem(k)] = k;
      mapa.custo = c.numk; mapa.valor = c.numk; mapa.custohora = c.numk; if (K === "nome") { mapa.maquina = "nome"; mapa.descricao = "nome"; } else mapa.descricao = "descricao";
      const rows = raw.map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) { const kk = mapa[sem(k)] || Object.entries(mapa).find(([m]) => sem(k).startsWith(m))?.[1]; if (kk && o[kk] === undefined) o[kk] = v; } return o; });
      if (!rows.some((r) => r[K])) return toast(`Coluna '${c.cols[0][1]}' não encontrada na planilha.`);
      const atual = Object.fromEntries(lista.map((x) => [x[K], x]));
      for (const x of normal(rows)) atual[x[K]] = x;
      await salvarCfg(chave, Object.values(atual), again, `${rows.length} linha(s) importadas.`);
    } catch (err) { toast("Não foi possível ler a planilha: " + err.message); }
  };
}

// CSV com ';', aspas ("" escapa aspas) e decimal com vírgula ou ponto
function csvLer(txt) {
  const linhas = txt.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.replace(/;/g, "").trim());
  const campos = (l) => { const out = []; let cur = "", q = false;
    for (let i = 0; i < l.length; i++) { const ch = l[i];
      if (q) { if (ch === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch; }
      else if (ch === '"' && !cur.trim()) q = true; else if (ch === ";") { out.push(cur.trim()); cur = ""; } else cur += ch; }
    out.push(cur.trim()); return out; };
  const [cab, ...ls] = linhas; const H = campos(cab);
  return ls.map((l) => { const c = campos(l); return Object.fromEntries(H.map((h, i) => [h, c[i] ?? ""])); });
}
const nBR = (v) => { const x = parseFloat(String(v ?? "").replace(/\./g, (m, i, s) => (s.includes(",") ? "" : ".")).replace(",", ".")); return isFinite(x) ? x : 0; };

// Importa view_ficha_tecnica.txt (';', decimal '.', UTF-8 BOM) — mesma regra do ficha.py
// + áreas (area_tubos.csv) e pesos (peso.csv) para o custo de Pintura / Banho químico
function fichaTec(box, ctx) {
  const AM = ctx.S.cfg.area_materiais || {}, PS = ctx.S.cfg.pesos_maquinas || {};
  box.innerHTML = card(alerta("info", "<b>area_tubos.csv</b> e <b>peso.csv</b> são usados no custo de Pintura e Banho químico. Cada arquivo pode ser atualizado separadamente, quando precisar: a área das máquinas/peças é calculada no app com a ficha e a tabela de áreas mais recentes.") +
    row("c3", `<div class="field"><label>Áreas dos materiais (area_tubos.csv) · ${Object.keys(AM).length} cadastrados</label><input type="file" id="fa" accept=".csv,.txt"></div>`,
      `<div class="field"><label>Pesos das máquinas (peso.csv) · ${Object.keys(PS).length} cadastrados</label><input type="file" id="fp" accept=".csv,.txt"></div>`,
      `<div class="field"><label>Arquivo da ficha técnica</label><input type="file" id="ft" accept=".txt,.csv"></div>`) + `<div id="ftmsg"></div>`, "Ficha técnica, áreas e pesos");
  const msg = $("#ftmsg");
  const ler = (id, fn) => ($(id).onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    msg.innerHTML = alerta("info", "Processando…");
    const buf = await f.arrayBuffer();
    // Excel exporta CSV em Latin-1: tenta UTF-8 e cai para Windows-1252
    let txt; try { txt = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { txt = new TextDecoder("windows-1252").decode(buf); }
    try { msg.innerHTML = alerta("ok", await fn(txt)); await ctx.recarregarCfg(); } catch (err) { msg.innerHTML = alerta("error", esc(err.message)); }
  });
  ler("#fa", async (txt) => {
    // tubo: banho = área total/m, pintura = área externa/m; chapa: m²/kg nos dois processos
    const out = {};
    for (const r of csvLer(txt)) {
      const cod = String(r["Código"] || r.Codigo || "").trim(); if (!cod) continue;
      const chapa = /chapa/i.test(r["Classificação"] || r.Classificacao || "");
      const at = nBR(r["Area Total/metro"]), ae = nBR(r["Area Externa/metro"]), kg = nBR(r["m²/kg"]);
      const v = chapa ? { tipo: "chapa", b: kg || at, p: kg || at } : { tipo: "tubo", b: at, p: ae || at };
      if (v.b || v.p) out[cod] = v;
    }
    if (!Object.keys(out).length) throw new Error("Nenhuma área encontrada — confira o cabeçalho do arquivo.");
    await db.salvarConfig("area_materiais", out);
    return `${Object.keys(out).length} material(is) com área salvos. As áreas das máquinas já usam a nova tabela (não precisa reimportar a ficha).`;
  });
  ler("#fp", async (txt) => {
    const out = {};
    for (const r of csvLer(txt)) { const cod = String(r.Codigo || r["Código"] || "").trim(), kg = nBR(r["Peso Kg"]); if (cod && kg > 0) out[cod] = kg; }
    if (!Object.keys(out).length) throw new Error("Nenhum peso encontrado — confira o cabeçalho do arquivo.");
    await db.salvarConfig("pesos_maquinas", out);
    return `${Object.keys(out).length} peso(s) de máquina salvos.`;
  });
  ler("#ft", async (txt) => {
      // aceita "44.41", "44,41", "1.815,72", "1,815.72", "R$ 44,41" (export do Excel em pt-BR)
      const n = (v) => {
        let t = String(v ?? "").replace(/[^\d,.\-]/g, "");
        const c = t.lastIndexOf(","), d = t.lastIndexOf(".");
        if (c > d) t = t.replace(/\./g, "").replace(",", ".");
        else if (c >= 0) t = t.replace(/,/g, "");
        const x = parseFloat(t); return isFinite(x) ? x : 0;
      };
      const A = ctx.S.cfg.area_materiais || {};
      const G = {};
      for (const r of csvLer(txt)) (G[r.Prod_Cod_Barra] ||= []).push(r);
      let comArea = 0;
      const lista = Object.entries(G).filter(([k]) => k).map(([cod, g]) => {
        const pr = g.find((r) => r.Tipo_Pai === "Produto");
        const partes = {};
        // linhas de material p/ cálculo de área no app: [componente, material, Qtd_Material×Qtd_Consumo/1,06, Qtd_Componente, é linha do produto]
        const linhas = [];
        for (const r of g) {
          if (r.Codigo_Material) linhas.push([r.Codigo_Componente || "", r.Codigo_Material, Math.round(n(r.Quantidade_Material) * n(r.Quantidade_Consumo) / 1.06 * 1e6) / 1e6, n(r.Quantidade_Componente), r.Tipo_Pai === "Produto" ? 1 : 0]);
          if (r.Codigo_Componente && r.Tipo_Pai !== "Produto" && !partes["C" + r.Codigo_Componente])
            partes["C" + r.Codigo_Componente] = { tipo: "Componente", codigo: r.Codigo_Componente, nome: r.Nome_Componente, valor_unit: Math.round(n(r.Valor_Total_Componente) * 1e4) / 1e4,
              un: "un", desenho: r.Codigo_Desenho_Componente || "", grupo: r.Nome_Grupo || "", familia: r.Nome_Familia || "", qtd_no_produto: n(r.Quantidade_Componente) };
          if (r.Codigo_Material && !partes["M" + r.Codigo_Material]) {
            const q = n(r.Quantidade_Material);
            partes["M" + r.Codigo_Material] = { tipo: "Material", codigo: r.Codigo_Material, nome: r.Nome_Material, valor_unit: q ? Math.round((n(r.Valor_Total_Material) / q) * 1e4) / 1e4 : 0,
              un: r.Unidade_Material || "", desenho: r.Codigo_Desenho_Material || "", grupo: r.Nome_Grupo || "", familia: r.Nome_Familia || "", qtd_no_produto: q,
              usado_em: r.Nome_Componente || "" };
          }
        }
        partes._linhas = linhas;
        if (linhas.some((l) => A[l[1]])) comArea++;
        return { codigo: cod, nome: g[0].Prod_Referencia || cod, valor: pr ? n(pr.Valor_Total_Componente) : 0, familia: g[0].Nome_Familia || "", grupo: g[0].Nome_Grupo || "", partes };
      });
      if (lista.length && !lista.some((p) => p.valor > 0)) throw new Error("Nenhum valor de produto encontrado — confira as colunas Valor_Total_Componente / Valor_Total_Material do arquivo.");
      await db.importarFicha(lista); await db.carregarFicha(true); await db.salvarConfig("ficha_versao", Date.now());
      return `${lista.length} produto(s) importados (${comArea} com área calculada${Object.keys(A).length ? "" : " — envie area_tubos.csv para calcular"}). Todos os usuários conectados serão avisados para recarregar a página.`;
  });
}
void brl;

// ---------- Dados: excluir apontamentos incorretos / apagar tudo ----------
async function dados(box) {
  box.innerHTML = `<div class="caption">Carregando…</div>`;
  const [R, A] = await Promise.all([db.listar("rnc"), db.listar("acoes")]);
  const lin = R.sort((a, b) => String(b.data).localeCompare(String(a.data)));
  box.innerHTML = card(`<div class="ttl">Excluir apontamento incorreto</div>
    <div class="caption">Somente o administrador. O registro (com fotos e ações vinculadas) vai para a lixeira do banco.</div>
    ${inp("busca", "Buscar", "", { id2: "d-q", ph: "Número, setor ou descrição" })}
    <div class="tbl-wrap" style="max-height:420px"><table><thead><tr><th>Nº</th><th>Data</th><th>Setor</th><th>Status</th><th>Descrição</th><th></th></tr></thead><tbody id="d-tb">
    ${lin.map((r) => `<tr data-q="${esc(`${r.id} ${r.setor_origem || ""} ${r.descricao || ""}`.toLowerCase())}"><td>${esc(r.id)}</td><td>${esc(String(r.data || "").split("-").reverse().join("/"))}</td>
      <td>${esc(r.setor_origem || "")}</td><td>${esc(r.status || "")}</td><td class="wrap">${esc(String(r.descricao || "").slice(0, 80))}</td>
      <td><button class="btn sm danger" data-del="${esc(r.id)}">🗑 Excluir</button></td></tr>`).join("") || `<tr><td colspan="6">Nenhum registro.</td></tr>`}</tbody></table></div>`) +
    card(`<div class="ttl" style="color:var(--err)">⚠️ Apagar TODOS os dados de apontamentos e RNCs</div>
    <div class="alert warn">Apaga definitivamente <b>${R.length} RNC(s)</b>, <b>${A.length} ação(ões)</b> e as fotos. Cadastros (setores, usuários, máquinas, peças, ficha técnica) são mantidos. <b>Não há como desfazer.</b></div>` +
    inp("senhaAtual", "Sua senha de administrador", "", { type: "password", id2: "d-s" }) + row("c2", inp("mestra", "Chave mestra da criptografia", "", { type: "password", id2: "d-m" }) + inp("conf", 'Digite APAGAR para confirmar', "", { id2: "d-c" })) +
    `<div class="btnrow"><button class="btn danger" id="d-all">🗑 Apagar todos os dados</button></div><div id="d-msg"></div>`);
  $("#d-q").oninput = (e) => { const q = e.target.value.toLowerCase(); $$("#d-tb tr[data-q]").forEach((tr) => (tr.style.display = tr.dataset.q.includes(q) ? "" : "none")); };
  const vinc = (id) => A.filter((a) => a.rnc_id === id);
  $$("[data-del]", box).forEach((b) => (b.onclick = async () => {
    const id = b.dataset.del, n = vinc(id).length;
    if (!(await confirmar(`Excluir ${id}${n ? ` e ${n} ação(ões) vinculada(s)` : ""}? Vai para a lixeira.`))) return;
    try { const u = (await db.meuPerfil())?.login || "admin";
      await db.excluir("rnc", id, u); toast(`${id} excluída.`); dados(box);
    } catch (e) { toast("Erro: " + e.message, "⚠️"); }
  }));
  $("#d-all").onclick = async () => {
    const m = $("#d-m").value, c = $("#d-c").value.trim().toUpperCase(), msg = $("#d-msg");
    if (c !== "APAGAR") { msg.innerHTML = alerta("error", "Digite APAGAR no campo de confirmação."); return; }
    if (!m) { msg.innerHTML = alerta("error", "Informe a chave mestra."); return; }
    try { await db.verificarMestra(m); } catch (e) { msg.innerHTML = alerta("error", esc(e.message)); return; }
    if (!(await confirmar("Última confirmação: apagar TODOS os apontamentos, RNCs, ações e fotos?"))) return;
    try { msg.innerHTML = alerta("info", "Apagando…"); await db.apagarTodosDados(m, $("#d-s").value); toast("Todos os dados foram apagados."); dados(box); }
    catch (e) { msg.innerHTML = alerta("error", esc(e.message)); }
  };
}

// ---------- Segurança: chave mestra ----------
async function seguranca(box) {
  const ativa = db.criptoAtiva();
  const pendente = ativa ? await db.criptoPendente() : false;
  if (!ativa || pendente) {
    box.innerHTML = card(`<div class="alert info">${pendente ? "A migração ainda tem dados pendentes. Informe a mesma chave mestra para retomar." : "Custos e ficha técnica estão sem criptografia. Ao ativar, os dados sensíveis passam a ser cifrados."}
      Só quem tem login liberado consegue ler. <b>Guarde a chave mestra fora do sistema</b>: sem ela e sem nenhuma senha de administrador válida, os dados não podem ser recuperados.</div>` +
      row("c2", inp("m1", "Chave mestra (mín. 12 caracteres)", "", { type: "password", id2: "f-m1" }) + inp("m2", "Repita a chave mestra", "", { type: "password", id2: "f-m2" })) +
      inp("sa", "Sua senha de administrador", "", { type: "password", id2: "f-sa" }) +
      `<div class="btnrow"><button class="btn primary" id="ativar">🔒 Ativar criptografia</button></div><div id="prog" class="caption"></div>`);
    $("#ativar").onclick = async () => {
      const m1 = $("#f-m1").value, m2 = $("#f-m2").value;
      if (m1 !== m2) return toast("As chaves mestras não conferem.");
      if (!(await confirmar("Ativar a criptografia agora? Não feche a página até terminar."))) return;
      try { await db.ativarCriptografia(m1, $("#f-sa").value, (t) => ($("#prog").textContent = t)); toast("Criptografia ativada."); location.reload(); }
      catch (e) { toast("Erro: " + e.message); }
    };
    return;
  }
  const sem = await db.usuariosSemChave();
  box.innerHTML = card(`<div class="alert ok">🔒 Criptografia ativa. Migração dos campos sensíveis verificada. Descrições e fotos não são cifradas.</div>` +
    (sem.length ? `<div class="alert warn">Usuários ainda sem acesso aos dados (não conseguem entrar): <b>${sem.map((u) => esc(u.login)).join(", ")}</b>.
      Para liberar, vá em <b>Usuários → Editar</b> e defina uma nova senha para cada um.</div>` : `<div class="caption">Todos os usuários têm acesso liberado.</div>`)) +
    card(`<b>Recuperar acesso com a chave mestra</b><div class="caption">Use se a sua senha de admin foi redefinida e os custos pararam de aparecer.</div>` +
      row("c2", inp("rm", "Chave mestra", "", { type: "password", id2: "f-rm" }) + inp("rs", "Sua senha atual", "", { type: "password", id2: "f-rs" })) +
      `<div class="btnrow"><button class="btn" id="recup">Recuperar</button></div>`);
  $("#recup").onclick = async () => {
    try { await db.recuperarComMestra($("#f-rm").value, $("#f-rs").value); toast("Acesso recuperado."); location.reload(); }
    catch (e) { toast("Erro: " + e.message); }
  };
}

// ---------- 📐 Conferência do cálculo de área (Pintura / Banho) ----------
let areaProd = "";
async function areasCalc(box, ctx) {
  box.innerHTML = `<div class="loading">Carregando ficha técnica…</div>`;
  let F; try { F = await db.carregarFicha(); } catch (e) { box.innerHTML = alerta("error", esc(e.message)); return; }
  const A = ctx.S.cfg.area_materiais || {};
  const prods = Object.values(F.produtos).sort((a, b) => String(a.nome).localeCompare(String(b.nome)));
  const f = (v, d = 4) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
  let h = card(isel("areaProd", "Produto / máquina", [["", "Selecione…"], ...prods.map((p) => [p.codigo, `${p.nome} (${p.codigo})`])], areaProd, { estrito: true }) +
    `<div class="caption">Por linha da ficha: quantidade = Qtd_Componente × Qtd_Consumo (tubo: ÷ 1,06; chapa: sem ÷ 1,06);
     área = quantidade × área unitária (tubo: m²/metro; chapa: m²/kg). Banho usa a área total; Pintura usa a área externa (tubo) ou m²/kg (chapa).</div>`, "Conferência de áreas");
  if (areaProd && F.produtos[areaProd]) {
    const P = F.partes[areaProd] || {}, L = F.produtos[areaProd].linhas || [];
    let tb = 0, tp = 0, tb0 = 0, tp0 = 0, sem = 0;
    const linhas = L.map(([c, m, q, qc, prodRow]) => {
      const a = A[m], mat = P["M" + m] || {}, comp = P["C" + c] || {};
      const qtd = q * (a?.tipo === "chapa" ? 1.06 : 1) * qc, b = a ? qtd * num(a.b) : 0, pp = a ? qtd * num(a.p) : 0;
      if (a) { tb += b; tp += pp; tb0 += b * 1.06; tp0 += pp * 1.06; } else sem++;
      return `<tr${a ? "" : ' style="opacity:.55"'}><td>${prodRow ? "(produto)" : esc(c) + " — " + esc(comp.nome || "")}</td><td class="num">${f(qc)}</td>
        <td>${esc(m)} — ${esc(mat.nome || "")}</td><td>${esc(mat.un || "")}</td><td>${a ? (a.tipo === "chapa" ? "Chapa" : "Tubo") : "sem área"}</td>
        <td class="num">${f(q * 1.06)}</td><td class="num">${f(q)}</td><td class="num">${f(qtd)}</td>
        <td class="num">${a ? f(a.b, 6) : "—"}</td><td class="num">${a ? f(a.p, 6) : "—"}</td><td class="num">${a ? f(b) : "—"}</td><td class="num">${a ? f(pp) : "—"}</td></tr>`;
    }).join("");
    h += card(`<div class="tbl-wrap"><table><thead><tr><th>Componente</th><th>Qtd comp.</th><th>Material</th><th>Un.</th><th>Tipo</th>
      <th>Consumo ficha</th><th>÷ 1,06</th><th>Qtd total</th><th>m²/un banho</th><th>m²/un pintura</th><th>Área banho (m²)</th><th>Área pintura (m²)</th></tr></thead>
      <tbody>${linhas || '<tr><td colspan="12">Sem linhas de material para este produto.</td></tr>'}</tbody>
      <tfoot><tr><th colspan="10">Total (usado no app)</th><th class="num">${f(tb, 3)}</th><th class="num">${f(tp, 3)}</th></tr>
      <tr><td colspan="10">Total sem dividir por 1,06 (comparação)</td><td class="num">${f(tb0, 3)}</td><td class="num">${f(tp0, 3)}</td></tr></tfoot></table></div>` +
      (L.some((l) => !num(l[2])) ? alerta("warn", `${L.filter((l) => !num(l[2])).length} linha(s) com consumo 0 na ficha gravada no banco — a ficha foi importada antes da correção do leitor. Reimporte a view_ficha_tecnica.txt (Ctrl+F5 antes).`) : "") +
      (sem ? `<div class="caption">${sem} linha(s) com material fora do area_tubos.csv (não entram na área).</div>` : ""), "Itens e cálculo");
  }
  box.innerHTML = h;
  const s = box.querySelector("select"); if (s) s.addEventListener("change", () => { areaProd = s.value; areasCalc(box, ctx); });
}
