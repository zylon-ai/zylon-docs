/** Local-only navigation, appearance, search and clipboard enhancements. */
document.body.classList.add('js');
const menu = document.querySelector('.menu-toggle');
const collapse = document.querySelector('.sidebar-collapse');
menu?.addEventListener('click', () => {
  if (document.body.classList.contains('sidebar-collapsed')) {
    document.body.classList.remove('sidebar-collapsed');
    return;
  }
  const expanded = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(expanded));
  document.body.classList.toggle('navigation-open', expanded);
});
collapse?.addEventListener('click', () => document.body.classList.add('sidebar-collapsed'));

for (const picker of document.querySelectorAll('.picker')) {
  picker.addEventListener('toggle', () => {
    if (picker.open) for (const other of document.querySelectorAll('.picker[open]')) {
      if (other !== picker) other.open = false;
    }
  });
}
document.addEventListener('click', event => {
  for (const picker of document.querySelectorAll('.picker[open]')) {
    if (!picker.contains(event.target)) picker.open = false;
  }
});

function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  for (const button of document.querySelectorAll('button[data-theme]')) {
    button.setAttribute('aria-pressed', String(button.dataset.theme === theme));
  }
}
try { applyTheme(localStorage.getItem('zylon-docs-theme') === 'dark' ? 'dark' : 'light'); }
catch (error) { /* Browser storage may be disabled; the default light theme still works. */ }
for (const button of document.querySelectorAll('button[data-theme]')) button.addEventListener('click', () => {
  applyTheme(button.dataset.theme);
  try { localStorage.setItem('zylon-docs-theme', button.dataset.theme); }
  catch (error) { /* A storage restriction must not block the appearance change. */ }
});

const input = document.querySelector('#search'), panel = document.querySelector('#search-results');
const results = document.querySelector('#search-list'), status = document.querySelector('#search-status');
const dialog = document.querySelector('#search-dialog');
let index, request, generation = 0;
const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
function openSearch() { if (!dialog.open) dialog.showModal(); input.focus(); }
function closeSearch() { if (dialog.open) dialog.close(); }
document.querySelector('#search-bar-entry')?.addEventListener('click', openSearch);
document.querySelector('#close-search')?.addEventListener('click', closeSearch);
dialog?.addEventListener('click', event => { if (event.target === dialog) closeSearch(); });
document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault(); openSearch();
  }
  if (event.key === 'Escape') {
    closeSearch();
    menu?.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('navigation-open');
    for (const picker of document.querySelectorAll('.picker[open]')) picker.open = false;
  }
});

input?.addEventListener('input', async () => {
  const current = ++generation, query = normalize(input.value.trim());
  results.replaceChildren();
  if (!query) { panel.hidden = true; return; }
  panel.hidden = false;
  try {
    request ??= fetch(document.body.dataset.searchIndex, { credentials: 'same-origin' }).then(response => {
      if (!response.ok) throw new Error('Search unavailable');
      return response.json();
    }).catch(error => { request = undefined; throw error; });
    index ??= await request;
    if (current !== generation) return;
    const terms = query.split(/\s+/);
    const matches = index.map(page => {
      const title = normalize(page.title), text = normalize(page.text);
      const matched = terms.every(term => title.includes(term) || text.includes(term));
      return { page, score: matched ? terms.reduce((score, term) => score + (title.includes(term) ? 10 : 1), 0) : 0 };
    }).filter(result => result.score).sort((a, b) => b.score - a.score).slice(0, 20);
    status.textContent = matches.length ? String(matches.length) : status.dataset.empty;
    for (const { page } of matches) {
      const li = document.createElement('li'), link = document.createElement('a'), snippet = document.createElement('small');
      link.href = page.href; link.textContent = page.title;
      snippet.textContent = page.text.slice(0, 150);
      li.append(link, snippet); results.append(li);
    }
  } catch (error) {
    if (current === generation) status.textContent = document.documentElement.lang === 'es'
      ? 'No se ha podido cargar la búsqueda. Vuelve a escribir para reintentarlo.'
      : 'Could not load search. Type again to retry.';
  }
});

async function copyText(text) {
  if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(text);
  else {
    const field = document.createElement('textarea'); field.value = text; field.className = 'copy-fallback';
    document.body.append(field); field.select();
    const copied = document.execCommand('copy'); field.remove();
    if (!copied) throw new Error('Copy unavailable');
  }
}
async function copyFeedback(button, text) {
  const label = button.querySelector('span') ?? button;
  const original = label.textContent;
  try { await copyText(text); label.textContent = document.body.dataset.copied; }
  catch (error) { label.textContent = document.body.dataset.copyFailure; }
  setTimeout(() => { label.textContent = original; }, 1600);
}
document.querySelector('.copy-page')?.addEventListener('click', event => {
  const content = document.querySelector('.page-content').cloneNode(true);
  for (const button of content.querySelectorAll('button')) button.remove();
  for (const block of content.querySelectorAll('p,h1,h2,h3,h4,li,pre,table,section')) block.append('\n\n');
  const text = document.querySelector('h1').textContent + '\n\n' + content.textContent.trim();
  copyFeedback(event.currentTarget, text);
});
for (const pre of document.querySelectorAll('pre')) {
  const button = document.createElement('button');
  button.type = 'button'; button.className = 'copy-code'; button.textContent = document.body.dataset.copy;
  button.addEventListener('click', () => copyFeedback(button, pre.querySelector('code')?.textContent ?? pre.textContent));
  pre.append(button);
}
