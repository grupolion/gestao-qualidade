// Helpers de apresentação (equivalente ao ui.py)
export const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
// Only the raster data URLs produced by our upload pipeline are accepted.
export const imagemSegura = (src) => typeof src === "string" && src.length <= 12 * 1024 * 1024 &&
  /^data:image\/(?:jpeg|png|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/.test(src) ? src : "";
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const num = (v) => { const n = parseFloat(String(v ?? "").replace(",", ".")); return isFinite(n) ? n : 0; };
export const brl = (v) => "R$ " + num(v).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const fdate = (s) => { s = String(s || "").slice(0, 10); return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.split("-").reverse().join("/") : s; };
export const hoje = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
export const addDias = (iso, n) => { const d = new Date(iso + "T12:00"); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
export const hora = () => new Date().toLocaleTimeString("pt-BR");
let _uid = 0; const uid = () => "f" + ++_uid;

export function toast(msg) {
  const t = document.createElement("div"); t.className = "toast"; t.textContent = msg;
  $("#toasts").append(t); setTimeout(() => t.remove(), 3800);
}
export const alerta = (tipo, msg) => `<div class="alert ${tipo}">${msg}</div>`;
export const heading = (t, s = "") => `<div class="heading"><h1>${esc(t)}</h1>${s ? `<p>${esc(s)}</p>` : ""}</div>`;
export const card = (inner, ttl = "") => `<div class="card">${ttl ? `<div class="ttl">${ttl}</div>` : ""}${inner}</div>`;
export const row = (cls, ...cols) => `<div class="row ${cls}">${cols.join("")}</div>`;
export const exp = (ttl, inner, open = false) => `<details class="exp" ${open ? "open" : ""}><summary>${ttl}</summary><div>${inner}</div></details>`;
export const metric = (l, v) => `<div class="metric"><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>`;
export const tip = (t) => t ? `<span class="tip" title="${esc(t)}">ⓘ</span>` : "";

const lab = (id, label, help) => label ? `<label for="${id}">${esc(label)}${tip(help)}</label>` : "";
const attrs = (o) => `${o.dis ? "disabled" : ""} ${o.k ? `data-k="${esc(o.k)}"` : ""} ${o.id2 ? `id="${o.id2}"` : ""}`;

export function inp(k, label, val, o = {}) {
  const id = o.id2 || uid();
  return `<div class="field">${lab(id, label, o.help)}<input id="${id}" type="${o.type || "text"}" ${o.type === "number" ? `step="${o.step ?? "any"}" min="${o.min ?? 0}" inputmode="decimal"` : ""}
    value="${esc(val)}" placeholder="${esc(o.ph || "")}" ${attrs({ ...o, k, id2: null })}></div>`;
}
export const inum = (k, l, v, o = {}) => inp(k, l, v ?? 0, { ...o, type: "number" });
export const idate = (k, l, v, o = {}) => inp(k, l, String(v || "").slice(0, 10), { ...o, type: "date" });
export function itxt(k, label, val, o = {}) {
  const id = uid();
  return `<div class="field">${lab(id, label, o.help)}<textarea id="${id}" ${attrs({ ...o, k })} placeholder="${esc(o.ph || "")}">${esc(val)}</textarea></div>`;
}
// opts: array de valores ou de [valor, rótulo]
export function isel(k, label, opts, val, o = {}) {
  const id = uid();
  const op = opts.map((x) => (Array.isArray(x) ? x : [x, x]));
  if (val && !op.some(([v]) => v === val) && !o.estrito) op.unshift([val, val]);
  return `<div class="field">${lab(id, label, o.help)}<select id="${id}" ${attrs({ ...o, k })}>
    ${o.ph !== undefined ? `<option value="">${esc(o.ph)}</option>` : ""}
    ${op.map(([v, t]) => `<option value="${esc(v)}" ${v === val ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
}
export const ichk = (k, label, val, o = {}) =>
  `<label class="check"><input type="checkbox" ${val ? "checked" : ""} ${attrs({ ...o, k })}> ${esc(label)}</label>`;
// select pesquisável (datalist) — bom p/ listas longas no celular
export function icombo(k, label, opts, val, o = {}) {
  const id = uid(), dl = uid();
  const op = opts.map((x) => (Array.isArray(x) ? x : [x, x]));
  const cur = op.find(([v]) => v === val);
  return `<div class="field">${lab(id, label, o.help)}<div class="combo"><input id="${id}" data-dl="${dl}" data-combo="${esc(k)}" ${o.dis ? "disabled" : ""}
     value="${esc(cur ? cur[1] : val || "")}" placeholder="${esc(o.ph || "Digite para buscar…")}" autocomplete="off">
    <datalist id="${dl}">${op.map(([v, t]) => `<option data-v="${esc(v)}" value="${esc(t)}"></option>`).join("")}</datalist><div class="combo-list" hidden></div></div></div>`;
}
export function comboValor(el) {
  const o = [...document.getElementById(el.dataset.dl).options].find((x) => x.value === el.value);
  return o ? o.dataset.v : el.value;
}

export function tabela(cols, rows, o = {}) {
  // cols: [chave, título, tipo('num'|'brl'|'wrap')]
  const cel = (c, r) => {
    const v = r[c[0]]; const t = c[2];
    return `<td class="${t === "num" || t === "brl" ? "num" : t === "wrap" ? "wrap" : ""}">${t === "brl" ? brl(v) : esc(v)}</td>`;
  };
  return `<div class="tbl-wrap" ${o.h ? `style="max-height:${o.h}px"` : ""}><table><thead><tr>${cols.map((c) => `<th class="${c[2] === "num" || c[2] === "brl" ? "num" : ""}">${esc(c[1])}</th>`).join("")}</tr></thead>
    <tbody>${rows.map((r, i) => `<tr ${o.click ? `class="click" data-i="${i}"` : ""}>${cols.map((c) => cel(c, r)).join("")}</tr>`).join("")}</tbody></table></div>`;
}

export function modal(html, { sm = false, onClose } = {}) {
  const m = document.createElement("div"); m.className = "modal";
  m.innerHTML = `<div class="box ${sm ? "sm" : ""}"><button class="x" aria-label="Fechar">×</button><div class="body">${html}</div></div>`;
  const fechar = () => { m.remove(); document.body.style.overflow = ""; onClose && onClose(); };
  m.querySelector(".x").onclick = fechar;
  m.addEventListener("click", (e) => { if (e.target === m) fechar(); });
  document.body.append(m); document.body.style.overflow = "hidden";
  m.fechar = fechar; return m;
}
export function verImagem(src) {
  src = imagemSegura(src);
  if (!src) return;
  const m = document.createElement("div"); m.className = "modal img";
  const img = document.createElement("img"); img.src = src; img.alt = ""; m.append(img);
  m.onclick = () => m.remove(); document.body.append(m);
}
export function confirmar(msg, rotulo = "Confirmar exclusão") {
  return new Promise((ok) => {
    const m = modal(`<p>${esc(msg)}</p><div class="btnrow"><button class="btn primary" data-s>${esc(rotulo)}</button><button class="btn" data-n>Cancelar</button></div>`,
      { sm: true, onClose: () => ok(false) });
    m.querySelector("[data-s]").onclick = () => { ok(true); m.remove(); document.body.style.overflow = ""; };
    m.querySelector("[data-n]").onclick = () => m.fechar();
  });
}
export function baixarCSV(nome, cols, rows) {
  const q = (v) => {
    const numeric = typeof v === "number" && Number.isFinite(v);
    v = String(v ?? "");
    if (!numeric && /^[\s\u0000-\u001f]*[=+@-]/.test(v)) v = "'" + v;
    return /[;"\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  };
  const txt = [cols.map((c) => q(c[1])).join(";"), ...rows.map((r) => cols.map((c) => q(c[2] === "brl" ? num(r[c[0]]).toFixed(2).replace(".", ",") : r[c[0]])).join(";"))].join("\n");
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob(["﻿" + txt], { type: "text/csv;charset=utf-8" })); a.download = nome; a.click();
}

// lista suspensa própria (datalist no iPhone vira sugestão do teclado e corta o texto)
function comboAbrir(inp) {
  const box = inp.parentElement.querySelector(".combo-list"), q = inp.value.trim().toLowerCase();
  const ops = [...document.getElementById(inp.dataset.dl).options].map((o) => o.value)
    .filter((t) => !q || t.toLowerCase().includes(q)).slice(0, 80);
  box.innerHTML = ops.length ? ops.map((t) => `<div class="combo-op">${esc(t)}</div>`).join("") : `<div class="combo-vazio">Nenhum resultado</div>`;
  box.hidden = false;
}
function comboFechar(except) {
  document.querySelectorAll(".combo-list").forEach((b) => { if (b !== except) b.hidden = true; });
}
document.addEventListener("focusin", (e) => { if (e.target.matches?.("[data-combo]")) { comboFechar(); comboAbrir(e.target); } });
document.addEventListener("input", (e) => { if (e.target.matches?.("[data-combo]")) comboAbrir(e.target); });
document.addEventListener("pointerdown", (e) => {
  const op = e.target.closest?.(".combo-op");
  if (op) {
    e.preventDefault();
    const inp = op.closest(".combo").querySelector("input");
    inp.value = op.textContent; op.parentElement.hidden = true; inp.blur();
    inp.dispatchEvent(new Event("change", { bubbles: true }));
    return;
  }
  if (!e.target.closest?.(".combo")) comboFechar();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") comboFechar(); });
