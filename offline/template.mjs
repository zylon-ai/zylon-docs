/** HTML shell and accessible server-rendered navigation for the offline site. */
import { escape, localUrl } from './render.mjs';
import { matchingRoute } from './navigation.mjs';

const words = language => language === 'es'
  ? { search: 'Buscar en esta documentación', placeholder: 'Buscar...', menu: 'Mostrar navegación', collapse: 'Ocultar barra lateral', toc: 'En esta página', empty: 'No hay resultados', product: 'Producto', version: 'Versión', language: 'Idioma', content: 'Ir al contenido', close: 'Cerrar búsqueda', copy: 'Copiar', copyPage: 'Copiar página', copied: 'Copiado', failure: 'No se ha podido copiar', light: 'Modo claro', dark: 'Modo oscuro', support: 'Soporte', demo: 'Solicitar una demo' }
  : { search: 'Search this documentation', placeholder: 'Search...', menu: 'Toggle navigation', collapse: 'Hide sidebar', toc: 'On this page', empty: 'No results found', product: 'Product', version: 'Version', language: 'Language', content: 'Skip to content', close: 'Close search', copy: 'Copy', copyPage: 'Copy page', copied: 'Copied', failure: 'Could not copy', light: 'Light mode', dark: 'Dark mode', support: 'Support', demo: 'Request a Demo' };

const iconPaths = {
  chevron: '<path d="m7 10 5 5 5-5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  collapse: '<path d="M18 4v16M13 8l-4 4 4 4M5 12h8"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/>',
  moon: '<path d="M20 15.5A9 9 0 0 1 8.5 4 9 9 0 1 0 20 15.5Z"/>',
  house: '<path d="m3 10 9-7 9 7M5 9v11h14V9M9 20v-7h6v7"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-3a8 8 0 0 1 16 0v3"/>',
  code: '<path d="m8 6-6 6 6 6m8-12 6 6-6 6M14 3l-4 18"/>',
  wrench: '<path d="M14 5a6 6 0 0 0-7 7L2 17a3 3 0 0 0 4 4l5-5a6 6 0 0 0 8-7l-4 4-4-4 3-4Z"/>',
  headphones: '<path d="M3 13v-2a9 9 0 0 1 18 0v2M3 12h4v9H3zm14 0h4v9h-4z"/>',
  list: '<path d="M8 5h13M8 12h13M8 19h13M3 5h.1M3 12h.1M3 19h.1"/>',
};
const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] ?? iconPaths.list}</svg>`;

export function plainText(html) {
  return html.replace(/<[^>]*>/g, ' ').replace(/&#(x[0-9a-f]+|[0-9]+);/gi, (_m, value) => {
    const code = value[0].toLowerCase() === 'x' ? parseInt(value.slice(1), 16) : Number(value);
    return code <= 0x10ffff ? String.fromCodePoint(code) : '';
  }).replace(/&(amp|lt|gt|quot|apos|#39|nbsp);/g, (_m, value) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", '#39': "'", nbsp: ' ' })[value]).replace(/\s+/g, ' ').trim();
}

function navigationTree(nodes, page, titles, base, depth = 0) {
  return nodes.filter(node => !node.hidden && !node.page?.hidden).map(node => {
    if (node.page) {
      const route = node.page.route;
      return `<a class="nav-page${route === page.route ? ' active' : ''}" href="${escape(localUrl(route, base))}"${route === page.route ? ' aria-current="page"' : ''}>${escape(titles.get(route) ?? route.split('/').pop())}</a>`;
    }
    const children = navigationTree(node.children, page, titles, base, depth + 1);
    if (depth === 0) return `<section class="nav-group"><h2>${escape(node.label)}</h2>${children}</section>`;
    return `<details class="nav-subgroup"${contains(node, page.route) ? ' open' : ''}><summary>${escape(node.label)}</summary><div>${children}</div></details>`;
  }).join('');
}
const contains = (node, route) => node.page?.route === route || node.children?.some(child => contains(child, route));

function picker(label, options, selected, classes = '') {
  const current = options.find(option => option.label === selected);
  return `<details class="picker ${classes}" name="collection-picker"><summary aria-label="${escape(label)}: ${escape(current?.display ?? selected)}">${escape(current?.display ?? selected)}${icon('chevron')}</summary><div class="picker-menu">${options.map(option => `<a href="${escape(option.href)}"${option.label === selected ? ' aria-current="true"' : ''}>${escape(option.display ?? option.label)}${option.label === selected ? '<span aria-hidden="true">✓</span>' : ''}</a>`).join('')}</div></details>`;
}

export function pageHtml({ config, navigation, page, data, html, titles, base = '/docs' }) {
  const context = page.context, t = words(context.language);
  const title = data.title ?? titles.get(page.route), productNames = [...new Set(navigation.contexts.filter(candidate => !candidate.hidden || candidate.product === context.product).map(candidate => candidate.product))];
  const versions = [...new Set(navigation.contexts.filter(candidate => candidate.product === context.product).map(candidate => candidate.version))];
  const languages = [...new Set(navigation.contexts.filter(candidate => candidate.product === context.product && candidate.version === context.version).map(candidate => candidate.language))];
  const option = (label, selection, display) => ({ label, display, href: localUrl(matchingRoute(navigation, page, selection), base) });
  const controls = (versions.length > 1 ? picker(t.version, versions.map(version => option(version, { version })), context.version, 'version-picker') : '')
    + picker(t.product, productNames.map(product => option(product, { product })), context.product, 'product-picker');
  const localeName = language => language === 'es' ? '🇪🇸 Español' : language === 'en' ? '🇺🇸 English' : language;
  const locale = picker(t.language, languages.map(language => option(language, { language }, localeName(language))), context.language, 'language-picker');
  const mobileVersion = versions.length > 1 ? picker(t.version, versions.map(version => option(version, { version })), context.version, 'mobile-version-picker') : '';
  const tabs = context.tree.filter(node => node.kind === 'tab' && !node.hidden);
  const activeTab = tabs.find(node => contains(node, page.route));
  const firstPage = node => node.page ?? node.children?.map(firstPage).find(Boolean);
  const tabbar = tabs.length ? `<nav class="site-tabs" aria-label="${escape(context.product)}">${tabs.map(tab => `<a href="${localUrl(firstPage(tab).route, base)}"${tab === activeTab ? ' class="active" aria-current="true"' : ''}>${icon(tab.icon)}${escape(tab.label)}</a>`).join('')}</nav>` : '';
  const sidebar = activeTab ? activeTab.children : context.tree;
  const groupLabel = sidebar.find(node => !node.page && contains(node, page.route))?.label;
  const links = (config.navbar?.links ?? []).map(link => `<a href="${escape(localUrl(link.href, base))}">${escape(link.label === 'Support' ? t.support : link.label)}</a>`).join('');
  const primary = config.navbar?.primary;
  const primaryLink = primary ? `<a class="header-primary" href="${escape(localUrl(primary.href, base))}">${escape(primary.label === 'Request a Demo' ? t.demo : primary.label)}<span aria-hidden="true">›</span></a>` : '';
  const headings = [...html.matchAll(/<h([23])\b[^>]*\bid="([^"]+)"[^>]*>(.*?)<\/h\1>/gs)].map(([, level, id, text]) => `<a class="toc-level-${level}" href="#${escape(id)}">${escape(plainText(text))}</a>`).join('');
  const noindex = context.hidden || page.hidden || data.noindex === true;
  return `<!doctype html>
