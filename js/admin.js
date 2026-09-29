// Painel do administrador (porta do admin.py)
import * as db from "./db.js";
import { esc, $, $$, num, brl, toast, alerta, heading, card, row, inp, isel, ichk, tabela, confirmar } from "./ui.js";

const ABAS = ["Setores e metas", "Defeitos por setor", "Usuários", "Máquinas", "Peças", "Ficha técnica", "🔒 Segurança"];
let aba = 0;

export function paginaAdmin(el, ctx) {
  el.innerHTML = heading("Administração", "Cadastre setores, metas, defeitos, usuários, máquinas e peças.") +
    `<div class="tabs">${ABAS.map((t, i) => `<button data-t="${i}" class="${i === aba ? "on" : ""}">${t}</button>`).join("")}</div><div id="ad"></div>`;
  $$("[data-t]", el).forEach((b) => (b.onclick = () => { aba = +b.dataset.t; paginaAdmin(el, ctx); }));
  const box = $("#ad");
  const again = async () => { await ctx.recarregarCfg(); paginaAdmin(el, ctx); };
  [setores, defeitos, usuarios, (b, c, a) => cadastro(b, c, a, "maquinas"), (b, c, a) => cadastro(b, c, a, "pecas"), fichaTec, seguranca][aba](box, ctx, again);
}
const salvarCfg = async (k, v, again, msg = "Salvo.") => {
  try { await db.salvarConfig(k, v); toast(msg); await again(); } catch (e) { toast("Erro: " + e.message); }
};

