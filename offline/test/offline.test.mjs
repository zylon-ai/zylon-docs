import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm, access, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRenderer, rewriteHtml, localUrl } from '../render.mjs';
import { readNavigation, matchingRoute } from '../navigation.mjs';
import { buildSite } from '../build.mjs';
import { readAirgapVersion, projectAirgap } from '../airgap.mjs';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'zylon-docs-offline-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  async function file(name, text) { const target = join(root, name); await mkdir(join(target, '..'), { recursive: true }); await writeFile(target, text); return target; }
  const source = join(root, 'source'), output = join(root, 'output');
  const config = { name: 'Zylon', favicon: '/favicon.png', logo: { light: '/logo/light.svg' }, navigation: { products: [
    { product: 'Zylon', versions: ['1', '2'].map((version, index) => ({ version, default: index === 0, languages: ['es', 'en'].map(language => ({ language, tabs: [{ tab: 'Manual', pages: [`${language}/v${version}/intro`, { group: 'Hidden', hidden: true, pages: [`${language}/v${version}/hidden`] }] }, { tab: 'Reference', pages: [`${language}/v${version}/reference`] }] })) })) },
    { product: 'Zylon Code', hidden: true, languages: ['es', 'en'].map(language => ({ language, groups: [{ group: 'Code', pages: [language === 'en' ? 'zylon-code' : 'zylon-code/es', `zylon-code/${language === 'es' ? 'es/' : ''}task`] }] })) },
  ] }, redirects: [{ source: '/old', destination: '/en/v1/intro#hello' }] };
  await file('source/docs.json', JSON.stringify(config));
  await file('source/favicon.png', 'fixture');
  await file('source/logo/light.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await file('source/images/example.svg', '<svg xmlns="http://www.w3.org/2000/svg"/>');
  await file('source/files/sample.zip', 'download');
  await file('source/.codex/private.json', '{"private":"must not ship"}');
  await file('source/snippets/note.mdx', '<Warning>Shared warning</Warning>');
  for (const page of readNavigation(config).pages) await file(`source${page.route}.mdx`, `---\ntitle: "${page.route}"\n---\n\nimport Notice from '/snippets/note.mdx'\n\n## Hello\n\n<Notice />\n\n![Example](/images/example.svg)\n\n[Sample](/files/sample.zip)\n\n[Online](https://example.com)\n`);
  return { root, source, output, config, file, airgapVersion: '' };
}

test('MDX imports are resolved while import examples, tables and snippets survive', async t => {
  const f = await fixture(t), render = createRenderer(f.source);
  const file = await f.file('source/example.mdx', `import Note from '/snippets/note.mdx'\n\n<Note />\n\n\`\`\`js\nimport React from 'react';\nexport const x = 1;\n\`\`\`\n\n| A | B |\n|---|---|\n| one | two |\n`);
  const result = await render(file);
  assert.match(result.html, /Shared warning/);
  assert.match(result.html, /import React/);
  assert.match(result.html, /<table>/);
});

test('unknown imports, import cycles and unknown JSX fail explicitly', async t => {
  const f = await fixture(t), render = createRenderer(f.source);
  const js = await f.file('source/js.mdx', `import Wrong from 'node:fs'\n\n<Wrong />`);
  await assert.rejects(render(js), /Unsupported MDX import/);
  const unknown = await f.file('source/unknown.mdx', '<NotAComponent />');
  await assert.rejects(render(unknown), /NotAComponent/);
  const a = await f.file('source/a.mdx', `import B from './b.mdx'\n\n<B />`);
  await f.file('source/b.mdx', `import A from './a.mdx'\n\n<A />`);
  await assert.rejects(render(a), /Cyclic MDX import/);
  const escape = await f.file('source/escape.mdx', `import Bad from '../outside.mdx'\n\n<Bad />`);
  await assert.rejects(render(escape), /escapes source/);
});

