/** Compile registered MDX pages, scoped search indexes and assets into a standalone /docs site. */
import { readFile, writeFile, mkdir, rm, cp, readdir, lstat, rename } from 'node:fs/promises';
import { resolve, dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRenderer, rewriteHtml, verifyAssets, localUrl } from './render.mjs';
import { readNavigation, outputFile, routePath } from './navigation.mjs';
import { pageHtml, redirectHtml, plainText } from './template.mjs';
import { readAirgapVersion, projectAirgap } from './airgap.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
async function write(path, content) { await mkdir(dirname(path), { recursive: true }); await writeFile(path, content); }

/** Copy explicit public directories only; hidden files and symlinks never join the artifact. */
async function copyPublic(source, destination) {
  const info = await lstat(source);
  if (info.isSymbolicLink()) throw new Error(`Public asset cannot be a symlink: ${source}`);
  if (info.isDirectory()) {
    for (const entry of await readdir(source)) {
      if (!entry.startsWith('.')) await copyPublic(join(source, entry), join(destination, entry));
    }
  } else if (info.isFile()) {
    if (/\.(?:mdx?|m?js|cjs|tsx?|sh|ya?ml)$/i.test(source)) throw new Error(`Source file in public asset directory: ${source}`);
    await mkdir(dirname(destination), { recursive: true });
    await cp(source, destination);
  }
}

/** Build from a known source tree. Output is disposable and must not contain the source. */
export async function buildSite({ source = resolve(HERE, '..'), output = resolve(HERE, 'dist'), base = '/docs', progress = () => {}, airgapVersion } = {}) {
  source = resolve(source); output = resolve(output);
  if (base !== '/docs') throw new Error('This deployment serves the fixed /docs base path');
  const outputFromSource = relative(output, source);
  if (!outputFromSource || !outputFromSource.startsWith('..')) throw new Error('Build output cannot contain the source tree');
  const original = JSON.parse(await readFile(join(source, 'docs.json'), 'utf8'));
  const selection = projectAirgap(original, airgapVersion === undefined ? await readAirgapVersion(source, process.env.AIRGAP_VERSION) : airgapVersion);
  const config = selection.config;
  const navigation = readNavigation(config), renderer = createRenderer(source), rendered = [], titles = new Map();
  for (const [index, page] of navigation.pages.entries()) {
    const sourceRoute = selection.sources.get(page.route) ?? page.route;
    const filename = join(source, sourceRoute.slice(1) + '.mdx');
    const { data, html: raw } = await renderer(filename);
    let html;
    try { html = rewriteHtml(raw, base, sourceRoute, selection.rewriteUrl); await verifyAssets(html, source, base); }
    catch (error) { throw new Error(`${page.route}: ${error.message}`, { cause: error }); }
    titles.set(page.route, data.title ?? plainText(raw.match(/<h1[^>]*>(.*?)<\/h1>/s)?.[1] ?? page.route.split('/').pop()));
    rendered.push({ page, data, html });
    if ((index + 1) % 100 === 0) progress(`Compiled ${index + 1}/${navigation.pages.length} pages`);
  }
  // Render and validate before replacing a previous successful artifact.
  const staging = output + '.building';
  await rm(staging, { recursive: true, force: true });
  await mkdir(staging, { recursive: true });
  try {
    const documents = rendered.map(item => ({ route: item.page.route, html: pageHtml({ config, navigation, titles, base, ...item }) }));
    for (const document of documents) await write(outputFile(staging, document.route), document.html);
    const routes = new Set(navigation.pages.map(page => page.route));
    const redirects = config.redirects ?? [];
    const redirected = new Set();
    for (const redirect of redirects) {
      const route = routePath(redirect.source);
      if (routes.has(route)) throw new Error(`Redirect replaces a registered page: ${route}`);
      if (redirected.has(route)) throw new Error(`Duplicate redirect: ${route}`);
      redirected.add(route);
      await write(outputFile(staging, route), redirectHtml(redirect.destination, base));
    }
    if (!routes.has('/') && !redirected.has('/')) await write(join(staging, 'index.html'), redirectHtml(navigation.home, base));
    for (const context of navigation.contexts) {
      const records = rendered.filter(item => item.page.context === context && !item.page.hidden && item.data.noindex !== true)
        .map(item => ({ title: titles.get(item.page.route), href: localUrl(item.page.route, base), text: plainText(item.html) }));
      // A hidden product has its own local search; hidden articles within it remain excluded.
      if (context.hidden) {
        records.splice(0, records.length, ...rendered.filter(item => item.page.context === context && !item.page.hidden)
          .map(item => ({ title: titles.get(item.page.route), href: localUrl(item.page.route, base), text: plainText(item.html) })));
      }
      await write(join(staging, '_offline/search', context.id + '.json'), JSON.stringify(records));
    }
    await cp(join(HERE, 'assets'), join(staging, '_offline'), { recursive: true });
    for (const directory of ['images', 'files', 'logo']) {
      try { await lstat(join(source, directory)); } catch (error) { if (error.code === 'ENOENT') continue; throw error; }
      await copyPublic(join(source, directory), join(staging, directory));
    }
    for (const document of documents) await verifyAssets(document.html, staging, base);
    const favicon = config.favicon ?? '/favicon.png';
    if (!favicon.startsWith('/')) throw new Error('Favicon must be a local absolute path');
    await copyPublic(join(source, favicon.slice(1)), join(staging, favicon.slice(1)));
    await write(join(staging, '404.html'), '<!doctype html><html><head><meta charset="utf-8"><title>Not found</title></head><body><h1>Page not found / Página no encontrada</h1><a href="/docs/">Documentation / Documentación</a></body></html>\n');
    const report = { pages: rendered.length, redirects: redirects.length, airgapVersion: selection.version, collections: navigation.contexts.map(context => ({ product: context.product, version: context.version, language: context.language, pages: context.pages.length, hidden: context.hidden, home: context.home })), base };
    await write(join(staging, '_offline/build.json'), JSON.stringify(report, null, 2) + '\n');
    await rm(output, { recursive: true, force: true });
    await mkdir(dirname(output), { recursive: true });
    await rename(staging, output);
    return report;
  } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const report = await buildSite({ progress: console.log });
  console.log(`Built ${report.pages} pages and ${report.redirects} redirects at ${join(HERE, 'dist')} (base ${report.base})`);
}
