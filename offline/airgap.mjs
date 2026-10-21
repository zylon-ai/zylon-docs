/** Select a Zylon documentation version for a static airgap image without changing its sources. */
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { readNavigation } from './navigation.mjs';

/** An explicit build argument overrides the committed, non-secret release configuration. */
export async function readAirgapVersion(source, override) {
  if (override !== undefined) return override;
  try { return parseEnv(await readFile(resolve(source, '.env.airgap'), 'utf8')).AIRGAP_VERSION ?? ''; }
  catch (error) { if (error.code === 'ENOENT') return ''; throw error; }
}

/** Empty and unknown values retain the complete site, including its configured default version. */
export function selectAirgapVersion(config, requested) {
  const versions = config.navigation?.products?.find(product => product.product === 'Zylon')?.versions ?? [];
  const value = typeof requested === 'string' ? requested.trim() : '';
  if (!value) return undefined;
  return versions.find(version => version.version === value || version.version.match(/^\d+(?:\.\d+)*/)?.[0] === value);
}

/** Project the selected articles onto /<language>/... and remap their local links and search routes. */
export function projectAirgap(config, requested) {
  const selected = selectAirgapVersion(config, requested);
  if (!selected) return { config, version: '', sources: new Map(), rewriteUrl: value => value };

  const navigation = readNavigation(config);
  const contexts = navigation.contexts.filter(context => context.product === 'Zylon');
  const current = contexts.filter(context => context.version === selected.version);
  const aliases = new Map(), sources = new Map();
  // Zylon source routes are /<language>/<version>/<article>, including single-page collections.
  const articleKey = page => page.route.split('/').slice(3).join('/');
  for (const context of contexts) {
    const target = current.find(candidate => candidate.language === context.language);
    if (!target) throw new Error(`Selected documentation version has no ${context.language} translation`);
    for (const page of context.pages) {
      const article = target.pages.find(candidate => articleKey(candidate) === articleKey(page)) ?? target.pages.find(candidate => candidate.route === target.home);
      const route = `/${target.language}/${articleKey(article)}`;
      aliases.set(page.route, route);
      if (context.version === selected.version) sources.set(route, page.route);
    }
  }
  const mapPath = value => {
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    const original = new URL(value, 'https://docs.invalid');
    const target = new URL(aliases.get(original.pathname.replace(/\/$/, '')) ?? value, original.origin);
    if (original.search) target.search = original.search;
    if (original.hash) target.hash = original.hash;
    return target.origin === original.origin ? target.pathname + target.search + target.hash : target.href;
  };
  // Include section/index aliases so article links resolve directly to the selected overview.
  for (const redirect of config.redirects ?? []) aliases.set(redirect.source, mapPath(redirect.destination));

  const rewriteUrl = value => {
    if (!value.startsWith('/') || value.startsWith('//')) return value;
    const base = value.startsWith('/docs/') ? '/docs' : '';
    const target = mapPath(value.slice(base.length));
    return target.startsWith('/') && !target.startsWith('//') ? base + target : target;
  };
  const projected = structuredClone(config);
  const product = projected.navigation.products.find(candidate => candidate.product === 'Zylon');
  const remapPages = value => {
    if (Array.isArray(value)) return value.map(remapPages);
    if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) =>
      [key, ['pages', 'groups', 'tabs'].includes(key) ? remapPages(item) : item]));
    return typeof value === 'string' && aliases.has('/' + value) ? aliases.get('/' + value).slice(1) : value;
  };
  product.languages = remapPages(selected.languages);
  delete product.versions;
  const routes = new Set(readNavigation(projected).pages.map(page => page.route));
  const versionPrefixes = contexts.map(context => context.pages[0].route.split('/').slice(0, 3).join('/') + '/');
  projected.redirects = (config.redirects ?? []).filter(redirect =>
    !versionPrefixes.some(prefix => (redirect.source + '/').startsWith(prefix)) && !routes.has(redirect.source)
  ).map(redirect => ({ ...redirect, destination: rewriteUrl(redirect.destination) }))
    .filter(redirect => redirect.source !== redirect.destination);
  return { config: projected, version: selected.version.match(/^\d+(?:\.\d+)*/)?.[0] ?? selected.version, sources, rewriteUrl };
}

// The publisher resolves configuration from the exact checked-out release, including old snapshots.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const source = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const config = JSON.parse(await readFile(resolve(source, 'docs.json'), 'utf8'));
  const selection = projectAirgap(config, await readAirgapVersion(source, process.env.AIRGAP_VERSION));
  process.stdout.write(selection.version + '\n');
}
