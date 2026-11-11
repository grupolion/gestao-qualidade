// Criptografia no navegador (Web Crypto): AES-256-GCM + PBKDF2-SHA256.
// Modelo: uma chave de dados (DEK) aleatória cifra custos e ficha técnica.
// A DEK é guardada no banco apenas "embrulhada": pela chave mestra (só o dono) e pela senha de cada usuário liberado.
const te = new TextEncoder(), td = new TextDecoder();
export const ITER = 600000;
export const PREFIXO = "enc:v1:";

function b64(u8) { let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); }
function unb64(s) { const b = atob(s), u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; }
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));

async function derivar(segredo, salt, iter) {
  const base = await crypto.subtle.importKey("raw", te.encode(segredo), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({ name: "PBKDF2", salt, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}
export const gerarDEK = () => crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);

// embrulha a DEK com um segredo (senha ou chave mestra)
export async function embrulhar(dek, segredo) {
  const salt = rand(16), iv = rand(12);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  try {
    const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await derivar(segredo, salt, ITER), raw));
    return { salt: b64(salt), iv: b64(iv), wrapped: b64(ct), iter: ITER };
  } finally { raw.fill(0); }
}
export async function desembrulhar(reg, segredo, exportavel = false) {
  try {
    const raw = await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(reg.iv) }, await derivar(segredo, unb64(reg.salt), reg.iter), unb64(reg.wrapped));
    try { return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, exportavel, ["encrypt", "decrypt"]); }
    finally { new Uint8Array(raw).fill(0); }
  } catch { throw new Error("Chave ou senha incorreta."); }
}
export async function cifrar(dek, obj) {
  const iv = rand(12);
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dek, te.encode(JSON.stringify(obj))));
  const u = new Uint8Array(12 + ct.length); u.set(iv); u.set(ct, 12);
  return PREFIXO + b64(u);
}
export async function decifrar(dek, s) {
  const u = unb64(s.slice(PREFIXO.length));
  return JSON.parse(td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: u.subarray(0, 12) }, dek, u.subarray(12))));
}
export const cifrado = (v) => typeof v === "string" && v.startsWith(PREFIXO);

// Persist only non-extractable usage keys. Same-origin scripts can still use them.
export async function chaveDeUso(dek) {
  if (!dek.extractable) return dek;
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", dek));
  try { return await crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]); }
  finally { raw.fill(0); }
}
const IDB = () => new Promise((ok, erro) => { const r = indexedDB.open("gq-cripto", 1); r.onupgradeneeded = () => r.result.createObjectStore("k"); r.onsuccess = () => ok(r.result); r.onerror = () => erro(r.error); });
async function tx(modo, f) { const d = await IDB(); return new Promise((ok, erro) => { const t = d.transaction("k", modo); const r = f(t.objectStore("k")); t.oncomplete = () => ok(r?.result); t.onerror = () => erro(t.error); }); }
export async function guardarLocal(uid, dek) {
  if (localStorage.getItem("gq-manter") !== "1") { await limparLocal(); return; }
  const uso = await chaveDeUso(dek);
  await tx("readwrite", (s) => s.put(uso, uid));
}
export async function lerLocal(uid) {
  if (localStorage.getItem("gq-manter") !== "1") { await limparLocal(); return null; }
  const dek = await tx("readonly", (s) => s.get(uid)).catch(() => null);
  if (!dek) return null;
  const uso = await chaveDeUso(dek);
  if (dek.extractable) await guardarLocal(uid, uso); // migrate legacy caches
  return uso;
}
export const limparLocal = () => tx("readwrite", (s) => s.clear()).catch(() => {});