test('remote media becomes an explicit link and executable resources are rejected', async t => {
  const f = await fixture(t), render = createRenderer(f.source);
  const file = await f.file('source/media.mdx', '<img src="https://example.com/picture.jpg" alt="Online picture" />\n\n<iframe src="https://example.com/video" />');
  const { html } = await render(file);
  assert.doesNotMatch(html, /<(?:img|iframe)\b/);
  assert.match(html, /href="https:\/\/example.com/);
  assert.throws(() => rewriteHtml('<div style="background:url(https://cdn.example/x)">'), /external resource/);
  assert.throws(() => rewriteHtml('<img srcset="/images/local.png 1x, https://cdn.example/x 2x">'), /external resource/);
  const script = await f.file('source/script.mdx', '<script src="/app.js" />');
  await assert.rejects(render(script), /Executable page scripts/);
  assert.equal(localUrl('../peer.mdx#part', '/docs', '/en/guide/article'), '/docs/en/peer#part');
  assert.equal(localUrl('/docs/en/guide'), '/docs/en/guide');
});

test('navigation keeps hidden product direct access and matches both version and language', async t => {
  const f = await fixture(t), navigation = readNavigation(f.config);
  const page = navigation.pages.find(page => page.route === '/en/v1/intro');
  assert.equal(matchingRoute(navigation, page, { language: 'es' }), '/es/v1/intro');
  assert.equal(matchingRoute(navigation, page, { version: '2' }), '/en/v2/intro');
  const code = navigation.pages.find(page => page.route === '/zylon-code/task');
  assert.equal(matchingRoute(navigation, code, { language: 'es' }), '/zylon-code/es/task');
  assert.equal(code.context.hidden, true);
  assert.equal(navigation.home, '/es/v1/intro');
  assert.equal(matchingRoute(navigation, code, { product: 'Zylon' }), '/en/v1/intro');
});

test('promoting a later default updates offline entry points and cross-product navigation', async t => {
  const f = await fixture(t);
  for (const version of f.config.navigation.products[0].versions) version.default = version.version === '2';
  await f.file('source/docs.json', JSON.stringify(f.config));
  const navigation = readNavigation(f.config);
  assert.equal(navigation.home, '/es/v2/intro');
  const code = navigation.pages.find(page => page.route === '/zylon-code/task');
  assert.equal(matchingRoute(navigation, code, { product: 'Zylon' }), '/en/v2/intro');
  await buildSite(f);
  assert.match(await readFile(join(f.output, 'index.html'), 'utf8'), /url=\/docs\/es\/v2\/intro/);
  assert.match(await readFile(join(f.output, 'old/index.html'), 'utf8'), /url=\/docs\/en\/v1\/intro#hello/);
});

test('real build emits every collection, /docs links, redirects and private-free scoped search', async t => {
  const f = await fixture(t), result = await buildSite(f);
  assert.equal(result.pages, 16);
  const main = await readFile(join(f.output, 'en/v1/intro/index.html'), 'utf8');
  assert.doesNotMatch(main, /Zylon Code/);
  assert.match(main, /href="\/docs\/_offline\/site.css"/);
  assert.match(main, /href="\/docs\/_offline\/feature-status.css"/);
  assert.match(main, /src="\/docs\/_offline\/feature-status.js"/);
  for (const asset of ['feature-status.css', 'feature-status.js']) {
    assert.equal(await readFile(join(f.output, '_offline', asset), 'utf8'),
      await readFile(new URL('../../' + asset, import.meta.url), 'utf8'));
  }
  assert.match(main, /href="\/docs\/es\/v1\/intro"/);
  assert.match(main, /src="\/docs\/images\/example.svg"/);
  assert.doesNotMatch(main, /(?:src|poster)="https?:/);
  const code = await readFile(join(f.output, 'zylon-code/task/index.html'), 'utf8');
  assert.match(code, /Zylon Code/);
  assert.match(code, /noindex,nofollow/);
  assert.match(await readFile(join(f.output, 'old/index.html'), 'utf8'), /\/docs\/en\/v1\/intro#hello/);
  const mainIndex = JSON.parse(await readFile(join(f.output, '_offline/search/zylon/1/en.json'), 'utf8'));
  assert.deepEqual(mainIndex.map(record => record.href), ['/docs/en/v1/intro', '/docs/en/v1/reference']);
  const codeIndex = JSON.parse(await readFile(join(f.output, '_offline/search/zylon-code/current/en.json'), 'utf8'));
  assert.deepEqual(codeIndex.map(record => record.href), ['/docs/zylon-code', '/docs/zylon-code/task']);
  await assert.rejects(access(join(f.output, '.codex')));
  await assert.rejects(access(join(f.output, 'snippets')));
  await assert.rejects(access(join(f.output, 'node_modules')));
  assert.equal(await readFile(join(f.output, 'files/sample.zip'), 'utf8'), 'download');
  assert.match(await readFile(join(f.output, 'index.html'), 'utf8'), /\/docs\/es\/v1\/intro/);
  assert.match(main, /<nav class="site-tabs"/);
  assert.match(main, /href="\/docs\/en\/v1\/reference"/);
  const sidebar = main.match(/<aside id="sidebar"[\s\S]*?<\/aside>/)[0];
  assert.doesNotMatch(sidebar, /href="\/docs\/en\/v1\/reference"/);
  assert.match(code, /<section class="nav-group"><h2>Code<\/h2>/);
  assert.doesNotMatch(code, /<details class="nav-group"/);
  assert.match(code, /class="picker language-picker"/);
  assert.match(code, /Español/);
});

test('missing assets fail without replacing the last successful output', async t => {
  const f = await fixture(t);
  await f.file('output/last-success.txt', 'retained');
  await rm(join(f.source, 'images/example.svg'));
  await assert.rejects(buildSite(f), /Missing asset/);
  assert.equal(await readFile(join(f.output, 'last-success.txt'), 'utf8'), 'retained');
});

test('generated shell images and public symlinks are validated before replacing output', async t => {
  const f = await fixture(t);
  await f.file('output/last-success.txt', 'retained');
  f.config.logo.light = '/logo/missing.svg';
  await f.file('source/docs.json', JSON.stringify(f.config));
  await assert.rejects(buildSite(f), /Missing asset: \/docs\/logo\/missing.svg/);
  assert.equal(await readFile(join(f.output, 'last-success.txt'), 'utf8'), 'retained');
  f.config.logo.light = '/logo/light.svg';
  await f.file('source/docs.json', JSON.stringify(f.config));
  await symlink(join(f.source, '.codex/private.json'), join(f.source, 'images/private.json'));
  await assert.rejects(buildSite(f), /Public asset cannot be a symlink/);
  assert.equal(await readFile(join(f.output, 'last-success.txt'), 'utf8'), 'retained');
});

test('invalid route, duplicate page and redirect overwrite cannot write ambiguous artifacts', async t => {
  const f = await fixture(t);
  const invalid = structuredClone(f.config);
  invalid.navigation.products[0].versions[0].languages[0].tabs[0].pages.push('../private');
  assert.throws(() => readNavigation(invalid), /Invalid documentation route/);
  invalid.navigation.products[0].versions[0].languages[0].tabs[0].pages.pop();
  invalid.navigation.products[0].versions[0].languages[0].tabs[0].pages.push('en//v1/intro');
  assert.throws(() => readNavigation(invalid), /Invalid documentation route/);
  const duplicate = structuredClone(f.config);
  duplicate.navigation.products[0].versions[0].languages[0].tabs[0].pages.push('en/v1/intro');
  assert.throws(() => readNavigation(duplicate), /Duplicate documentation route/);
  f.config.redirects.push({ source: '/en/v1/intro', destination: '/other' });
  await f.file('source/docs.json', JSON.stringify(f.config));
  await assert.rejects(buildSite(f), /Redirect replaces/);
});

test('airgap settings read the non-secret root file and preserve explicit empty overrides', async t => {
  const f = await fixture(t);
  assert.equal(await readAirgapVersion(f.source), '');
  await f.file('source/.env.airgap', '# release setting\nAIRGAP_VERSION="2"\n');
  assert.equal(await readAirgapVersion(f.source), '2');
  assert.equal(await readAirgapVersion(f.source, '1'), '1');
  assert.equal(await readAirgapVersion(f.source, ''), '');
});

test('empty, null and unknown airgap versions retain the normal full build', async t => {
  const f = await fixture(t);
  for (const value of ['', null, undefined, 'not-a-version', '3', 'null']) {
    const selection = projectAirgap(f.config, value);
    assert.equal(selection.config, f.config);
    assert.equal(selection.version, '');
  }
  const report = await buildSite({ ...f, airgapVersion: 'not-a-version' });
  assert.equal(report.pages, 16);
  assert.equal(report.airgapVersion, '');
  assert.match(await readFile(join(f.output, 'en/v1/intro/index.html'), 'utf8'), /version-picker/);
});

test('selected airgap builds contain one version at language-only routes, links and search', async t => {
  const f = await fixture(t);
  await f.file('source/en/v2/intro.mdx', `---\ntitle: Selected version\n---\n\nimport Notice from '/snippets/note.mdx'\n\n<Notice />\n\n[Older peer](/en/v1/reference#details)\n\n[Selected peer](./reference.mdx?mode=full#details)\n\n[Language](/es/v2/intro)\n\n[Alias](/old#explicit)\n\n[Unavailable article](/en/v1/legacy)\n\n[Online reference](/online#reference)\n`);
  f.config.navigation.products[0].versions[0].languages[1].tabs[0].pages.push('en/v1/legacy');
  await f.file('source/en/v1/legacy.mdx', 'Only in version one');
  await f.file('source/zylon-code/task.mdx', `[Main manual](/en/v1/reference#details)`);
  f.config.redirects.push({ source: '/en/v1', destination: '/en/v1/intro' });
  f.config.redirects.push({ source: '/online', destination: 'https://example.test/manual' });
  const before = JSON.stringify(f.config);
  await f.file('source/docs.json', before);
  const report = await buildSite({ ...f, airgapVersion: '2' });
  assert.equal(report.pages, 10);
  assert.equal(report.airgapVersion, '2');
  assert.equal(JSON.stringify(f.config), before);
  const main = await readFile(join(f.output, 'en/intro/index.html'), 'utf8');
  assert.match(main, /Selected version/);
  assert.match(main, /Shared warning/);
  assert.doesNotMatch(main, /(?:mobile-)?version-picker|\/docs\/(?:en|es)\/v[12]\//);
  assert.match(main, /language-picker/);
  assert.match(main, /href="\/docs\/es\/intro"/);
  assert.match(main, /href="\/docs\/en\/reference#details"/);
  assert.match(main, /href="\/docs\/en\/reference\?mode=full#details"/);
  assert.match(main, /href="\/docs\/en\/intro#explicit"/);
  assert.match(main, /href="\/docs\/en\/intro"/);
  assert.match(main, /href="https:\/\/example.test\/manual#reference"/);
  assert.match(await readFile(join(f.output, 'old/index.html'), 'utf8'), /url=\/docs\/en\/intro#hello/);
  assert.match(await readFile(join(f.output, 'index.html'), 'utf8'), /url=\/docs\/es\/intro/);
  assert.match(await readFile(join(f.output, 'zylon-code/task/index.html'), 'utf8'), /href="\/docs\/en\/reference#details"/);
  assert.match(await readFile(join(f.output, 'zylon-code/task/index.html'), 'utf8'), /noindex,nofollow/);
  for (const route of ['en/v1', 'en/v2', 'es/v1', 'es/v2', '.env.airgap']) await assert.rejects(access(join(f.output, route)));
  const index = JSON.parse(await readFile(join(f.output, '_offline/search/zylon/current/en.json'), 'utf8'));
  assert.deepEqual(index.map(record => record.href), ['/docs/en/intro', '/docs/en/reference']);
  await buildSite(f);
  assert.match(await readFile(join(f.output, 'en/v2/intro/index.html'), 'utf8'), /Shared warning/);
});

test('annotated version labels accept their numeric version and each selection uses its own source', async t => {
  const f = await fixture(t);
  f.config.navigation.products[0].versions[1].version = '2 (Archived)';
  for (const input of ['2', '2 (Archived)', ' 2 ']) {
    const selected = projectAirgap(f.config, input);
    assert.equal(selected.version, '2');
    assert.equal(selected.sources.get('/en/intro'), '/en/v2/intro');
  }
  assert.equal(projectAirgap(f.config, '1').sources.get('/en/intro'), '/en/v1/intro');
});

test('single-page version collections keep the original article filename when flattening routes', async t => {
  const f = await fixture(t);
  for (const version of f.config.navigation.products[0].versions) {
    for (const language of version.languages) language.tabs = [{ tab: 'Manual', pages: [`${language.language}/v${version.version}/intro`] }];
  }
  await f.file('source/docs.json', JSON.stringify(f.config));
  const report = await buildSite({ ...f, airgapVersion: '2' });
  assert.equal(report.pages, 6);
  assert.match(await readFile(join(f.output, 'en/intro/index.html'), 'utf8'), /href="\/docs\/es\/intro"/);
  await assert.rejects(access(join(f.output, 'en/v2')));
});

test('quota pages and changelog entries render localized beta triggers', async () => {
  const root = join(import.meta.dirname, '../..'), render = createRenderer(root);
  for (const language of ['en', 'es']) {
    for (const page of ['operator-manual/configuration/features/feat-quotas', 'changelog/overview']) {
      const { html } = await render(join(root, language, 'v1.58', page + '.mdx'));
      assert.ok(html.includes(`lang="${language}"`));
      assert.match(html, /data-feature-status="beta"/);
      assert.match(html, /aria-haspopup="dialog"/);
      assert.match(html, /aria-label="Beta: [^"]+"/);
    }
  }
});
