// Peso dos materiais (kg por unidade da ficha) e aba Administração → 🧱 Materiais.
// Base: estimativa gerada por gerar_pesos_materiais.py (peso-materiais.js); ajustes e matérias-primas novas
// ficam em config `pesos_materiais` {cod: {nome, un, kg, tipo, mat, a, b, e, obs}} e prevalecem sobre a base.
import { PESO_MATERIAIS, COMO_MATERIAIS } from './peso-materiais.js?v=20261016-materiais2';
import { esc, num, $, $$, card, row, alerta, toast } from './ui.js?v=20261005-minutos1';

export const DENSIDADES = { "Aço carbono": 7850, "Aço inox": 7930, "Alumínio": 2700, "Latão": 8500, "Polipropileno (PP)": 905,
  "PVC": 1400, "Nylon / Tecnil": 1140, "Poliacetal (POM)": 1410, "PEAD / UHMW": 950, "PS": 1050, "MDF": 700, "EVA": 100,
  "Borracha": 1200, "Espuma": 30 };

// tipo: [rótulo, unidade do resultado, campos usados]
export const TIPOS = {
  redondo: ["Tubo redondo (Ø externo, parede)", "kg/m", ["a", "e"]],
  retangular: ["Tubo quadrado / retangular (A, B, parede)", "kg/m", ["a", "b", "e"]],
  oblongo: ["Tubo oblongo (A, B, parede)", "kg/m", ["a", "b", "e"]],
  barra: ["Barra redonda / trefilado / tarugo (Ø)", "kg/m", ["a"]],
  chato: ["Barra chata / quadrada (A, B)", "kg/m", ["a", "b"]],
  cantoneira: ["Cantoneira (aba, espessura)", "kg/m", ["a", "e"]],
  chapa: ["Chapa / placa (espessura)", "kg/m²", ["e"]],
  volume: ["Volume (densidade)", "kg/m³", []],
  direto: ["Informar kg por unidade", "", []],
};

// medidas em mm, densidade em kg/m³ → kg por unidade (m, m² ou m³)
export function calcKg(tipo, dens, a, b, e) {
  [a, b, e, dens] = [a, b, e, dens].map(num);
  const lin = (mm2) => (mm2 > 0 ? mm2 * dens / 1e6 : 0);
  switch (tipo) {
    case "redondo": return lin(Math.PI * (a - e) * e);
    case "retangular": return lin(2 * (a + b - 2 * e) * e);
    case "oblongo": { const L = Math.abs(a - b), m = Math.min(a, b); return lin((2 * L + Math.PI * (m - e)) * e); }
    case "barra": return lin(Math.PI / 4 * a * a);
    case "chato": return lin(a * b);
    case "cantoneira": return lin((2 * a - e) * e);
    case "chapa": return dens * e / 1000;
    case "volume": return dens;
    default: return 0;
  }
}

const ajustes = (cfg) => cfg.pesos_materiais || {};
export function kgMaterial(cfg, cod) {
  const x = ajustes(cfg)[cod];
  return x && x.kg !== undefined && x.kg !== "" ? num(x.kg) : num(PESO_MATERIAIS[cod]);
}

const fmt = (v, d = 4) => num(v).toLocaleString("pt-BR", { maximumFractionDigits: d });
const UNS = ["MT", "M2", "M3", "KG", "UN", "PC", "JG", "CJ", "L"];

