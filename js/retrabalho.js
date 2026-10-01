import { num, esc, brl, card, row, inum, isel, icombo, ichk, alerta, $, $$, comboValor } from './ui.js?v=20261001-retrabalho1';

export function processoLinha(setor) {
  const s = String(setor || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  if (s.includes('pintura')) return { k: 'p', nome: 'pintura', param: 'valor_m2_pintura', padrao: 79 };
  if (s.includes('banho') || s.includes('quimic')) return { k: 'b', nome: 'banho químico', param: 'valor_m2_banho', padrao: 24 };
  return null;
}
const positivo = v => Math.max(0, num(v));
const centavos = v => Math.round(v * 100) / 100;
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
  const ps = r.processos_retrabalho, setores = [...new Set([...Object.keys(cfg.setores || {}), 'Banho químico', 'Pintura'])]
    .filter((s, i, a) => !processoLinha(s) || a.findIndex(x => processoLinha(x)?.k === processoLinha(s)?.k) === i);
  const o = { dis }, temBanho = ps.some(p => processoLinha(p.setor)?.k === 'b');
  const totais = custosRetrabalho(r);
  let h = card(alerta('info', 'Selecione os processos realizados no retrabalho. Banho químico inclui pintura. As horas são informadas por processo manual; banho e pintura têm custo fixo por m².') +
    icombo('_rtproduto', 'Produto / Máquina (ficha técnica)', Object.values(ft.produtos).map(p => [p.codigo, `${p.codigo} — ${p.nome}`]), r.produto, o) +
    isel('_rtadd', 'Adicionar processo realizado', setores.filter(s => !ps.some(p => p.setor === s || (processoLinha(s) && processoLinha(s)?.k === processoLinha(p.setor)?.k))), '', { ...o, ph: 'Selecione o processo…' }), 'Fluxo de retrabalho');
  h += ps.map((p, i) => {
    const proc = processoLinha(p.setor), k = field => `_rt.${i}.${field}`;
    const botoes = dis ? '' : `<div class="btnrow"><button class="btn sm" data-rtup="${i}" ${i === 0 ? 'disabled' : ''} aria-label="Mover ${esc(p.setor)} para cima">↑</button><button class="btn sm" data-rtdown="${i}" ${i === ps.length - 1 ? 'disabled' : ''} aria-label="Mover ${esc(p.setor)} para baixo">↓</button>${proc?.k === 'p' && temBanho ? '<span class="caption">Obrigatória após o banho</span>' : `<button class="btn sm danger" data-rtrm="${i}">Remover processo</button>`}</div>`;
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
    return card(body + botoes, `${i + 1} · ${esc(p.setor)}`);
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
  $('[data-k="_rtadd"]', el)?.addEventListener('change', e => {
    if (e.target.value) ps.push({ setor: e.target.value, horas_homem: 0, maquinas: [], pecas: [] });
    garantirPintura(r, Object.keys(cfg.setores || {})); render();
  });
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
  }, rtup: (i) => { if (i > 0) [ps[i - 1], ps[i]] = [ps[i], ps[i - 1]]; }, rtdown: (i) => { if (i < ps.length - 1) [ps[i + 1], ps[i]] = [ps[i], ps[i + 1]]; }, rtparte: (i, j) => ps[i].pecas.splice(j, 1), rtmaq: (i, j) => ps[i].maquinas.splice(j, 1) })) {
    $$(`[data-${attr}]`, el).forEach(b => b.onclick = () => { action(...b.dataset[attr].split('.').map(Number)); garantirPintura(r, Object.keys(cfg.setores || {})); render(); });
  }
}