<html lang="${escape(context.language)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} · ${escape(context.product)}</title><meta name="description" content="${escape(data.description ?? config.description ?? '')}">${noindex ? '<meta name="robots" content="noindex,nofollow">' : ''}<link rel="icon" href="${escape(localUrl(config.favicon ?? '/favicon.png', base))}"><link rel="stylesheet" href="${base}/_offline/site.css"><script src="${base}/_offline/site.js" defer></script><link rel="stylesheet" href="${base}/_offline/feature-status.css"><script src="${base}/_offline/feature-status.js" defer></script></head>
<body class="${tabs.length ? 'has-tabs' : ''}" data-search-index="${base}/_offline/search/${context.id}.json" data-copy="${escape(t.copy)}" data-copied="${escape(t.copied)}" data-copy-failure="${escape(t.failure)}">
<a class="skip" href="#content">${t.content}</a><header class="topbar"><div class="header-row"><div class="header-brand"><button class="menu-toggle" type="button" aria-controls="sidebar" aria-expanded="false" aria-label="${t.menu}">${icon('menu')}</button><a class="brand" href="${localUrl(context.home, base)}"><img src="${localUrl(config.logo?.light ?? '/logo/light.svg', base)}" alt="${escape(config.name ?? 'Zylon')}" width="156" height="32"></a><div class="collection-controls">${controls}</div></div><button id="search-bar-entry" class="search-trigger" type="button" aria-haspopup="dialog" aria-controls="search-dialog" aria-label="${t.search}">${icon('search')}<span>${t.placeholder}</span><kbd>⌘K</kbd></button><div class="header-links">${links}${primaryLink}</div></div>${tabbar}</header>
<aside id="sidebar" class="sidebar"><div class="sidebar-scroll"><button class="sidebar-collapse" type="button" aria-label="${t.collapse}">${icon('collapse')}</button><nav aria-label="${escape(context.product)}">${navigationTree(sidebar, page, titles, base)}</nav></div><div class="sidebar-footer">${mobileVersion}${locale}<div class="theme-controls"><button type="button" data-theme="light" aria-label="${t.light}" aria-pressed="true">${icon('sun')}</button><button type="button" data-theme="dark" aria-label="${t.dark}" aria-pressed="false">${icon('moon')}</button></div></div></aside>
<div class="content-shell"><div class="layout"><main id="content" class="article"><header class="article-header">${groupLabel ? `<p class="eyebrow">${escape(groupLabel)}</p>` : ''}<div class="title-row"><h1>${escape(title)}</h1><button class="copy-page" type="button">${icon('copy')}<span>${t.copyPage}</span></button></div>${data.description ? `<p class="lead">${escape(data.description)}</p>` : ''}</header><div class="page-content">${html}</div></main><aside class="toc" aria-label="${t.toc}"><strong>${icon('list')}${t.toc}</strong>${headings}</aside></div></div>
<dialog id="search-dialog" aria-label="${t.search}"><div class="search-dialog-header">${icon('search')}<label class="sr-only" for="search">${t.search}</label><input id="search" type="search" placeholder="${t.placeholder}" autocomplete="off" aria-controls="search-list"><button id="close-search" type="button" aria-label="${t.close}">Esc</button></div><div id="search-results" class="search-results" hidden><p id="search-status" role="status" data-empty="${t.empty}"></p><ol id="search-list"></ol></div></dialog></body></html>`;
}

export function redirectHtml(destination, base = '/docs') {
  const target = localUrl(destination, base);
  const local = target.startsWith(base + '/') || target === base;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="robots" content="noindex">${local ? `<meta http-equiv="refresh" content="0;url=${escape(target)}">` : ''}<title>Documentation</title></head><body><a href="${escape(target)}">${local ? 'Continue / Continuar' : 'Open online / Abrir en línea'}</a></body></html>\n`;
}
