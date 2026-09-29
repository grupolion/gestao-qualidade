// Camada de dados (Supabase) — equivalente ao storage.py do app Streamlit.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm";
import * as K from "./cripto.js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMINIO } from "./config.js";

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: "gq-sessao",
    // evita travamento do lock de sessão (requisições só voltavam ao trocar de aba)
    lock: async (_n, _t, fn) => await fn() } });

export class ConflictError extends Error {}
const email = (login) => `${login.trim().toLowerCase()}@${EMAIL_DOMINIO}`;
const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------- criptografia (custos + ficha técnica) ----------
let _dek = null, _ativa = false;
const SENS = /^(custo|horas_|pecas_subst|valor)/;
const CFG_SENS = ["setor_params", "maquinas", "pecas", "parametros"];
export const criptoAtiva = () => _ativa;
export const temChave = () => !!_dek;
async function verAtiva() { _ativa = !!chk(await sb.rpc("cripto_ativa")); return _ativa; }
async function cifrarDados(d) {
  if (!_ativa) return d;
  if (!_dek) throw new Error("Sem chave de criptografia nesta sessão. Saia e entre novamente.");
  const o = {}, x = {};
  for (const [k, v] of Object.entries(d)) (SENS.test(k) ? x : o)[k] = v;
  if (Object.keys(x).length) o._c = await K.cifrar(_dek, x);
  return o;
}
async function decifrarDados(d) {
  if (!d || !K.cifrado(d._c)) return d;
  const { _c, ...o } = d;
  if (!_dek) return o; // sem chave: custos simplesmente não aparecem
  try { return { ...o, ...(await K.decifrar(_dek, _c)) }; } catch { return o; }
}
async function carregarChave(user, senha) {
  _dek = null;
  if (!(await verAtiva())) return;
  if (senha) {
    const reg = chk(await sb.from("chaves_usuario").select("*").eq("user_id", user.id).maybeSingle());
    if (reg) { _dek = await K.desembrulhar(reg, senha); await K.guardarLocal(user.id, _dek); }
  } else _dek = await K.lerLocal(user.id);
}
async function embrulharPara(uid, senha) {
  if (!_dek) return;
  chk(await sb.from("chaves_usuario").upsert({ user_id: uid, ...(await K.embrulhar(_dek, senha)), atualizado_em: new Date().toISOString() }));
}

// ---------- autenticação ----------
export async function entrar(login, senha, manter) {
  localStorage.setItem("gq-manter", manter ? "1" : "0");
  sessionStorage.setItem("gq-viva", "1");
  const { error } = await sb.auth.signInWithPassword({ email: email(login), password: senha });
  if (error) throw new Error("Login ou senha inválidos.");
  const p = await meuPerfil();
  const { data: { user } } = await sb.auth.getUser();
  await carregarChave(user, senha);
  if (_ativa && !_dek) { await sb.auth.signOut(); throw new Error("Seu acesso ainda não foi liberado. Peça ao administrador para redefinir sua senha."); }
  return p;
}
export async function sair() { _dek = null; await K.limparLocal(); await sb.auth.signOut(); }
export async function sessaoAtual() {
  // "Manter conectado" desmarcado → sessão só vale enquanto a aba/navegador estiver aberto
  if (localStorage.getItem("gq-manter") === "0" && !sessionStorage.getItem("gq-viva")) { await sb.auth.signOut(); return null; }
  const { data } = await sb.auth.getSession();
  if (!data.session) return null;
  const p = await meuPerfil();
  await carregarChave(data.session.user, null);
  if (_ativa && !_dek) { await sb.auth.signOut(); return null; } // força novo login para liberar a chave
  return p;
}
export async function meuPerfil() {
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
  const { data: { user } } = await sb.auth.getUser();
  await embrulharPara(user.id, nova);
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
  await embrulharPara(data.user.id, senha);
}
export async function salvarPerfil(id, campos) { chk(await sb.from("perfis").update(campos).eq("id", id)); }
export async function definirSenha(id, senha) { chk(await sb.rpc("admin_definir_senha", { uid: id, senha })); await embrulharPara(id, senha); }
export async function excluirUsuario(id) { chk(await sb.rpc("admin_excluir_usuario", { uid: id })); }

