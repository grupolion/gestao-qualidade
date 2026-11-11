// Presentation only: preference is independent of authentication and form state.
(() => {
  const key = 'gq-appearance';
  const system = matchMedia('(prefers-color-scheme: dark)');
  let preference;
  try { preference = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(preference)) preference = null;
  const icons = {
    light: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
    dark: '<path d="M20.8 13A9 9 0 0 1 11 3.2 9 9 0 1 0 20.8 13Z"/>'
  };
  function chartTheme(chart) {
    const css = getComputedStyle(document.documentElement);
    const color = css.getPropertyValue('--muted').trim();
    const line = css.getPropertyValue('--line').trim();
    const dark = document.documentElement.dataset.theme === 'dark';
    for (const dataset of chart.data.datasets) {
      for (const property of ['backgroundColor', 'borderColor']) {
        if (['#1f2a44', '#9baec8'].includes(dataset[property])) dataset[property] = dark ? '#9baec8' : '#1f2a44';
      }
    }
    chart.options.color = color;
    if (chart.options.plugins.legend?.labels) chart.options.plugins.legend.labels.color = color;
    for (const scale of Object.values(chart.options.scales || {})) {
      if (scale.ticks) scale.ticks.color = color;
      if (scale.grid) scale.grid.color = line;
      if (scale.border) scale.border.color = line;
    }
  }
  function apply() {
    const theme = preference || (system.matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? '#171a1e' : '#f5f5f3');
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      const next = theme === 'dark' ? 'light' : 'dark';
      button.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true">${icons[next]}</svg><span>Modo ${next === 'dark' ? 'escuro' : 'claro'}</span>`;
      button.setAttribute('aria-label', `Ativar modo ${next === 'dark' ? 'escuro' : 'claro'}`);
    });
    if (window.Chart) Object.values(Chart.instances).forEach(chart => { chartTheme(chart); chart.update('none'); });
  }
  apply();
  system.addEventListener('change', () => { if (!preference) apply(); });
  window.addEventListener('storage', event => {
    if (event.key === key || event.key === null) {
      preference = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
      apply();
    }
  });
  document.addEventListener('DOMContentLoaded', () => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.dataset.themeToggle = '';
    button.onclick = () => {
      preference = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try { localStorage.setItem(key, preference); } catch {}
      apply();
    };
    document.body.append(button);
    if (window.Chart) {
      Chart.defaults.font.family = '"Segoe UI", system-ui, sans-serif';
      Chart.defaults.font.size = 12;
      Chart.defaults.datasets.bar.borderRadius = 3;
      Chart.register({ id: 'gqAppearance', beforeUpdate: chartTheme });
    }
    apply();
  });
})();