export async function abaMateriais(box, { S }, again, { db, salvarCfg }) {
  box.innerHTML = alerta("info", "Carregando materiais da ficha técnica…");
  let F = null;
  try { F = await db.carregarFicha(); } catch { /* sem ficha: mostra só base + cadastrados */ }
  const AJ = ajustes(S.cfg);
  // catálogo: materiais da ficha + base calculada + cadastrados manualmente
  const mats = {};
  for (const partes of Object.values(F?.partes || {}))
    for (const [k, x] of Object.entries(partes || {}))
      if (k[0] === "M" && x && !mats[x.codigo]) mats[x.codigo] = { cod: x.codigo, nome: x.nome || "", un: x.un || "" };
  for (const cod of Object.keys(PESO_MATERIAIS)) mats[cod] ||= { cod, nome: "", un: "" };
  for (const [cod, x] of Object.entries(AJ)) mats[cod] = { ...(mats[cod] || { cod }), nome: x.nome || mats[cod]?.nome || "", un: x.un || mats[cod]?.un || "" };
  const lista = Object.values(mats).map((m) => ({ ...m, kg: kgMaterial(S.cfg, m.cod),
    origem: AJ[m.cod] ? (PESO_MATERIAIS[m.cod] !== undefined || COMO_MATERIAIS[m.cod] ? "editado" : "cadastrado") : PESO_MATERIAIS[m.cod] ? "calculado" : "sem peso",
    como: AJ[m.cod]?.obs || COMO_MATERIAIS[m.cod] || "" }))
    .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR"));

  const sel = (id, opts, v) => `<select id="${id}">${opts.map(([k, t]) => `<option value="${esc(k)}" ${k === v ? "selected" : ""}>${esc(t)}</option>`).join("")}</select>`;
  const fld = (lbl, html) => `<div class="field"><label>${lbl}</label>${html}</div>`;
  const nInp = (id, ph = "") => `<input id="${id}" type="number" step="any" min="0" inputmode="decimal" placeholder="${ph}">`;
  box.innerHTML = alerta("info", "O peso de cada máquina = Σ (Qtd_Material × Qtd_Consumo ÷ 1,06 × Qtd_Componente × <b>kg por unidade</b> do material). Os valores abaixo foram estimados pelo nome do material (medidas × densidade). Edite um material ou cadastre uma matéria-prima nova; o valor salvo aqui prevalece sobre o cálculo automático.") +
    card(row("c3", fld("Código *", `<input id="mt-cod">`), fld("Nome", `<input id="mt-nome">`), fld("Unidade da ficha", sel("mt-un", UNS.map((u) => [u, u]), "MT"))) +
      row("c2", fld("Como calcular", sel("mt-tipo", Object.entries(TIPOS).map(([k, t]) => [k, t[0]]), "redondo")),
        fld("Material (densidade)", sel("mt-mat", [...Object.entries(DENSIDADES).map(([k, d]) => [k, `${k} — ${d} kg/m³`]), ["outro", "Outra densidade…"]], "Aço carbono"))) +
      row("c4", fld("Densidade (kg/m³)", nInp("mt-dens")), fld("<span id='mt-la'>A / Ø (mm)</span>", nInp("mt-a")), fld("B (mm)", nInp("mt-b")), fld("Parede / espessura (mm)", nInp("mt-e"))) +
      row("c2", fld("<span id='mt-lkg'>Kg por unidade</span>", nInp("mt-kg")), fld("Observação / como foi calculado", `<input id="mt-obs">`)) +
      `<div class="btnrow"><button class="btn primary" id="mt-save">💾 Salvar material</button><button class="btn" id="mt-novo">Limpar</button><button class="btn danger" id="mt-del">Voltar ao cálculo automático</button></div><div id="mt-msg"></div>`,
      "Cadastrar / editar material") +
    card(row("c2", fld("Buscar (código ou nome)", `<input id="mt-busca" placeholder="ex.: TUBO REDONDO 2">`),
      fld("Mostrar", sel("mt-filtro", [["", "Todos"], ["calculado", "Calculados"], ["editado", "Editados / cadastrados"], ["sem peso", "Sem peso"]], ""))) +
      `<div id="mt-tab"></div>`, `Materiais · ${lista.length} (${lista.filter((x) => x.kg > 0).length} com peso)`);

  const v = (id) => $("#" + id, box);
  const densAtual = () => num(v("mt-dens").value);
  const ajustarCampos = () => {
    const [, un, campos] = TIPOS[v("mt-tipo").value];
    for (const c of ["a", "b", "e"]) v("mt-" + c).disabled = !campos.includes(c);
    v("mt-dens").disabled = v("mt-tipo").value === "direto";
    v("mt-la").textContent = v("mt-tipo").value === "cantoneira" ? "Aba (mm)" : "A / Ø (mm)";
    v("mt-lkg").textContent = `Kg por unidade${un ? ` (${un})` : ""}`;
    v("mt-kg").readOnly = v("mt-tipo").value !== "direto";
  };
  const recalcular = () => {
    ajustarCampos();
    const t = v("mt-tipo").value; if (t === "direto") return;
    const kg = calcKg(t, densAtual(), v("mt-a").value, v("mt-b").value, v("mt-e").value);
    v("mt-kg").value = kg ? Math.round(kg * 1e5) / 1e5 : "";
    const mat = v("mt-mat").value === "outro" ? `${densAtual()} kg/m³` : v("mt-mat").value;
    const med = TIPOS[t][2].map((c) => `${{ a: "A", b: "B", e: "#" }[c]}${v("mt-" + c).value || "?"}`).join(" ");
    v("mt-obs").value = `${TIPOS[t][0].split(" (")[0]} ${med} × ${mat}`.trim();
  };
  v("mt-mat").onchange = () => { if (v("mt-mat").value !== "outro") v("mt-dens").value = DENSIDADES[v("mt-mat").value]; recalcular(); };
  for (const id of ["mt-tipo", "mt-dens", "mt-a", "mt-b", "mt-e"]) v(id).addEventListener("input", recalcular);
  v("mt-dens").addEventListener("input", () => { const d = densAtual(); v("mt-mat").value = Object.keys(DENSIDADES).find((k) => DENSIDADES[k] === d) || "outro"; });
  const preencher = (m) => {
    const x = AJ[m?.cod] || {};
    v("mt-cod").value = m?.cod || ""; v("mt-cod").readOnly = !!m;
    v("mt-nome").value = m?.nome || ""; v("mt-un").value = UNS.includes(m?.un) ? m.un : "MT";
    v("mt-tipo").value = x.tipo || (m ? "direto" : "redondo");
    v("mt-mat").value = x.mat && (DENSIDADES[x.mat] || x.mat === "outro") ? x.mat : "Aço carbono";
    v("mt-dens").value = x.dens || DENSIDADES[v("mt-mat").value];
    for (const c of ["a", "b", "e"]) v("mt-" + c).value = x[c] ?? "";
    v("mt-kg").value = m ? Math.round(num(m.kg) * 1e5) / 1e5 : "";
    v("mt-obs").value = m ? m.como : "";
    v("mt-del").style.display = m && AJ[m.cod] ? "" : "none";
    ajustarCampos();
    if (m) box.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  preencher(null); recalcular();
  v("mt-novo").onclick = () => { preencher(null); recalcular(); };

  v("mt-save").onclick = async () => {
    const cod = v("mt-cod").value.trim(), kg = num(v("mt-kg").value);
    if (!cod) return (v("mt-msg").innerHTML = alerta("error", "Informe o código do material (o mesmo da ficha técnica)."));
    if (!(kg >= 0) || v("mt-kg").value === "") return (v("mt-msg").innerHTML = alerta("error", "Informe as medidas ou o kg por unidade."));
    const t = v("mt-tipo").value;
    const novo = { ...AJ, [cod]: { nome: v("mt-nome").value.trim(), un: v("mt-un").value, kg: Math.round(kg * 1e5) / 1e5, tipo: t,
      mat: v("mt-mat").value, dens: densAtual(), a: v("mt-a").value, b: v("mt-b").value, e: v("mt-e").value, obs: v("mt-obs").value.trim() } };
    await salvarCfg("pesos_materiais", novo, again, `Material ${cod} salvo — pesos das máquinas atualizados.`);
  };
  v("mt-del").onclick = async () => {
    const cod = v("mt-cod").value.trim(); if (!AJ[cod]) return;
    const novo = { ...AJ }; delete novo[cod];
    await salvarCfg("pesos_materiais", novo, again, `Material ${cod} voltou ao cálculo automático.`);
  };

  const desenhar = () => {
    const q = v("mt-busca").value.trim().toUpperCase(), f = v("mt-filtro").value;
    const fl = lista.filter((m) => (!q || m.cod.includes(q) || m.nome.toUpperCase().includes(q)) && (!f || (f === "editado" ? ["editado", "cadastrado"].includes(m.origem) : m.origem === f)));
    v("mt-tab").innerHTML = `<div class="tbl-wrap"><table><thead><tr><th>Código</th><th>Material</th><th>Un.</th><th class="num">Kg / un.</th><th>Origem</th><th>Como foi calculado</th><th></th></tr></thead><tbody>` +
      fl.slice(0, 300).map((m) => `<tr><td>${esc(m.cod)}</td><td>${esc(m.nome)}</td><td>${esc(m.un)}</td><td class="num">${m.kg ? fmt(m.kg) : "—"}</td>
        <td>${esc(m.origem)}</td><td class="caption">${esc(m.como)}</td><td><button class="btn sm" data-mt="${esc(m.cod)}">Editar</button></td></tr>`).join("") +
      `</tbody></table></div>` + (fl.length > 300 ? `<div class="caption">Mostrando 300 de ${fl.length} — refine a busca.</div>` : "") +
      (!fl.length ? `<div class="caption">Nenhum material encontrado.</div>` : "");
    $$("[data-mt]", v("mt-tab")).forEach((b) => (b.onclick = () => preencher(lista.find((m) => m.cod === b.dataset.mt))));
  };
  v("mt-busca").addEventListener("input", desenhar); v("mt-filtro").onchange = desenhar;
  desenhar();
  if (!F) toast("Ficha técnica não carregada — mostrando só materiais com peso calculado.");
}
