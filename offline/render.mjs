/** Compile trusted repository MDX with local components; ship no Mintlify runtime. */
import { readFile, stat } from 'node:fs/promises';
import { resolve, dirname, relative, sep, posix } from 'node:path';
import { evaluate } from '@mdx-js/mdx';
import matter from 'gray-matter';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as runtime from 'react/jsx-runtime';
import remarkGfm from 'remark-gfm';
import rehypeSlug from 'rehype-slug';

const h = React.createElement;
export const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const isExternal = value => /^(https?:)?\/\//i.test(value ?? '');
const callout = kind => ({ children, title }) => h('aside', { className: `callout ${kind}` }, title && h('strong', null, title), children);
const externalMedia = ({ src, title = 'Online media / Contenido en línea' }) => h('p', { className: 'external-media' }, h('a', { href: src, rel: 'noreferrer' }, title), ' · Online');
const components = {
  Note: callout('note'), Info: callout('note'), Tip: callout('tip'), Warning: callout('warning'),
  Warn: callout('warning'), Nota: callout('note'), Danger: callout('danger'), Callout: callout('note'),
  Accordion: ({ title, children }) => h('details', null, h('summary', null, title), children),
  AccordionGroup: ({ children }) => h('section', { className: 'accordions' }, children),
  Steps: ({ children }) => h('section', { className: 'steps' }, children),
  Step: ({ title, children }) => h('section', { className: 'step' }, title && h('h3', null, title), children),
  Card: ({ title, href, children }) => h(href ? 'a' : 'section', { className: 'card', ...(href ? { href } : {}) }, title && h('strong', null, title), children),
  CardGroup: ({ children }) => h('section', { className: 'cards' }, children),
  Frame: ({ caption, children }) => h('figure', null, children, caption && h('figcaption', null, caption)),
  Tabs: ({ children }) => h('section', { className: 'tabs' }, React.Children.toArray(children).map((child, index) => React.isValidElement(child) ? React.cloneElement(child, { open: index === 0 }) : child)),
  Tab: ({ title, children, open }) => h('details', { className: 'tab', open }, h('summary', null, title), children),
  CodeGroup: ({ children }) => h('section', { className: 'code-group' }, children),
  Update: ({ label, description, children }) => h('section', { className: 'update' }, h('h2', null, label), description && h('p', null, description), children),
  Badge: ({ children }) => h('span', { className: 'badge' }, children),
  img: ({ src, alt, srcSet: _srcSet, srcset: _srcset, ...props }) => isExternal(src) ? externalMedia({ src, title: alt || 'Online image / Imagen en línea' }) : h('img', { ...props, src, alt: alt ?? '', loading: 'lazy' }),
  iframe: externalMedia,
  video: props => isExternal(props.src) ? externalMedia(props) : h('video', { ...props, controls: true }),
  audio: props => isExternal(props.src) ? externalMedia(props) : h('audio', { ...props, controls: true }),
  source: ({ src, srcSet: _srcSet, srcset: _srcset, ...props }) => isExternal(src) ? null : h('source', { ...props, src }),
  link: props => externalMedia({ src: props.href, title: 'Linked resource / Recurso enlazado' }),
  script: () => { throw new Error('Executable page scripts are not supported by the offline renderer'); },
};
const mediaComponents = { img: 'OfflineImage', iframe: 'OfflineEmbed', video: 'OfflineVideo', audio: 'OfflineAudio', source: 'OfflineSource', link: 'OfflineLink', script: 'OfflineScript' };
for (const [tag, name] of Object.entries(mediaComponents)) components[name] = components[tag];

// Explicit lowercase JSX bypasses MDX's component map unless its AST name changes.
function remapMedia(node) {
  if ((node.type === 'mdxJsxFlowElement' || node.type === 'mdxJsxTextElement') && mediaComponents[node.name]) node.name = mediaComponents[node.name];
  for (const child of node.children ?? []) remapMedia(child);
}

