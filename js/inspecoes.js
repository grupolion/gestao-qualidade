// Máquinas inspecionadas por dia e processo, vindas da Edge Function Supabase "inspecoes"
// (lê a planilha Google com credencial guardada nos secrets do Supabase; nenhuma credencial aqui).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "./config.js";

export const META_PCT_PADRAO = 5;
const TTL = 10 * 60 * 1000;
let _c = null;

// { atualizado, linhas, desde, processos: [..], contagens: { PROCESSO: { "AAAA-MM-DD": n } } }
export async function dados(forcar = false) {
  if (_c && !forcar && Date.now() - _c.t < TTL) return _c.d;
  const r = await fetch(`${SUPABASE_URL}/functions/v1/inspecoes`, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  let d = {};
  try { d = await r.json(); } catch { /* corpo não-JSON */ }
  if (!r.ok) throw new Error(`Planilha de inspeções indisponível: ${d.erro || "HTTP " + r.status}`);
  _c = { t: Date.now(), d };
  return d;
}

// Soma das máquinas inspecionadas do processo entre de/ate (AAAA-MM-DD, inclusive).
export function total(d, processo, de, ate) {
  const dias = d?.contagens?.[String(processo || "").trim().toLocaleUpperCase("pt-BR")] || {};
  return Object.entries(dias).reduce((s, [dia, n]) => (dia >= de && dia <= ate ? s + n : s), 0);
}
