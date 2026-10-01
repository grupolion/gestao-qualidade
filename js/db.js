// Camada de dados (Supabase) — equivalente ao storage.py do app Streamlit.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import * as K from "./cripto.js?v=20261001-busca4";
import { SUPABASE_URL, SUPABASE_ANON_KEY, EMAIL_DOMINIO } from "./config.js?v=20261001-busca4";

const sessionStore = {
  getItem(key) {
    if (localStorage.getItem("gq-manter") === "1") return localStorage.getItem(key);
    localStorage.removeItem(key); // remove tokens persisted by older releases
    return sessionStorage.getItem(key);
  },
  setItem(key, value) {
    const keep = localStorage.getItem("gq-manter") === "1";
    (keep ? sessionStorage : localStorage).removeItem(key);
    (keep ? localStorage : sessionStorage).setItem(key, value);
  },
  removeItem(key) { localStorage.removeItem(key); sessionStorage.removeItem(key); }
};

export const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, storageKey: "gq-sessao", storage: sessionStore,
    // evita travamento do lock de sessão (requisições só voltavam ao trocar de aba)
    lock: async (_n, _t, fn) => await fn() } });

export class ConflictError extends Error {}
export const DICA_SENHA = "Mínimo de 8 caracteres, com letra maiúscula (A-Z), minúscula (a-z) e caractere especial (ex.: !, @, #).";
export function erroSenha(senha) {
  if (typeof senha !== "string" || [...senha].length < 8 ||
      !/[A-Z]/.test(senha) || !/[a-z]/.test(senha) || !/[!-/:-@\[-`{-~]/.test(senha))
    return DICA_SENHA;
  if (new TextEncoder().encode(senha).length > 72) return "A senha excede o tamanho máximo permitido (72 bytes).";
  return "";
}
function exigirNovaSenha(senha) { const erro = erroSenha(senha); if (erro) throw new Error(erro); }
const email = (login) => `${login.trim().toLowerCase()}@${EMAIL_DOMINIO}`;
const chk = ({ data, error }) => { if (error) throw new Error(error.message); return data; };

// ---------- criptografia (custos + ficha técnica) ----------
let _dek = null, _ativa = false;
const SENS = /^(custo|horas_|pecas_subst|processos_retrabalho|valor)/;
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
  if (!_dek) throw new Error("Entre novamente para acessar os dados cifrados.");
  return { ...o, ...(await K.decifrar(_dek, _c)) };
}
async function carregarChave(user, senha) {
  _dek = null;
  if (!(await verAtiva())) { await K.limparLocal(); return; }
  if (senha) {
    const reg = chk(await sb.from("chaves_usuario").select("*").eq("user_id", user.id).maybeSingle());
    if (reg) { _dek = await K.desembrulhar(reg, senha); await K.guardarLocal(user.id, _dek); }
  } else _dek = await K.lerLocal(user.id);
}
async function chaveParaProvisionar(senha) {
  if (!(await verAtiva())) return null;
  const p = await meuPerfil();
  if (p?.perfil !== "admin") throw new Error("Somente administrador.");
  const reg = chk(await sb.from("chaves_usuario").select("*").eq("user_id", p.id).single());
  return K.desembrulhar(reg, senha, true); // temporary; never persisted
}
async function embrulharPara(uid, senha, chave) {
  if (!chave) return;
  chk(await sb.from("chaves_usuario").upsert({ user_id: uid, ...(await K.embrulhar(chave, senha)), atualizado_em: new Date().toISOString() }));
}

// ---------- autenticação ----------
export async function entrar(login, senha, manter) {
  await K.limparLocal();
  localStorage.setItem("gq-manter", manter ? "1" : "0");
  sessionStorage.setItem("gq-viva", "1");
  try {
    const { error } = await sb.auth.signInWithPassword({ email: email(login), password: senha });
    if (error) throw new Error("Login ou senha inválidos.");
    const p = await meuPerfil();
    const { data: { user } } = await sb.auth.getUser();
    try { await carregarChave(user, senha); }
    catch (e) { if (p.perfil !== "admin" || !_ativa) throw e; }
    if (_ativa && !_dek && p.perfil !== "admin") throw new Error("Seu acesso ainda não foi liberado. Peça ao administrador para redefinir sua senha.");
    return p;
  } catch (e) { await sair(); throw e; }
}
export async function sair() {
  _dek = null; _ficha = null;
  sessionStorage.removeItem("gq-viva");
  await K.limparLocal();
  await sb.auth.signOut();
}
export async function sessaoAtual() {
  try {
    if (localStorage.getItem("gq-manter") !== "1" && !sessionStorage.getItem("gq-viva")) { await sair(); return null; }
    const { data } = await sb.auth.getSession();
    if (!data.session) { await K.limparLocal(); return null; }
    const p = await meuPerfil();
    await carregarChave(data.session.user, null);
    if (_ativa && !_dek && p.perfil !== "admin") { await sair(); return null; }
    return p;
  } catch (e) { await sair(); throw e; }
}
export async function meuPerfil() {
  const { data: { user } } = await sb.auth.getUser();
  if (!user) { await sair(); return null; }
  const p = chk(await sb.from("perfis").select("*").eq("id", user.id).maybeSingle());
  if (!p || !p.ativo) { await sair(); throw new Error("Usuário inativo."); }
  return p;
}
export async function trocarSenha(atual, nova, login) {
  exigirNovaSenha(nova);
  const p = await meuPerfil();
  if (!p) throw new Error("Entre novamente.");
  let chave = null;
  if (await verAtiva()) {
    const reg = chk(await sb.from("chaves_usuario").select("*").eq("user_id", p.id).single());
    chave = await K.embrulhar(await K.desembrulhar(reg, atual, true), nova);
  }
  chk(await sb.rpc("trocar_senha_segura", { atual, nova, chave }));
  await sair();
}

// ---------- usuários (admin) ----------
export const listarPerfis = async () => chk(await sb.from("perfis").select("*").order("login"));
export async function criarUsuario({ login, nome, senha, perfil, setores, senhaAdmin }) {
  exigirNovaSenha(senha);
  const chave = await chaveParaProvisionar(senhaAdmin);
  const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, storageKey: "gq-tmp" } });
  const { data, error } = await tmp.auth.signUp({ email: email(login), password: senha });
  if (error) throw new Error(/registered/i.test(error.message) ? `O login '${login}' já existe.` : error.message);
  if (!data.user?.id) throw new Error("Não foi possível criar o usuário.");
  // Keep the account inactive until its encryption envelope exists.
  await embrulharPara(data.user.id, senha, chave);
  await salvarPerfil(data.user.id, { nome, perfil, setores, ativo: true }, senhaAdmin);
}
export async function salvarPerfil(id, campos, senhaAdmin) {
  chk(await sb.rpc("admin_salvar_perfil", { uid: id, campos, senha_admin: senhaAdmin }));
}
export async function definirSenha(id, senha, senhaAdmin) {
  exigirNovaSenha(senha);
  const dek = await chaveParaProvisionar(senhaAdmin);
  const chave = dek ? await K.embrulhar(dek, senha) : null;
  chk(await sb.rpc("admin_definir_senha_segura", { uid: id, senha, chave, senha_admin: senhaAdmin }));
}
export async function excluirUsuario(id, senhaAdmin) { chk(await sb.rpc("admin_excluir_usuario_seguro", { uid: id, senha_admin: senhaAdmin })); }

// ---------- configuração ----------
export async function carregarConfig() {
  const rows = chk(await sb.from("config").select("chave,valor"));
  const cfg = { setores: [], setor_params: {}, parametros: {}, colaboradores: [], centros_custo: [], maquinas: [], pecas: [], defeitos: {} };
  for (const r of rows) {
    let v = r.valor;
    if (K.cifrado(v?._c)) {
      if (!_dek) throw new Error("Entre novamente para acessar a configuração cifrada.");
      v = await K.decifrar(_dek, v._c);
    }
    if (v !== undefined) cfg[r.chave] = v;
  }
  cfg.parametros = { custo_hora_padrao: 60, refresh_segundos: 30, ...cfg.parametros };
  return cfg;
}
export async function salvarConfig(chave, valor) {
  await verAtiva();
  if (_ativa && CFG_SENS.includes(chave)) {
    if (!_dek) throw new Error("Sem chave de criptografia nesta sessão.");
    valor = { _c: await K.cifrar(_dek, valor) };
  }
  chk(await sb.from("config").upsert({ chave, valor }));
}

// ---------- ficha técnica ----------
let _ficha = null;
sb.auth.onAuthStateChange(event => {
  if (event === "SIGNED_OUT") { _dek = null; _ficha = null; void K.limparLocal(); }
});
export function limparCache() { _ficha = null; }
// versão da ficha técnica (marcada pelo admin ao importar) — usada para avisar os usuários
export async function fichaVersao() {
  const { data } = await sb.from("config").select("valor").eq("chave", "ficha_versao").maybeSingle();
  return data?.valor ?? null;
}
export async function carregarFicha(forcar = false) {
  if (_ficha && !forcar) return _ficha;
  const rows = []; let de = 0;
  for (;;) {
    const lote = chk(await sb.from("ficha_produtos").select("*").order("codigo").range(de, de + 999));
    rows.push(...lote); if (lote.length < 1000) break; de += 1000;
  }
  const produtos = {}, partes = {};
  // decifra todas as linhas em paralelo (antes era uma por vez)
  const lista = await Promise.all(rows.map(async (r) => {
    if (!K.cifrado(r.partes?._c)) return r;
    if (!_dek) throw new Error("Entre novamente para acessar a ficha cifrada.");
    return { ...r, ...(await K.decifrar(_dek, r.partes._c)) };
  }));
  for (const r of lista) {
    if (!r) continue;
    const { _area, _linhas, ...pts } = r.partes || {};
    produtos[r.codigo] = { codigo: r.codigo, nome: r.nome, valor: +r.valor || 0, familia: r.familia, grupo: r.grupo, linhas: _linhas || [] };
    partes[r.codigo] = pts;
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
  await verAtiva();
  lista = await Promise.all(lista.map(cifrarFicha));
  for (let i = 0; i < lista.length; i += 50) chk(await sb.from("ficha_produtos").upsert(lista.slice(i, i + 50)));
}

// ---------- registros (rnc / acoes) ----------
export async function listar(col) {
  const out = []; let de = 0;
  for (;;) {
    const lote = chk(await sb.from(col).select("id,dados,versao").order("id").range(de, de + 999));
    // decifra o lote em paralelo (no celular, uma por vez era o gargalo)
    out.push(...(await Promise.all(lote.map(async (r) => ({ ...(await decifrarDados(r.dados)), id: r.id, versao: r.versao })))));
    if (lote.length < 1000) break; de += 1000;
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
  await verAtiva();
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
  chk(await sb.rpc("excluir_registro_seguro", { colecao: col, registro: id }));
}

// ---------- fotos (guardadas como data URL no banco) ----------
export const listarFotos = async (rid) => chk(await sb.from("fotos").select("id,nome,conteudo").eq("rnc_id", rid).order("id"));
export async function salvarFoto(rid, file) {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type) || file.size > 10 * 1024 * 1024)
    throw new Error("Envie uma imagem JPEG, PNG, WebP ou GIF de até 10 MB.");
  const url = await reduzirImagem(file);
  chk(await sb.from("fotos").insert({ rnc_id: rid, nome: file.name, conteudo: url }));
}
export async function excluirFoto(id) { chk(await sb.from("fotos").delete().eq("id", id)); }
function reduzirImagem(file, max = 1600) {
  return new Promise((ok, erro) => {
    const img = new Image(); const u = URL.createObjectURL(file);
    img.onload = () => {
      if (img.width * img.height > 40000000) { URL.revokeObjectURL(u); erro(new Error("Imagem excede 40 megapixels.")); return; }
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u);
      ok(c.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(u); erro(new Error(`Formato não suportado: ${file.name}`)); }; img.src = u;
  });
}

// ---------- administração da chave mestra ----------
// Ativa: gera a chave de dados, protege com a chave mestra e com a senha do admin, e cifra o que já existe.
export async function criptoPendente() { return chk(await sb.rpc("cripto_pendente")); }
export async function ativarCriptografia(mestra, senhaAdmin, progresso = () => {}) {
  const p = await meuPerfil();
  if (p?.perfil !== "admin") throw new Error("Somente administrador.");
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: senhaAdmin });
  if (error) throw new Error("Senha do administrador incorreta.");
  const existente = chk(await sb.from("chaves").select("*").eq("id", "mestra").maybeSingle());
  if (!existente && (!mestra || mestra.length < 12)) throw new Error("A chave mestra precisa de pelo menos 12 caracteres.");
  const chave = existente ? await K.desembrulhar(existente, mestra, true) : await K.gerarDEK();
  if (!existente) {
    chk(await sb.rpc("preparar_criptografia", {
      mestra: await K.embrulhar(chave, mestra), usuario: await K.embrulhar(chave, senhaAdmin)
    }));
  } else await embrulharPara(user.id, senhaAdmin, chave);
  _dek = await K.chaveDeUso(chave); _ativa = true;
  await K.guardarLocal(user.id, _dek);
  // Resume with the same DEK. Compare entire original rows in the server RPC.
  for (const tabela of ["config", "rnc", "acoes", "lixeira", "ficha_produtos"]) {
    progresso(`Verificando e cifrando ${tabela}...`);
    const pk = tabela === "config" ? "chave" : tabela === "ficha_produtos" ? "codigo" : "id";
    let de = 0;
    for (;;) {
      const lote = chk(await sb.from(tabela).select("*").order(pk).range(de, de + 99));
      for (const row of lote) {
        let novo;
        if (tabela === "config") {
          if (!CFG_SENS.includes(row.chave) || K.cifrado(row.valor?._c)) continue;
          novo = { ...row, valor: { _c: await K.cifrar(_dek, row.valor) } };
        } else if (tabela === "ficha_produtos") {
          if (K.cifrado(row.partes?._c)) continue;
          novo = await cifrarFicha(row);
        } else {
          if (!Object.keys(row.dados).some(k => SENS.test(k))) continue;
          novo = { ...row, dados: await cifrarDados(await decifrarDados(row.dados)) };
        }
        chk(await sb.rpc("migrar_cifra", { tabela, original: row, novo }));
      }
      if (lote.length < 100) break;
      de += 100;
    }
  }
  _ficha = null;
  if (await criptoPendente()) throw new Error("Há dados pendentes. Execute novamente para concluir.");
  progresso("Migração verificada e concluída.");
}
export async function recuperarComMestra(mestra, senhaAtual) {
  const p = await meuPerfil();
  if (p?.perfil !== "admin") throw new Error("Somente administrador.");
  const { data: { user } } = await sb.auth.getUser();
  const { error } = await sb.auth.signInWithPassword({ email: user.email, password: senhaAtual });
  if (error) throw new Error("Senha atual incorreta.");
  const reg = chk(await sb.from("chaves").select("*").eq("id", "mestra").single());
  const chave = await K.desembrulhar(reg, mestra, true);
  await embrulharPara(user.id, senhaAtual, chave);
  _dek = await K.chaveDeUso(chave);
  await K.guardarLocal(user.id, _dek);
}
// Confere a chave mestra (sem alterar nada). Lança erro se estiver incorreta.
export async function verificarMestra(mestra) {
  const reg = chk(await sb.from("chaves").select("*").eq("id", "mestra").maybeSingle());
  if (!reg) throw new Error("A criptografia não está ativa — ative-a em 🔒 Segurança para usar esta função.");
  try { await K.desembrulhar(reg, mestra); } catch { throw new Error("Chave mestra incorreta."); }
}
// Apaga definitivamente todos os apontamentos/RNCs e ações (fotos saem junto, em cascata)
export async function apagarTodosDados(mestra, senhaAtual) {
  await verificarMestra(mestra);
  chk(await sb.rpc("admin_apagar_dados", { senha_atual: senhaAtual }));
}
export async function usuariosSemChave() {
  if (!_ativa) return [];
  const com = new Set(chk(await sb.from("chaves_usuario").select("user_id")).map((r) => r.user_id));
  return (await listarPerfis()).filter((p) => !com.has(p.id));
}