// ---------- configuração ----------
export async function carregarConfig() {
  const rows = chk(await sb.from("config").select("chave,valor"));
  const cfg = { setores: [], setor_params: {}, parametros: {}, colaboradores: [], centros_custo: [], maquinas: [], pecas: [], defeitos: {} };
  for (const r of rows) {
    let v = r.valor;
    if (K.cifrado(v?._c)) { try { v = _dek ? await K.decifrar(_dek, v._c) : undefined; } catch { v = undefined; } }
    if (v !== undefined) cfg[r.chave] = v;
  }
  cfg.parametros = { custo_hora_padrao: 60, refresh_segundos: 30, ...cfg.parametros };
  return cfg;
}
export async function salvarConfig(chave, valor) {
  if (_ativa && CFG_SENS.includes(chave)) {
    if (!_dek) throw new Error("Sem chave de criptografia nesta sessão.");
    valor = { _c: await K.cifrar(_dek, valor) };
  }
  chk(await sb.from("config").upsert({ chave, valor }));
}

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
  for (let r of rows) {
    if (K.cifrado(r.partes?._c)) {
      if (!_dek) continue;
      try { r = { ...r, ...(await K.decifrar(_dek, r.partes._c)) }; } catch { continue; }
    }
    produtos[r.codigo] = { codigo: r.codigo, nome: r.nome, valor: +r.valor || 0, familia: r.familia, grupo: r.grupo };
    partes[r.codigo] = r.partes || {};
  }
  return (_ficha = { produtos, partes });
}
async function cifrarFicha(r) {
  if (!_ativa) return r;
  if (!_dek) throw new Error("Sem chave de criptografia nesta sessão.");
  const { codigo, ...resto } = r;
  return { codigo, nome: "", valor: null, familia: null, grupo: null, partes: { _c: await K.cifrar(_dek, resto) } };
}
export async function importarFicha(lista) {
  lista = await Promise.all(lista.map(cifrarFicha));
  for (let i = 0; i < lista.length; i += 50) chk(await sb.from("ficha_produtos").upsert(lista.slice(i, i + 50)));
}

// ---------- registros (rnc / acoes) ----------
export async function listar(col) {
  const out = []; let de = 0;
  for (;;) {
    const lote = chk(await sb.from(col).select("id,dados,versao").order("id").range(de, de + 999));
    for (const r of lote) out.push({ ...(await decifrarDados(r.dados)), id: r.id, versao: r.versao }); if (lote.length < 1000) break; de += 1000;
  }
  return out;
}
export async function obter(col, id) {
  const r = chk(await sb.from(col).select("id,dados,versao").eq("id", id).maybeSingle());
  return r ? { ...(await decifrarDados(r.dados)), id: r.id, versao: r.versao } : null;
}
const agora = () => new Date().toISOString().slice(0, 19);

