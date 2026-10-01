import * as db from './db.js?v=20261001-busca4';
import { esc, $, $$, card, row, inp, isel, alerta, toast } from './ui.js?v=20261001-busca4';
import { fluxoProcessos, catalogoProcessos, erroFluxo } from './retrabalho.js?v=20261001-busca4';

const rascunhos = new WeakMap();
const novoProcesso = () => [`proc-${crypto.randomUUID()}`, '', ''];
function inicial(S) {
  const nodes = catalogoProcessos(S.cfg);
  return structuredClone(fluxoProcessos(S.cfg)).map(g => g.map(([id, nome, setor]) => [id, nome, setor || nodes.find(n => n.id === id)?.setor || nome]));
}
function previa(grupos) {
  return `<div class="rt-flow">${grupos.map((g, i) => `<div class="rt-stage"><div class="rt-stage-label">${i + 1}${g.length > 1 ? ' · Em paralelo' : ''}</div><div class="rt-branches${g.length > 1 ? ' parallel' : ''}">${g.map(n => `<div class="rt-node"><span>${esc(n[1] || 'Novo processo')}<small>${esc(n[2] || 'Selecione o setor')}</small></span></div>`).join('')}</div></div>${i < grupos.length - 1 ? '<div class="rt-arrow" aria-hidden="true">↓</div>' : ''}`).join('')}</div>`;
}
export function editorFluxo(box, { S }, again) {
  if (!rascunhos.has(S)) rascunhos.set(S, inicial(S));
  const grupos = rascunhos.get(S);
  const setores = [...new Set([...Object.keys(S.cfg.setores || {}), ...catalogoProcessos(S.cfg).map(n => n.setor)])];
  const desenhar = () => editorFluxo(box, { S }, again);
  box.innerHTML = alerta('info', 'Cada etapa é um ponto da sequência. Processos dentro da mesma etapa são paralelos. Você pode repetir um setor em etapas diferentes. O setor define as taxas e as máquinas; o nome define o texto mostrado no diagrama.') +
    `<div class="btnrow"><button class="btn" id="fluxo-add">+ Adicionar etapa</button><button class="btn primary" id="fluxo-save">Salvar diagrama</button><button class="btn" id="fluxo-discard">Descartar alterações</button></div><div id="fluxo-msg" role="status"></div>` +
    `<p class="caption">Alterações passam a valer após salvar. Para cadastrar um novo setor ou sua taxa, use Setores e metas; para as máquinas, use Máquinas. Registros existentes conservam seus processos e custos.</p>` +
    grupos.map((g, i) => card(`<div class="btnrow"><button class="btn sm" data-fup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover etapa ${i + 1} para cima">↑ Subir</button><button class="btn sm" data-fdown="${i}" ${i === grupos.length - 1 ? 'disabled' : ''} aria-label="Mover etapa ${i + 1} para baixo">↓ Descer</button><button class="btn sm danger" data-fgroup-rm="${i}">Remover etapa</button></div>` +
      g.map((n, j) => `<div class="fluxo-processo">${row('c3', inp(`fn.${i}.${j}`, 'Nome no diagrama', n[1]), isel(`fs.${i}.${j}`, 'Setor (taxas e máquinas)', setores, n[2], { ph: 'Selecione…' }), isel(`fg.${i}.${j}`, 'Etapa / posição', grupos.map((_, k) => [String(k), `${k + 1} · ${k === i ? 'Etapa atual' : 'Mover para esta etapa'}`]), String(i)))}<button class="btn sm danger" data-fnode-rm="${i}.${j}">Remover processo</button></div>`).join('') +
      `<button class="btn" data-fparallel="${i}">+ Adicionar processo em paralelo</button>`, `${i + 1} · ${g.length > 1 ? 'Processos em paralelo' : 'Etapa sequencial'}`)).join('') +
    `<button class="btn" id="fluxo-add-bottom">+ Adicionar etapa</button>` + card(`<div id="fluxo-preview">${previa(grupos)}</div>`, 'Prévia do diagrama') + `<button class="btn primary" id="fluxo-save-bottom">Salvar diagrama</button>`;
  const preview = () => { $('#fluxo-preview', box).innerHTML = previa(grupos); };
  $$('[data-k^="fn."]', box).forEach(input => input.addEventListener('input', () => { const [, i, j] = input.dataset.k.split('.'); grupos[+i][+j][1] = input.value; preview(); }));
  $$('[data-k^="fs."]', box).forEach(input => input.addEventListener('change', () => { const [, i, j] = input.dataset.k.split('.'); const n = grupos[+i][+j]; n[2] = input.value; if (!n[1].trim()) n[1] = input.value; desenhar(); }));
  $$('[data-k^="fg."]', box).forEach(input => input.addEventListener('change', () => { const [, i, j] = input.dataset.k.split('.'), alvo = grupos[+input.value]; if (alvo === grupos[+i]) return; alvo.push(grupos[+i].splice(+j, 1)[0]); if (!grupos[+i].length) grupos.splice(+i, 1); desenhar(); }));
  for (const [attr, action] of Object.entries({ fup: i => { if (i > 0) [grupos[i - 1], grupos[i]] = [grupos[i], grupos[i - 1]]; }, fdown: i => { if (i < grupos.length - 1) [grupos[i + 1], grupos[i]] = [grupos[i], grupos[i + 1]]; }, 'fgroup-rm': i => grupos.splice(i, 1), 'fnode-rm': (i, j) => { grupos[i].splice(j, 1); if (!grupos[i].length) grupos.splice(i, 1); }, fparallel: i => grupos[i].push(novoProcesso()) })) {
    $$(`[data-${attr}]`, box).forEach(b => b.onclick = () => { action(...b.getAttribute(`data-${attr}`).split('.').map(Number)); desenhar(); });
  }
  const adicionar = () => { grupos.push([novoProcesso()]); desenhar(); };
  $('#fluxo-add', box).onclick = adicionar; $('#fluxo-add-bottom', box).onclick = adicionar;
  $('#fluxo-discard', box).onclick = () => { rascunhos.delete(S); desenhar(); };
  const salvar = async () => {
    const dados = grupos.map(g => g.map(([id, nome, setor]) => [id, nome.trim(), setor.trim()]));
    const erro = erroFluxo(dados);
    if (erro) { $('#fluxo-msg', box).innerHTML = alerta('error', esc(erro)); $('#fluxo-msg', box).scrollIntoView({ block: 'center' }); return; }
    const buttons = [$('#fluxo-save', box), $('#fluxo-save-bottom', box)]; buttons.forEach(b => b.disabled = true);
    try { await db.salvarConfig('fluxo_retrabalho', { versao: 1, grupos: dados }); rascunhos.delete(S); toast('Diagrama salvo.'); await again(); }
    catch (e) { $('#fluxo-msg', box).innerHTML = alerta('error', esc(e.message)); buttons.forEach(b => b.disabled = false); }
  };
  $('#fluxo-save', box).onclick = salvar; $('#fluxo-save-bottom', box).onclick = salvar;
}
