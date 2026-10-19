#!/usr/bin/env python3
"""Check Zylon Code's bilingual navigation, unlisted state and local references."""
from pathlib import Path
import json
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
ERRORS = []


def check(condition, message):
    if not condition:
        ERRORS.append(message)


def leaves(value):
    if isinstance(value, str):
        return [value]
    if isinstance(value, list):
        return [page for item in value for page in leaves(item)]
    if isinstance(value, dict):
        return [page for key, item in value.items()
                if key in ('products', 'languages', 'tabs', 'groups', 'pages', 'anchors', 'dropdowns', 'versions')
                for page in leaves(item)]
    return []


config = json.loads((ROOT / 'docs.json').read_text())
products = config.get('navigation', {}).get('products', [])
code_products = [product for product in products if product.get('product') == 'Zylon Code']
check(len(code_products) == 1, 'Exactly one Zylon Code product is required')
if not code_products:
    sys.exit('\n'.join(ERRORS))
code = code_products[0]
check(code.get('hidden') is True, 'Zylon Code must remain hidden in product navigation')
for product in products:
    if product is not code:
        check(not any(page.startswith('zylon-code') for page in leaves(product)),
              'Public product navigation contains Zylon Code pages')

languages = {language.get('language'): language for language in code.get('languages', [])}
check(set(languages) == {'en', 'es'}, 'English and Spanish navigation are both required')
check(code.get('languages', [{}])[0].get('language') == 'es', 'Spanish must be the default manual language')
nav_pages = leaves(code)
check(len(nav_pages) == len(set(nav_pages)), 'Duplicate navigation page')
actual_files = {ROOT / 'zylon-code.mdx', *(ROOT / 'zylon-code').rglob('*.mdx')}
check(actual_files == {ROOT / (page + '.mdx') for page in nav_pages},
      'Every Zylon Code MDX page must appear in its sidebar, with no missing files')

if set(languages) == {'en', 'es'}:
    en_groups = languages['en'].get('groups', [])
    es_groups = languages['es'].get('groups', [])
    check(len(en_groups) == len(es_groups), 'Different English/Spanish group counts')
    for en_group, es_group in zip(en_groups, es_groups):
        check(bool(en_group.get('group')) and bool(es_group.get('group')), 'Unnamed sidebar group')
        translated = [page.replace('zylon-code', 'zylon-code/es', 1) for page in leaves(en_group)]
        check(translated == leaves(es_group), f'Page order/parity differs in {en_group.get("group")}')

references = 0
for file in sorted(actual_files):
    if not file.is_file():
        check(False, f'Missing page: {file.relative_to(ROOT)}')
        continue
    text = file.read_text()
    relative = file.relative_to(ROOT)
    match = re.match(r'\A---\n(.*?)\n---\n', text, re.S)
    check(bool(match), f'{relative}: missing frontmatter')
    if match:
        frontmatter = match.group(1)
        check(bool(re.search(r'^title: .+', frontmatter, re.M)), f'{relative}: missing title')
        check(bool(re.search(r'^description: .+', frontmatter, re.M)), f'{relative}: missing description')
        check(bool(re.search(r'^noindex: true$', frontmatter, re.M)), f'{relative}: missing noindex')
        check(not re.search(r'^hidden: true$', frontmatter, re.M), f'{relative}: page hidden from its own sidebar')
    check(text.endswith('\n') and not text.endswith('\n\n'), f'{relative}: trailing newline')
    check('@/' not in text, f'{relative}: unresolved authoring link')
    check(not re.search(r'^\[(?:Read this page in English|Leer esta página en español)\]', text, re.M),
          f'{relative}: use the language picker instead of a translated-page footer')
    check(len(re.findall(r'\S+', text)) >= 80, f'{relative}: empty or incomplete page')
    body = re.sub(r'^```[^\n]*\n.*?^```\s*$', '', text, flags=re.M | re.S)
    urls = re.findall(r'\]\(([^\s)]+)\)', body)
    urls += re.findall(r'(?:href|src)="([^"]+)"', body)
    for url in urls:
        parsed = urlsplit(url)
        if parsed.scheme or parsed.netloc or not parsed.path:
            continue
        target = unquote(parsed.path)
        resolved = ROOT / target.lstrip('/') if target.startswith('/') else file.parent / target
        exists = resolved.is_file() or resolved.with_suffix('.mdx').is_file()
        check(exists, f'{relative}: broken local reference {url}')
        references += 1
    if 'zylon-code/es' not in file.as_posix():
        spanish = ROOT / str(relative).replace('zylon-code', 'zylon-code/es', 1)
        if spanish.is_file():
            check(text != spanish.read_text(), f'{relative}: Spanish page is an English copy')

if ERRORS:
    print('\n'.join(ERRORS), file=sys.stderr)
    sys.exit(1)
print(f'OK: {len(actual_files)} bilingual pages, {references} local references, matching sidebars, hidden product and noindex metadata')
