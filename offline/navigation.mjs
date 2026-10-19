/** Project docs.json navigation into independent product/version/language collections. */
import path from 'node:path';

export function routePath(value) {
  const route = '/' + value.replace(/^\/+|\/+$/g, '').replace(/\.mdx?$/, '');
  if (route.includes('\\') || route.includes('//') || route.split('/').some(part => part === '.' || part === '..') || /[?#]/.test(route)) {
    throw new Error(`Invalid documentation route: ${value}`);
  }
  return route;
}

const identifier = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function commonPrefix(routes) {
  const parts = routes[0].split('/').filter(Boolean);
  for (const route of routes.slice(1)) {
    const candidate = route.split('/').filter(Boolean);
    while (parts.some((part, index) => candidate[index] !== part)) parts.pop();
  }
  return '/' + parts.join('/');
}

function nodes(entries, pages, inheritedHidden = false) {
  return (entries ?? []).map(entry => {
    if (typeof entry === 'string') {
      const page = { route: routePath(entry), hidden: inheritedHidden };
      pages.push(page);
      return { page };
    }
    if (!entry || typeof entry !== 'object') throw new Error('Invalid navigation entry');
    const hidden = inheritedHidden || entry.hidden === true;
    return {
      label: entry.group ?? entry.tab ?? entry.anchor ?? entry.dropdown ?? '', hidden,
      kind: entry.tab ? 'tab' : 'group', icon: entry.icon,
      children: nodes(entry.pages ?? entry.groups ?? entry.tabs, pages, hidden),
    };
  });
}

/** Hidden products remain addressable, but never join another product's visible menu or search. */
export function readNavigation(config) {
  const contexts = [], pages = [], seen = new Set();
  const products = config.navigation?.products;
  if (!Array.isArray(products) || products.length === 0) throw new Error('docs.json needs navigation.products');
  for (const product of products) {
    const versions = product.versions ?? [product];
    for (const version of versions) {
      for (const language of version.languages ?? []) {
        const context = {
          product: product.product, hidden: product.hidden === true,
          version: version.version ?? '', defaultVersion: version.default === true || versions.length === 1,
          language: language.language, pages: [],
        };
        context.id = [product.product, context.version || 'current', context.language].map(identifier).join('/');
        context.tree = nodes(language.tabs ?? language.groups ?? language.pages, context.pages);
        if (!context.pages.length) throw new Error(`Empty navigation: ${context.id}`);
        context.prefix = commonPrefix(context.pages.map(page => page.route));
        context.home = (context.pages.find(page => !page.hidden) ?? context.pages[0]).route;
        for (const page of context.pages) {
          if (seen.has(page.route)) throw new Error(`Duplicate documentation route: ${page.route}`);
          seen.add(page.route);
          page.context = context;
          page.key = page.route.slice(context.prefix.length).replace(/^\//, '');
          pages.push(page);
        }
        contexts.push(context);
      }
    }
  }
  const initial = contexts.find(context => !context.hidden && context.defaultVersion)
    ?? contexts.find(context => !context.hidden);
  if (!initial) throw new Error('Navigation needs a visible product');
  return { contexts, pages, home: initial.home };
}

/** Keep the same logical article across a language/version switch, falling back to its collection home. */
export function matchingRoute(navigation, page, selection = {}) {
  const product = selection.product ?? page.context.product;
  let candidates = navigation.contexts.filter(context => context.product === product);
  const version = selection.version ?? page.context.version;
  const versionMatches = candidates.filter(context => context.version === version);
  candidates = versionMatches.length ? versionMatches : candidates.filter(context => context.defaultVersion);
  const context = candidates.find(candidate => candidate.language === (selection.language ?? page.context.language)) ?? candidates[0];
  if (!context) throw new Error(`No navigation for product ${product}`);
  return context.pages.find(candidate => candidate.key === page.key)?.route ?? context.home;
}

/** Refuse paths that could write outside the static output tree. */
export function outputFile(output, route) {
  const normalized = routePath(route);
  const filename = normalized === '/' ? 'index.html' : normalized.slice(1) + '/index.html';
  return path.join(output, filename);
}