// tabela editável simples (linhas dinâmicas)
function grade(cols, linhas) {
  return `<div class="tbl-wrap"><table class="edit"><thead><tr>${cols.map((c) => `<th>${esc(c[1])}</th>`).join("")}<th></th></tr></thead><tbody>
    ${linhas.map((l) => `<tr>${cols.map((c) => `<td><input data-c="${c[0]}" ${c[2] === "num" ? 'type="number" step="any" min="0" inputmode="decimal"' : ""} value="${esc(l[c[0]] ?? "")}"></td>`).join("")}
    <td><button class="btn sm danger" data-rm>✕</button></td></tr>`).join("")}</tbody></table></div>
    <div class="btnrow" style="margin-top:.6rem"><button class="btn" data-add>+ Linha</button><button class="btn primary" data-save>💾 Salvar</button></div>`;
}
function ligarGrade(box, cols, onSave) {
  const tb = $("tbody", box);
  $("[data-add]", box).onclick = () => { const tr = document.createElement("tr");
    tr.innerHTML = cols.map((c) => `<td><input data-c="${c[0]}" ${c[2] === "num" ? 'type="number" step="any" min="0"' : ""}></td>`).join("") + `<td><button class="btn sm danger" data-rm>✕</button></td>`;
    tb.append(tr); };
  tb.addEventListener("click", (e) => { if (e.target.matches("[data-rm]")) e.target.closest("tr").remove(); });
  $("[data-save]", box).onclick = () => onSave($$("tr", tb).map((tr) => Object.fromEntries($$("input", tr).map((i) => [i.dataset.c, i.value.trim()]))));
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
      row("c2", inp("login", "Login (sem espaços)", ""), inp("nome", "Nome completo", "")) + row("c3", inp("s1", "Senha", "", { type: "password" }), inp("s2", "Repita a senha", "", { type: "password" }),
      isel("perfil", "Perfil", [["usuario", "Usuário"], ["admin", "Administrador"]], "usuario")) + opSet() + `<button class="btn primary" id="criar">Criar usuário</button></div>` +
    (u ? `<div class="card" id="eu"><div class="ttl">Editar / excluir usuário</div>` + isel("u", "Usuário", P.map((p) => [p.id, `${p.nome} (${p.login})`]), u.id) +
      row("c3", inp("nome", "Nome", u.nome), isel("perfil", "Perfil", [["usuario", "Usuário"], ["admin", "Administrador"]], u.perfil), `<div class="field"><label>&nbsp;</label>${ichk("ativo", "Ativo", u.ativo)}</div>`) +
      opSet(u.setores || []) + inp("senha", "Nova senha (deixe em branco para manter)", "", { type: "password" }) +
      `<div class="btnrow" style="margin-top:1rem"><button class="btn primary" id="salv">💾 Salvar alterações</button><button class="btn danger" id="exc">🗑 Excluir usuário</button></div></div>` : "");
  const v = (id, k) => $(`#${id} [data-k=${k}]`);
  const sets = (id) => $$(`#${id} [data-set]`).filter((c) => c.checked).map((c) => c.value);
  $("#criar").onclick = async () => {
    const login = v("nu", "login").value.trim().toLowerCase();
    if (!login || /\s/.test(login)) return toast("Informe um login sem espaços.");
    if (P.some((p) => p.login === login)) return toast(`O login '${login}' já existe.`);
    if (v("nu", "s1").value.length < 4) return toast("A senha deve ter pelo menos 4 caracteres.");
    if (v("nu", "s1").value !== v("nu", "s2").value) return toast("As senhas não conferem.");
    try { await db.criarUsuario({ login, nome: v("nu", "nome").value.trim() || login, senha: v("nu", "s1").value, perfil: v("nu", "perfil").value, setores: sets("nu") });
      toast(`Usuário ${login} criado.`); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
  if (!u) return;
  v("eu", "u").onchange = (e) => { usuarios.sel = e.target.value; usuarios(box, { S }, again); };
  const adminsAtivos = (exceto) => P.filter((p) => p.id !== exceto && p.perfil === "admin" && p.ativo).length;
  $("#salv").onclick = async () => {
    const perfil = v("eu", "perfil").value, ativo = v("eu", "ativo").checked, senha = v("eu", "senha").value;
    if ((perfil !== "admin" || !ativo) && !adminsAtivos(u.id)) return toast("É preciso manter ao menos um administrador ativo.");
    if (senha && senha.length < 4) return toast("A senha deve ter pelo menos 4 caracteres.");
    try { await db.salvarPerfil(u.id, { nome: v("eu", "nome").value.trim() || u.login, perfil, ativo, setores: sets("eu") });
      if (senha) await db.definirSenha(u.id, senha);
      toast(`Usuário ${u.login} atualizado.`); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
  $("#exc").onclick = async () => {
    if (u.id === S.user.id) return toast("Você não pode excluir o próprio usuário.");
    if (u.perfil === "admin" && !adminsAtivos(u.id)) return toast("É preciso manter ao menos um administrador ativo.");
    if (!(await confirmar(`Excluir ${u.login}? O histórico dos registros é mantido.`))) return;
    try { await db.excluirUsuario(u.id); usuarios.sel = null; toast("Usuário excluído."); await again(); } catch (e) { toast("Erro: " + e.message); }
  };
}

const CAD = {
  maquinas: { t: "Máquinas", cols: [["codigo", "Código"], ["descricao", "Descrição"], ["setor", "Setor"], ["custo_hora", "Custo hora (R$/h)", "num"]], numk: "custo_hora" },
  pecas: { t: "Peças", cols: [["codigo", "Código"], ["descricao", "Descrição"], ["custo_unit", "Custo unitário (R$)", "num"]], numk: "custo_unit" },
};
function cadastro(box, { S }, again, chave) {
  const c = CAD[chave], lista = S.cfg[chave] || [];
  box.innerHTML = alerta("info", `Usado para preencher automaticamente os custos da RNC. Importe uma planilha (.xlsx/.csv) com as colunas: ${c.cols.map((x) => `<b>${x[1]}</b>`).join(", ")} — ou edite a tabela.`) +
    card(`<div class="field"><label>Importar planilha</label><input type="file" id="imp" accept=".xlsx,.xls,.csv"></div>`) + card(grade(c.cols, lista), c.t);
  const normal = (rows) => {
    const vistos = new Set(), out = [];
    for (const r of rows) { const cod = String(r.codigo ?? "").trim(); if (!cod || vistos.has(cod)) continue; vistos.add(cod);
      out.push(Object.fromEntries(c.cols.map(([k, , t]) => [k, t === "num" ? num(r[k]) : String(r[k] ?? "").trim()]))); }
    return out;
  };
  ligarGrade(box, c.cols, (rows) => { const l = normal(rows); salvarCfg(chave, l, again, `${l.length} ${c.t.toLowerCase()} salvas.`); });
  $("#imp").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array" });
      const raw = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: "" });
      const sem = (s) => String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z]/g, "");
      const mapa = {}; for (const [k, t] of c.cols) mapa[sem(t)] = k, mapa[sem(k)] = k;
      mapa.custo = c.numk; mapa.valor = c.numk; mapa.custohora = c.numk; mapa.descricao = "descricao";
      const rows = raw.map((r) => { const o = {}; for (const [k, v] of Object.entries(r)) { const kk = mapa[sem(k)] || Object.entries(mapa).find(([m]) => sem(k).startsWith(m))?.[1]; if (kk && o[kk] === undefined) o[kk] = v; } return o; });
      if (!rows.some((r) => r.codigo)) return toast("Coluna 'Código' não encontrada na planilha.");
      const atual = Object.fromEntries(lista.map((x) => [x.codigo, x]));
      for (const x of normal(rows)) atual[x.codigo] = x;
      await salvarCfg(chave, Object.values(atual), again, `${rows.length} linha(s) importadas.`);
    } catch (err) { toast("Não foi possível ler a planilha: " + err.message); }
  };
}