// Salva com histórico e controle de versão otimista (igual storage.save_record)
export async function salvar(col, rec, user) {
  rec = JSON.parse(JSON.stringify(rec));
  const hist = rec.historico || [];
  delete rec.historico;
  if (!rec.id) {
    rec.id = chk(await sb.rpc("proximo_id", { tipo: col }));
    rec.criado_em = agora(); rec.criado_por = user;
    const dados = { ...rec, historico: [{ em: agora(), por: user, acao: "criado" }] };
    delete dados.versao;
    chk(await sb.from(col).insert({ id: rec.id, dados: await cifrarDados(dados), versao: 1 }));
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
  const r = chk(await sb.from(col).update({ dados: await cifrarDados(dados), versao: nv, atualizado_em: new Date().toISOString() })
    .eq("id", rec.id).eq("versao", velho.versao).select("id"));
  if (!r.length) throw new ConflictError("Registro alterado por outro usuário. Recarregue antes de salvar.");
  return { ...dados, id: rec.id, versao: nv };
}
export async function excluir(col, id, user) {
  const rec = await obter(col, id);
  if (!rec) return;
  const fotos = col === "rnc" ? chk(await sb.from("fotos").select("nome,conteudo").eq("rnc_id", id)) : null;
  chk(await sb.from("lixeira").insert({ colecao: col, registro_id: id, dados: await cifrarDados(rec), fotos, excluido_por: user }));
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

// ---------- administração da chave mestra ----------
// Ativa: gera a chave de dados, protege com a chave mestra e com a senha do admin, e cifra o que já existe.
export async function ativarCriptografia(mestra, senhaAdmin, progresso = () => {}) {
  if (await verAtiva()) throw new Error("A criptografia já está ativa.");
  if (!mestra || mestra.length < 12) throw new Error("A chave mestra precisa de pelo menos 12 caracteres.");
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: senhaAdmin });
  if (error) throw new Error("Senha do administrador incorreta.");
  progresso("Lendo dados atuais...");
  const cfg = await carregarConfig(), ficha = await carregarFicha(true);
  const regs = {}; for (const c of ["rnc", "acoes"]) regs[c] = await listar(c);
  _dek = await K.gerarDEK();
  chk(await sb.from("chaves").insert({ id: "mestra", ...(await K.embrulhar(_dek, mestra)) }));
  _ativa = true;
  await embrulharPara(user.id, senhaAdmin);
  await K.guardarLocal(user.id, _dek);
  progresso("Cifrando configurações...");
  for (const k of CFG_SENS) await salvarConfig(k, cfg[k]);
  for (const c of ["rnc", "acoes"]) {
    progresso(`Cifrando ${c}...`);
    for (const r of regs[c]) { const { id, versao, ...d } = r; chk(await sb.from(c).update({ dados: await cifrarDados(d) }).eq("id", id)); }
  }
  progresso("Cifrando ficha técnica...");
  const lista = Object.values(ficha.produtos).map((p) => ({ ...p, partes: ficha.partes[p.codigo] || {} }));
  await importarFicha(lista); _ficha = null;
  progresso("Concluído.");
}
// Recupera o acesso do admin com a chave mestra (ex.: a senha foi redefinida)
export async function recuperarComMestra(mestra, senhaAtual) {
  const reg = chk(await sb.from("chaves").select("*").eq("id", "mestra").maybeSingle());
  if (!reg) throw new Error("A criptografia não está ativa.");
  _dek = await K.desembrulhar(reg, mestra);
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: senhaAtual });
  if (error) { _dek = null; throw new Error("Senha atual incorreta."); }
  await embrulharPara(user.id, senhaAtual); await K.guardarLocal(user.id, _dek);
}
// Confere a chave mestra (sem alterar nada). Lança erro se estiver incorreta.
export async function verificarMestra(mestra) {
  const reg = chk(await sb.from("chaves").select("*").eq("id", "mestra").maybeSingle());
  if (!reg) throw new Error("A criptografia não está ativa — ative-a em 🔒 Segurança para usar esta função.");
  try { await K.desembrulhar(reg, mestra); } catch { throw new Error("Chave mestra incorreta."); }
}
// Apaga definitivamente todos os apontamentos/RNCs e ações (fotos saem junto, em cascata)
export async function apagarTodosDados(mestra) {
  await verificarMestra(mestra);
  chk(await sb.from("acoes").delete().neq("id", ""));
  chk(await sb.from("rnc").delete().neq("id", ""));
}
export async function usuariosSemChave() {
  if (!_ativa) return [];
  const com = new Set(chk(await sb.from("chaves_usuario").select("user_id")).map((r) => r.user_id));
  return (await listarPerfis()).filter((p) => !com.has(p.id));
}
