(() => {
  const themes = [
    { id: 'copa', label: 'Copa heat', short: 'Copa' },
    { id: 'print', label: 'Matchday print', short: 'Print' }
  ];

  const saved = localStorage.getItem('forecast-theme');
  const active = themes.some(theme => theme.id === saved) ? saved : 'print';
  document.documentElement.dataset.theme = active;

  document.querySelectorAll('.theme-switcher').forEach(switcher => {
    switcher.innerHTML = `
      <span class="theme-switcher-label">Design</span>
      <div class="theme-options">
        ${themes.map(theme => `
          <button type="button" data-set-theme="${theme.id}" aria-label="Use ${theme.label} design" title="${theme.label}">
            <span class="theme-swatch" aria-hidden="true"></span>
            <span class="theme-name">${theme.short}</span>
          </button>
        `).join('')}
      </div>
    `;
  });

  function selectTheme(id) {
    document.documentElement.dataset.theme = id;
    localStorage.setItem('forecast-theme', id);
    document.querySelectorAll('[data-set-theme]').forEach(button => {
      const selected = button.dataset.setTheme === id;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
  }

  document.addEventListener('click', event => {
    const button = event.target.closest('[data-set-theme]');
    if (button) selectTheme(button.dataset.setTheme);
  });

  selectTheme(active);
})();