// Importa view_ficha_tecnica.txt (';', decimal '.', UTF-8 BOM) — mesma regra do ficha.py
function fichaTec(box) {
  box.innerHTML = card(alerta("info", "Envie o arquivo <b>view_ficha_tecnica.txt</b> atualizado para substituir os produtos, componentes e materiais usados no custo das RNCs.") +
    `<div class="field"><label>Arquivo da ficha técnica</label><input type="file" id="ft" accept=".txt,.csv"></div><div id="ftmsg"></div>`, "Ficha técnica");
  $("#ft").onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    const msg = $("#ftmsg"); msg.innerHTML = alerta("info", "Processando…");
    try {
      const txt = (await f.text()).replace(/^﻿/, "");
      const [cab, ...ls] = txt.split(/\r?\n/).filter(Boolean);
      const H = cab.split(";").map((s) => s.trim());
      const n = (v) => { const x = parseFloat(String(v || "").replace(",", ".")); return isFinite(x) ? x : 0; };
      const G = {};
      for (const l of ls) { const c = l.split(";"); const r = Object.fromEntries(H.map((h, i) => [h, (c[i] || "").trim()])); (G[r.Prod_Cod_Barra] ||= []).push(r); }
      const lista = Object.entries(G).filter(([k]) => k).map(([cod, g]) => {
        const pr = g.find((r) => r.Tipo_Pai === "Produto");
        const partes = {};
        for (const r of g) {
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
        return { codigo: cod, nome: g[0].Prod_Referencia || cod, valor: pr ? n(pr.Valor_Total_Componente) : 0, familia: g[0].Nome_Familia || "", grupo: g[0].Nome_Grupo || "", partes };
      });
      await db.importarFicha(lista); await db.carregarFicha(true);
      msg.innerHTML = alerta("ok", `${lista.length} produto(s) importados. Recarregue a página para usar a nova ficha.`);
    } catch (err) { msg.innerHTML = alerta("error", esc(err.message)); }
  };
}
void brl;

// ---------- Segurança: chave mestra ----------
async function seguranca(box) {
  const ativa = db.criptoAtiva();
  if (!ativa) {
    box.innerHTML = card(`<div class="alert info">Custos e ficha técnica estão <b>sem criptografia</b>. Ao ativar, eles passam a ser gravados cifrados (AES-256) no Supabase.
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
  box.innerHTML = card(`<div class="alert ok">🔒 Criptografia ativa. Custos e ficha técnica estão cifrados no Supabase.</div>` +
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
