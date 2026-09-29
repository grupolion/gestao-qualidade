// Camada de dados (Supabase) — equivalente ao storage.py do app Streamlit.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMINIO } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: "gq-sessao" } });

export class ConflictError extends Error {}
const email = (login) => `${login.trim().toLowerCase()}@${EMAIL_DOMINIO}`;
const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------- autenticação ----------
export async function entrar(login, senha, manter) {
  localStorage.setItem("gq-manter", manter ? "1" : "0");
  sessionStorage.setItem("gq-viva", "1");
  const { error } = await sb.auth.signInWithPassword({ email: email(login), password: senha });
  if (error) throw new Error("Login ou senha inválidos.");
  return meuPerfil();
}
export async function sair() { await sb.auth.signOut(); }
export async function sessaoAtual() {
  // "Manter conectado" desmarcado → sessão só vale enquanto a aba/navegador estiver aberto
  if (localStorage.getItem("gq-manter") === "0" && !sessionStorage.getItem("gq-viva")) { await sb.auth.signOut(); return null; }
  const { data } = await sb.auth.getSession();
  return data.session ? meuPerfil() : null;
}
async function meuPerfil() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;
  const p = chk(await sb.from("perfis").select("*").eq("id", user.id).maybeSingle());
  if (!p || !p.ativo) { await sb.auth.signOut(); throw new Error("Usuário inativo."); }
  return p;
}
export async function trocarSenha(atual, nova, login) {
  const { error } = await sb.auth.signInWithPassword({ email: email(login), password: atual });
  if (error) throw new Error("Senha atual incorreta.");
  chk(await sb.auth.updateUser({ password: nova }));
}

// ---------- usuários (admin) ----------
export const listarPerfis = async () => chk(await sb.from("perfis").select("*").order("login"));
export async function criarUsuario({ login, nome, senha, perfil, setores }) {
  // cliente separado para não trocar a sessão do administrador
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "gq-tmp" } });
  const { data, error } = await tmp.auth.signUp({ email: email(login), password: senha });
  if (error) throw new Error(/registered/i.test(error.message) ? `O login '${login}' já existe.` : error.message);
  if (!data.user?.id) throw new Error("Desative 'Confirm email' em Supabase → Authentication → Sign In / Providers → Email.");
  // o gatilho novo_usuario cria o perfil inativo; o admin completa e ativa
  await salvarPerfil(data.user.id, { nome, perfil, setores, ativo: true });
}
export async function salvarPerfil(id, campos) { chk(await sb.from("perfis").update(campos).eq("id", id)); }
export async function definirSenha(id, senha) { chk(await sb.rpc("admin_definir_senha", { uid: id, senha })); }
export async function excluirUsuario(id) { chk(await sb.rpc("admin_excluir_usuario", { uid: id })); }

// ---------- configuração ----------
export async function carregarConfig() {
  const rows = chk(await sb.from("config").select("chave,valor"));
  const cfg = { setores: [], setor_params: {}, parametros: {}, colaboradores: [], centros_custo: [], maquinas: [], pecas: [], defeitos: {} };
  for (const r of rows) cfg[r.chave] = r.valor;
  cfg.parametros = { custo_hora_padrao: 60, refresh_segundos: 30, ...cfg.parametros };
  return cfg;
}
export async function salvarConfig(chave, valor) { chk(await sb.from("config").upsert({ chave, valor })); }

// ---------- ficha técnica ----------
let _ficha = null;
export async function carregarFicha(forcar = false) {
  if (_ficha && !forcar) return _ficha;
  const rows = []; let de = 0;
  for (;;) {
    const lote = chk(await sb.from("ficha_produtos").select("*").order("codigo").range(de, de + 999));
    rows.push(...lote); if (lote.length < 1000) break; de += 1000;
  }
  const produtos = {}, partes = {};
  for (const r of rows) {
    produtos[r.codigo] = { codigo: r.codigo, nome: r.nome, valor: +r.valor || 0, familia: r.familia, grupo: r.grupo };
    partes[r.codigo] = r.partes || {};
  }
  return (_ficha = { produtos, partes });
}
export async function importarFicha(lista) {
  for (let i = 0; i < lista.length; i += 50) chk(await sb.from("ficha_produtos").upsert(lista.slice(i, i + 50)));
}