function containedPath(root, from, specifier) {
  if (!specifier.endsWith('.mdx')) throw new Error(`Unsupported MDX import: ${specifier}`);
  const path = specifier.startsWith('/') ? resolve(root, '.' + specifier) : resolve(dirname(from), specifier);
  const rel = relative(root, path);
  if (!rel || rel === '..' || rel.startsWith('..' + sep)) throw new Error(`MDX import escapes source: ${specifier}`);
  return path;
}

/** Interpret only default MDX imports; imports in fenced code are ordinary examples. */
export function createRenderer(source) {
  const root = resolve(source), cache = new Map();
  async function load(file, parents = []) {
    if (parents.includes(file)) throw new Error(`Cyclic MDX import: ${file}`);
    if (cache.has(file)) return cache.get(file);
    const pending = (async () => {
      const { data, content } = matter(await readFile(file, 'utf8'));
      const imported = {};
      const resolveImports = () => async tree => {
        for (const node of tree.children.filter(child => child.type === 'mdxjsEsm')) {
          for (const declaration of node.data?.estree?.body ?? []) {
            if (declaration.type !== 'ImportDeclaration' || declaration.specifiers.length !== 1
              || declaration.specifiers[0].type !== 'ImportDefaultSpecifier') throw new Error(`Unsupported module declaration in ${file}`);
            const specifier = declaration.source.value;
            imported[declaration.specifiers[0].local.name] = (await load(containedPath(root, file, specifier), [...parents, file])).Component;
          }
        }
        tree.children = tree.children.filter(child => child.type !== 'mdxjsEsm');
        remapMedia(tree);
      };
      const module = await evaluate(content, { ...runtime, remarkPlugins: [resolveImports, remarkGfm], rehypePlugins: [rehypeSlug] });
      const Component = () => h(module.default, { components: { ...components, ...imported } });
      return { data, Component };
    })();
    cache.set(file, pending);
    return pending;
  }
  return async file => {
    try {
      const { data, Component } = await load(resolve(file));
      return { data, html: renderToStaticMarkup(h(Component)) };
    } catch (error) { throw new Error(`${relative(root, file)}: ${error.message}`, { cause: error }); }
  };
}

/** Prefix local URLs once; explicit external links remain optional online navigation. */
export function localUrl(value, base = '/docs', route = '/') {
  if (!value || value.startsWith('#') || /^[a-z][\w+.-]*:/i.test(value) || value.startsWith('//')) return value;
  if (value === base || value.startsWith(base + '/')) return value;
  const resolved = value.startsWith('/') ? value : posix.join(posix.dirname(route), value);
  return base + resolved.replace(/\.mdx?(?=[?#]|$)/, '');
}

/** Reject network-loaded resources, including CSS URLs; only explicit links may leave the site. */
export function rewriteHtml(html, base = '/docs', route = '/') {
  const rewritten = html.replace(/\b(href|src|poster)="([^"\n]*)"/g, (_match, attr, value) => `${attr}="${localUrl(value, base, route)}"`);
  if (/\b(?:src|poster)="(?:https?:)?\/\//i.test(rewritten) || /\bsrcset="[^"\n]*(?:https?:)?\/\//i.test(rewritten) || /url\(['"]?(?:https?:)?\/\//i.test(rewritten)) {
    throw new Error('Offline page retains an external resource');
  }
  return rewritten;
}

/** Fail a missing local image/media reference before publishing an artifact. */
export async function verifyAssets(html, root, base = '/docs') {
  for (const [, raw] of html.matchAll(/\b(?:src|poster)="([^"\n]+)"/g)) {
    if (raw.startsWith('data:')) continue;
    const path = decodeURIComponent(raw.split(/[?#]/)[0]);
    const local = path.startsWith(base + '/') ? path.slice(base.length) : path;
    const file = resolve(root, '.' + local), rel = relative(root, file);
    if (!rel || rel === '..' || rel.startsWith('..' + sep)) throw new Error(`Asset escapes source: ${raw}`);
    let info;
    try { info = await stat(file); } catch (error) { throw new Error(`Missing asset: ${raw}`, { cause: error }); }
    if (!info.isFile()) throw new Error(`Missing asset: ${raw}`);
  }
}
