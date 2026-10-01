import { num, esc, brl, card, row, inum, isel, icombo, ichk, alerta, $, $$, comboValor } from './ui.js?v=20261001-diagrama2';

export function processoLinha(setor) {
  const s = String(setor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('pintura')) return { k: 'p', nome: 'pintura', param: 'valor_m2_pintura', padrao: 79 };
  if (s.includes('banho') || s.includes('quimic')) return { k: 'b', nome: 'banho químico', param: 'valor_m2_banho', padrao: 24 };
  return null;
}
const positivo = v => Math.max(0, num(v));
const centavos = v => Math.round(v * 100) / 100;
const normalizar = v => String(v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
export const FLUXO_RETRABALHO = [
  [['corte-tubo', 'Corte de Tubo'], ['corte-chapa', 'Corte de Chapa']],
  [['dobra-tubo', 'Dobra de Tubo'], ['dobra-chapa', 'Dobra de Chapa']],
  [['usinagem', 'Usinagem']],
  [['ponteamento', 'Ponteamento da Estrutura'], ['solda-robo', 'Solda em Robô']],
  [['solda-manual-1', 'Solda Manual']],
  [['montagem-estrutura', 'Montagem da Estrutura']],
  [['solda-manual-2', 'Solda Manual']],
  [['acabamento', 'Acabamento']],
  [['banho', 'Banho']],
  [['pintura', 'Pintura']],
  [['tapecaria', 'Tapeçaria'], ['montagem-final', 'Montagem Final']],
  [['montagem-carenagem', 'Montagem da Carenagem']],
  [['inspecao-final', 'Inspeção Final']]
];
const selecoes = new WeakMap(); // seleção provisória pertence ao registro em edição, não ao banco
export function catalogoProcessos(cfg, ps = []) {
  const setores = Object.keys(cfg.setores || {});
  const nodes = FLUXO_RETRABALHO.flat().map(([id, nome]) => {
    const fixo = processoLinha(nome);
    const setor = setores.find(s => normalizar(s) === normalizar(nome)) ||
      (fixo ? setores.find(s => processoLinha(s)?.k === fixo.k) : nome === 'Solda Manual' ? setores.find(s => normalizar(s) === 'solda') : null) || nome;
    return { id, nome, setor };
  });
  for (const setor of [...setores, ...ps.map(p => p.setor)]) {
    if (!nodes.some(n => n.setor === setor || (processoLinha(setor) && processoLinha(n.setor)?.k === processoLinha(setor)?.k))) nodes.push({ id: `extra:${setor}`, nome: setor, setor });
  }
  return nodes;
}
function idsAplicados(ps, nodes) {
  const usados = new Set();
  for (const p of ps) {
    const n = nodes.find(n => n.id === p.etapa_id) || nodes.find(n => n.setor === p.setor && !usados.has(n.id));
    if (n) usados.add(n.id);
  }
  return usados;
}
function selecaoAtual(r, cfg) {
  if (!selecoes.has(r)) selecoes.set(r, { ids: idsAplicados(r.processos_retrabalho, catalogoProcessos(cfg, r.processos_retrabalho)), aberta: !r.processos_retrabalho.length });
  return selecoes.get(r);
}
export function selecaoPendente(r, cfg) {
  const estado = selecoes.get(r); if (!estado) return false;
  const ids = new Set(estado.ids); if (ids.has('banho')) ids.add('pintura');
  const aplicados = idsAplicados(r.processos_retrabalho, catalogoProcessos(cfg, r.processos_retrabalho));
  return ids.size !== aplicados.size || [...ids].some(id => !aplicados.has(id));
}
export function aplicarProcessos(r, cfg, ids) {
  const nodes = catalogoProcessos(cfg, r.processos_retrabalho), selecionados = new Set(ids);
  if (selecionados.has('banho')) selecionados.add('pintura');
  const anteriores = new Map(), usados = new Set();
  for (const p of r.processos_retrabalho) {
    const node = nodes.find(n => n.id === p.etapa_id) || nodes.find(n => n.setor === p.setor && !usados.has(n.id));
    if (node) { anteriores.set(node.id, p); usados.add(node.id); }
  }
  const banho = r.processos_retrabalho.find(p => processoLinha(p.setor)?.k === 'b');
  r.processos_retrabalho = nodes.filter(n => selecionados.has(n.id)).map(n => {
    const p = anteriores.get(n.id) || { setor: n.setor, horas_homem: 0, maquinas: [], pecas: [], ...(n.id === 'pintura' && selecionados.has('banho') ? { mesmo_banho: true } : {}) };
    p.etapa_id = n.id;
    if (n.id === 'pintura' && !selecionados.has('banho') && p.mesmo_banho && banho) Object.assign(p, { metodo_proc: banho.metodo_proc, produto_inteiro: banho.produto_inteiro, peso_retrab: banho.peso_retrab, pecas: structuredClone(banho.pecas || []), mesmo_banho: false });
    return p;
  });
  selecoes.set(r, { ids: selecionados, aberta: false });
}
function diagramaProcessos(r, cfg, dis) {
  const nodes = catalogoProcessos(cfg, r.processos_retrabalho), estado = selecaoAtual(r, cfg);
  const ids = new Set(estado.ids); if (ids.has('banho')) ids.add('pintura');
  const botao = (id) => {
    const n = nodes.find(n => n.id === id), on = ids.has(id), obrigatoria = id === 'pintura' && ids.has('banho');
    return `<button type="button" class="rt-node${on ? ' selected' : ''}" data-rt-node="${esc(id)}" aria-pressed="${on}" ${dis || obrigatoria ? 'disabled' : ''}><span class="rt-check" aria-hidden="true">${on ? '✓' : '+'}</span><span>${esc(n.nome)}${id.startsWith('solda-manual') ? `<small>${id.endsWith('1') ? 'Antes' : 'Após'} a montagem da estrutura</small>` : obrigatoria ? '<small>Incluída pelo banho</small>' : ''}</span></button>`;
  };
  const extras = nodes.filter(n => n.id.startsWith('extra:'));
  return `<details class="rt-picker" ${estado.aberta ? 'open' : ''}><summary>Selecionar processos no diagrama <span class="rt-count">${ids.size} selecionado(s)</span></summary><p class="caption">Clique nas etapas realizadas. Processos lado a lado são paralelos. Depois clique em Aplicar processos.</p><div class="rt-flow" aria-label="Fluxo de produção">${FLUXO_RETRABALHO.map((grupo, i) => `<div class="rt-stage"><div class="rt-stage-label">${String(i + 1).padStart(2, '0')}${grupo.length > 1 ? ' · Em paralelo' : ''}</div><div class="rt-branches${grupo.length > 1 ? ' parallel' : ''}">${grupo.map(([id]) => botao(id)).join('')}</div></div>${i < FLUXO_RETRABALHO.length - 1 ? '<div class="rt-arrow" aria-hidden="true">↓</div>' : ''}`).join('')}</div>${extras.length ? `<div class="caption">Outros processos cadastrados</div><div class="rt-extras">${extras.map(n => botao(n.id)).join('')}</div>` : ''}${dis ? '' : '<div class="btnrow rt-apply"><button type="button" class="btn primary" id="rt-aplicar">Aplicar processos</button><span class="caption" id="rt-pendente" aria-live="polite"></span></div>'}</details>`;
}
export const maquinasSetor = (cfg, setor) => (cfg.maquinas || []).filter(m => m.setor === setor)
  .map(m => ({ ...m, codigo: m.nome || m.descricao || m.codigo }));
export function garantirPintura(r, setores) {
  const ps = r.processos_retrabalho;
  const banho = ps.findIndex(p => processoLinha(p.setor)?.k === 'b');
  if (banho < 0) return;
  const pintura = ps.findIndex(p => processoLinha(p.setor)?.k === 'p');
  if (pintura < 0) ps.push({ setor: setores.find(s => processoLinha(s)?.k === 'p') || 'Pintura', horas_homem: 0, maquinas: [], mesmo_banho: true });
  else if (pintura < banho) ps.splice(banho, 0, ps.splice(pintura, 1)[0]);
}
export function converterRetrabalho(r, setores) {
  r.processos_retrabalho = r.setor_origem ? [{ setor: r.setor_origem, horas_homem: num(r.horas_homem), custo_hora: num(r.custo_hora),
    maquinas: structuredClone(r.maquinas || []), metodo_proc: r.metodo_proc || 'pecas', produto_inteiro: !!r.produto_inteiro,
    peso_retrab: num(r.peso_retrab), pecas: structuredClone(r.pecas_subst || []), area_proc: num(r.area_proc),
    valor_m2: num(r.valor_m2), custo_processo: num(r.custo_processo) }] : [];
  garantirPintura(r, setores);
}
export function calcularProcessos(r, cfg, areaFicha) {
  for (const p of r.processos_retrabalho) {
    const proc = processoLinha(p.setor);
    if (proc) {
      const base = p.mesmo_banho && proc.k === 'p' ? r.processos_retrabalho.find(x => processoLinha(x.setor)?.k === 'b') || p : p;
      const areaMaq = areaFicha(r.produto, '', proc.k), peso = positivo(cfg.pesos_maquinas?.[r.produto]);
      const area = base.metodo_proc === 'peso' ? (peso ? areaMaq * positivo(base.peso_retrab) / peso : 0)
        : base.produto_inteiro ? areaMaq * positivo(r.qtd_nc)
        : (base.pecas || []).reduce((s, x) => s + positivo(x.qtd) * areaFicha(r.produto, x.chave, proc.k), 0);
      p.area_proc = Math.round(area * 1e4) / 1e4;
      p.valor_m2 = num(cfg.parametros?.[proc.param]) || proc.padrao;
      p.custo_processo = centavos(area * p.valor_m2);
    } else {
      p.custo_hora = num(cfg.setor_params?.[p.setor]?.hora_media) || num(cfg.parametros?.custo_hora_padrao);
      for (const m of p.maquinas || []) {
        const cadastro = maquinasSetor(cfg, p.setor).find(x => x.codigo === m.codigo);
        if (cadastro) m.valor_hora = num(cadastro.custo_hora);
      }
    }
  }
}
export function custosRetrabalho(r) {
  if (!Array.isArray(r.processos_retrabalho)) return { homem: num(r.horas_homem) * num(r.custo_hora), maquina: num(r.horas_maquina) * num(r.custo_hora_maquina),
    material: num(r.custo_material), processo: num(r.custo_processo), horas: num(r.horas_homem), horas_maquina: num(r.horas_maquina) };
  return r.processos_retrabalho.reduce((c, p) => {
    if (processoLinha(p.setor)) c.processo += num(p.custo_processo);
    else {
      c.horas += positivo(p.horas_homem); c.homem += positivo(p.horas_homem) * num(p.custo_hora);
      c.horas_maquina += (p.maquinas || []).reduce((s, m) => s + positivo(m.horas), 0);
      c.maquina += (p.maquinas || []).reduce((s, m) => s + positivo(m.horas) * num(m.valor_hora), 0);
    }
    return c;
  }, { homem: 0, maquina: 0, material: num(r.custo_material), processo: 0, horas: 0, horas_maquina: 0 });
}
export function erroRetrabalho(r, cfg) {
  for (const p of r.processos_retrabalho || []) {
    if (num(p.horas_homem) < 0 || (p.maquinas || []).some(m => num(m.horas) < 0) || num(p.peso_retrab) < 0 || (p.pecas || []).some(x => num(x.qtd) < 0)) return 'Informe quantidades e horas iguais ou maiores que zero.';
    if (processoLinha(p.setor) && (!r.produto || !num(p.area_proc))) return `Informe o produto e a área retrabalhada de ${p.setor} (máquina inteira, peças ou peso).`;
    if (!processoLinha(p.setor) && positivo(p.horas_homem) && !num(p.custo_hora)) return `Cadastre o valor hora-homem de ${p.setor} na Administração.`;
    if ((p.maquinas || []).some(m => positivo(m.horas) && !num(m.valor_hora))) return `Cadastre o valor hora das máquinas de ${p.setor} na Administração.`;
  }
  if (num(r.custo_material) < 0) return 'Informe material e refugo iguais ou maiores que zero.';
  return '';
}

export function telaRetrabalho(r, cfg, ft, dis) {
  const ps = r.processos_retrabalho;
  const o = { dis }, temBanho = ps.some(p => processoLinha(p.setor)?.k === 'b');
  const totais = custosRetrabalho(r);
  let h = card(alerta('info', 'Selecione os processos realizados no retrabalho. Banho químico inclui pintura. As horas são informadas por processo manual; banho e pintura têm custo fixo por m².') +
    icombo('_rtproduto', 'Produto / Máquina (ficha técnica)', Object.values(ft.produtos).map(p => [p.codigo, `${p.codigo} — ${p.nome}`]), r.produto, o) +
    diagramaProcessos(r, cfg, dis), 'Fluxo de retrabalho');
  h += ps.map((p, i) => {
    const proc = processoLinha(p.setor), k = field => `_rt.${i}.${field}`;
    const botoes = dis ? '' : `<div class="btnrow">${proc?.k === 'p' && temBanho ? '<span class="caption">Obrigatória após o banho</span>' : `<button class="btn sm danger" data-rtrm="${i}">Remover processo</button>`}</div>`;
    let body = '';
    if (proc) {
      if (proc.k === 'p' && temBanho) body += ichk(k('mesmo_banho'), 'Usar as mesmas peças/peso do banho químico', p.mesmo_banho, o);
      if (!(p.mesmo_banho && proc.k === 'p' && temBanho)) {
        body += isel(k('metodo_proc'), 'Como calcular a área retrabalhada', [['pecas', 'Máquina inteira ou peças identificadas'], ['peso', 'Proporcional ao peso']], p.metodo_proc || 'pecas', o);
        if (p.metodo_proc === 'peso') body += inum(k('peso_retrab'), 'Peso total retrabalhado (kg)', p.peso_retrab, o) + (!num(cfg.pesos_maquinas?.[r.produto]) ? alerta('warn', 'Sem peso cadastrado para este produto.') : '');
        else {
          body += ichk(k('produto_inteiro'), 'Máquina inteira × Qtd NC', p.produto_inteiro, o);
          if (!p.produto_inteiro) body += isel(k('addparte'), 'Adicionar peça retrabalhada', Object.entries(ft.partes[r.produto] || {}).filter(([chave, x]) => !chave.startsWith('_') && x && !p.pecas?.some(y => y.chave === chave)).map(([chave, x]) => [chave, `${x.codigo} — ${x.nome}`]), '', { ...o, ph: 'Selecione uma peça…' }) +
            (p.pecas || []).map((x, j) => row('c3', `<div>${esc(x.codigo)} — ${esc(x.nome)}</div>`, inum(k(`qtd_${j}`), 'Quantidade retrabalhada', x.qtd, o), dis ? '' : `<button class="btn sm danger" data-rtparte="${i}.${j}">Remover peça</button>`)).join('');
        }
      }
      body += row('c3', `<div class="metric"><div class="l">Área ${proc.k === 'b' ? 'total' : '(tubos externa / chapas total)'}</div><div class="v">${num(p.area_proc).toLocaleString('pt-BR', { maximumFractionDigits: 4 })} m²</div></div>`,
        `<div class="metric"><div class="l">Taxa fixa</div><div class="v">${brl(p.valor_m2)}/m²</div></div>`, `<div class="metric"><div class="l">Custo da etapa</div><div class="v">${brl(p.custo_processo)}</div></div>`) +
        (!num(p.area_proc) ? alerta('warn', 'Área ainda não calculada. Selecione o produto e informe máquina inteira, peças ou peso; confira o cadastro de áreas.') : '');
    } else {
      const maq = maquinasSetor(cfg, p.setor);
      body += row('c2', inum(k('horas_homem'), 'Horas-homem totais', p.horas_homem, { ...o, help: 'Some o tempo de todas as pessoas: 2 pessoas × 3 h = 6 horas-homem.' }), inum(k('custo_hora'), 'Valor hora-homem do setor (R$/h)', p.custo_hora, { dis: true })) +
        (p.maquinas || []).map((m, j) => row('c3', `<div>${esc(m.codigo)}<div class="caption">${brl(m.valor_hora)}/h · ${brl(positivo(m.horas) * num(m.valor_hora))}</div></div>`, inum(k(`mh_${j}`), 'Horas-máquina', m.horas, o), dis ? '' : `<button class="btn sm danger" data-rtmaq="${i}.${j}">Remover máquina</button>`)).join('') +
        isel(k('addmaq'), 'Adicionar máquina do processo', maq.filter(m => !p.maquinas?.some(x => x.codigo === m.codigo)).map(m => [m.codigo, m.codigo]), '', { ...o, ph: 'Selecione a máquina…' }) +
        (!maq.length ? '<div class="caption">Nenhuma máquina cadastrada para este processo.</div>' : '') +
        `<div class="caption">Custo da etapa: ${brl(positivo(p.horas_homem) * num(p.custo_hora) + (p.maquinas || []).reduce((s, m) => s + positivo(m.horas) * num(m.valor_hora), 0))}</div>`;
    }
    const passagem = p.etapa_id?.startsWith('solda-manual') ? (p.etapa_id.endsWith('1') ? ' · antes da montagem' : ' · após a montagem') : '';
    return `<section data-rt-etapa="${esc(p.etapa_id || p.setor)}">${card(body + botoes, `${i + 1} · ${esc(p.setor)}${passagem}`)}</section>`;
  }).join('');
  h += card(inum('custo_material', 'Material substituído / refugo (R$)', r.custo_material, { ...o, help: 'Informe apenas o material efetivamente substituído ou refugado. As peças selecionadas em banho/pintura definem a área e não são cobradas como material.' }) +
    row('c4 keep2', `<div>Horas-homem<br><b>${brl(totais.homem)}</b></div>`, `<div>Horas-máquina<br><b>${brl(totais.maquina)}</b></div>`, `<div>Banho / pintura<br><b>${brl(totais.processo)}</b></div>`, `<div class="metric"><div class="l">Total da ocorrência</div><div class="v" id="e-custo">${brl(totais.homem + totais.maquina + totais.processo + totais.material)}</div></div>`), 'Custo consolidado');
  return h;
}

export function ligarRetrabalho(el, r, cfg, ft, render, dis) {
  if (dis) return;
  const ps = r.processos_retrabalho;
  $('[data-combo="_rtproduto"]', el)?.addEventListener('change', e => {
    const v = comboValor(e.target);
    if (v !== r.produto) { r.produto = v; ps.forEach(p => { p.pecas = []; p.produto_inteiro = false; p.peso_retrab = 0; }); }
    render();
  });
  const estado = selecaoAtual(r, cfg);
  $('.rt-picker', el)?.addEventListener('toggle', e => { estado.aberta = e.target.open; });
  $$('[data-rt-node]', el).forEach(b => b.onclick = () => {
    const id = b.dataset.rtNode;
    if (estado.ids.has(id)) estado.ids.delete(id); else estado.ids.add(id);
    const ids = new Set(estado.ids); if (ids.has('banho')) ids.add('pintura');
    $$('[data-rt-node]', el).forEach(node => {
      const on = ids.has(node.dataset.rtNode), obrigatoria = node.dataset.rtNode === 'pintura' && ids.has('banho');
      node.classList.toggle('selected', on); node.setAttribute('aria-pressed', String(on)); node.disabled = obrigatoria;
      $('.rt-check', node).textContent = on ? '✓' : '+';
    });
    $('.rt-count', el).textContent = `${ids.size} selecionado(s)`;
    $('#rt-pendente', el).textContent = 'Seleção alterada. Clique em Aplicar processos.';
  });
  $('#rt-aplicar', el)?.addEventListener('click', () => { aplicarProcessos(r, cfg, estado.ids); render(); });
  $$('[data-k^="_rt."]', el).forEach(input => input.addEventListener('change', () => {
    const [, i, field] = input.dataset.k.split('.'), p = ps[+i], v = input.type === 'checkbox' ? input.checked : input.type === 'number' ? num(input.value) : input.value;
    if (field === 'addmaq' && v) p.maquinas.push({ codigo: v, horas: 0 });
    else if (field === 'addparte' && v) { const x = ft.partes[r.produto]?.[v]; if (x) (p.pecas ||= []).push({ chave: v, codigo: x.codigo, nome: x.nome, qtd: 1 }); }
    else if (field.startsWith('mh_')) p.maquinas[+field.slice(3)].horas = v;
    else if (field.startsWith('qtd_')) p.pecas[+field.slice(4)].qtd = v;
    else if (!['addmaq', 'addparte'].includes(field)) p[field] = v;
    render();
  }));
  for (const [attr, action] of Object.entries({ rtrm: (i) => {
    if (processoLinha(ps[i].setor)?.k === 'b') {
      const pintura = ps.find(p => processoLinha(p.setor)?.k === 'p' && p.mesmo_banho);
      if (pintura) Object.assign(pintura, { metodo_proc: ps[i].metodo_proc, produto_inteiro: ps[i].produto_inteiro, peso_retrab: ps[i].peso_retrab, pecas: structuredClone(ps[i].pecas || []), mesmo_banho: false });
    }
    ps.splice(i, 1);
  }, rtparte: (i, j) => ps[i].pecas.splice(j, 1), rtmaq: (i, j) => ps[i].maquinas.splice(j, 1) })) {
    $$(`[data-${attr}]`, el).forEach(b => b.onclick = () => { action(...b.dataset[attr].split('.').map(Number)); garantirPintura(r, Object.keys(cfg.setores || {})); if (attr === 'rtrm') selecoes.delete(r); render(); });
  }
}