// ---------- registros (rnc / acoes) ----------
export async function listar(col) {
  const out = []; let de = 0;
  for (;;) {
    const lote = chk(await sb.from(col).select("id,dados,versao").order("id").range(de, de + 999));
    out.push(...lote.map((r) => ({ ...r.dados, id: r.id, versao: r.versao }))); if (lote.length < 1000) break; de += 1000;
  }
  return out;
}
export async function obter(col, id) {
  const r = chk(await sb.from(col).select("id,dados,versao").eq("id", id).maybeSingle());
  return r ? { ...r.dados, id: r.id, versao: r.versao } : null;
}
const agora = () => new Date().toISOString().slice(0, 19);

// Salva com histórico e controle de versão otimista (igual storage.save_record)
export async function salvar(col, rec, user) {
  rec = structuredClone(rec);
  const hist = rec.historico || [];
  delete rec.historico;
  if (!rec.id) {
    rec.id = chk(await sb.rpc("proximo_id", { tipo: col }));
    rec.criado_em = agora(); rec.criado_por = user;
    const dados = { ...rec, historico: [{ em: agora(), por: user, acao: "criado" }] };
    delete dados.versao;
    chk(await sb.from(col).insert({ id: rec.id, dados, versao: 1 }));
    return { ...dados, versao: 1 };
  }
  const velho = await obter(col, rec.id);
  if (!velho) throw new Error("Registro não encontrado (pode ter sido excluído).");
  if ((rec.versao ?? velho.versao) !== velho.versao)
    throw new ConflictError(`Registro alterado por ${velho.alterado_por || "outro usuário"} em ${(velho.alterado_em || "").replace("T", " ")}. Recarregue antes de salvar.`);
  const h = [...(velho.historico || hist)];
  const mud = [];
  for (const k of Object.keys(rec)) if (!["versao", "alterado_em", "alterado_por"].includes(k) && JSON.stringify(rec[k]) !== JSON.stringify(velho[k])) mud.push(k);
  if ((rec.status || "") !== (velho.status || "")) h.push({ em: agora(), por: user, acao: "status", de: velho.status, para: rec.status });
  else if (mud.length) h.push({ em: agora(), por: user, acao: "alterado", campos: mud.slice(0, 20) });
  const nv = velho.versao + 1;
  const dados = { ...rec, historico: h, alterado_em: agora(), alterado_por: user };
  delete dados.versao;
  const r = chk(await sb.from(col).update({ dados, versao: nv, atualizado_em: new Date().toISOString() })
    .eq("id", rec.id).eq("versao", velho.versao).select("id"));
  if (!r.length) throw new ConflictError("Registro alterado por outro usuário. Recarregue antes de salvar.");
  return { ...dados, id: rec.id, versao: nv };
}
export async function excluir(col, id, user) {
  const rec = await obter(col, id);
  if (!rec) return;
  const fotos = col === "rnc" ? chk(await sb.from("fotos").select("nome,conteudo").eq("rnc_id", id)) : null;
  chk(await sb.from("lixeira").insert({ colecao: col, registro_id: id, dados: rec, fotos, excluido_por: user }));
  chk(await sb.from(col).delete().eq("id", id));
}

// ---------- fotos (guardadas como data URL no banco) ----------
export const listarFotos = async (rid) => chk(await sb.from("fotos").select("id,nome,conteudo").eq("rnc_id", rid).order("id"));
export async function salvarFoto(rid, file) {
  const url = await reduzirImagem(file);
  chk(await sb.from("fotos").insert({ rnc_id: rid, nome: file.name, conteudo: url }));
}
export async function excluirFoto(id) { chk(await sb.from("fotos").delete().eq("id", id)); }
function reduzirImagem(file, max = 1600) {
  return new Promise((ok, erro) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => erro(new Error(`Formato não suportado: ${file.name}`)); img.src = u;
  });
}
