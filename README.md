# Zylon Docs

To edit these docs you don't need any tool but Mintlify CLI is highly recommended!

```
npm i -g mint
```

Open a local preview of your documentation with:

```
mint dev --port 3010
```

Review the docs at `http://localhost:3010` and edit them in your favorite editor.

## Documentation versions

Mintlify's native version selector keeps both releases available in English and Spanish:

- **1.57** remains available at its canonical paths `/en/v1.57/...` and `/es/v1.57/...`. Existing `/en/...` and `/es/...` URLs redirect to the matching 1.57 pages, retaining the documentation restored from commit `77bc5d9fa9789d4a7b8677e20f2b44b0558830c8`, immediately before the 1.58 merge, with navigation corrections from the browser audit.
- **1.58** is the default. Its canonical paths are `/en/v1.58/...` and `/es/v1.58/...`. It includes the 1.58 changelog, upgrade instructions, and API migration guide.

The Zylon product’s `navigation.products[].versions` entries in `docs.json` own their language navigation. Keep 1.58 first as well as `default: true`: Mintlify uses the first version for fresh visits to the site root. The default version controls new navigation; existing unversioned bookmarks remain pinned to 1.57. New pages introduced in 1.58 have redirects from their former unversioned URLs to the 1.58 documentation. Pages reached through in-content links are registered in hidden navigation groups so direct links retain the right release and language. Keep new pages registered even when they should not appear in the sidebar.

Keep the language first and the version second in both releases’ page URLs so Mintlify can match translations and versions without resetting the language or page. Keep internal links within the selected version. Versioned installation snippets live under `snippets/v1.58/`; shared images remain under `images/`. API reference pages are maintained directly in the versioned MDX files; OpenAPI JSON snapshots are not required to render them. The legacy sync workflow and helper scripts remain separate maintenance tooling.

The `Validate versioned docs` GitHub Actions check runs the version guard and redirect regression tests on pull requests and pushes to `main`. Before opening a PR:

```sh
python3 scripts/check-doc-versions.py
python3 -m unittest discover -s scripts/tests
bash -n update-spec.sh
mint broken-links
mint dev --port 3010 --no-open
```

Check version and language switching, an existing 1.57 API page, the matching 1.58 page, the migration guide, and an installation page with imported snippets. The version guard checks the released labels, 1.58 default, and absence of pre-release notices. When promoting a later release, update its expected versions and default in `scripts/check-doc-versions.py` at the same time. Preserve the 1.57 URLs, compatibility redirects, and snapshots.

Home and section landing pages use an explicit `overview` slug so Mintlify can match equivalent pages when switching releases. Existing section-root and `/index` URLs both redirect directly to the corresponding `/overview` page. Never redirect an `/index` alias to its parent path: Mintlify production normalizes these to the same route, creating a self-redirect even when the local preview works. The version checker rejects normalized self-redirects, conflicting aliases, and redirect chains or cycles. Hidden 1.57 landing pages explain topics first documented in 1.58 and link to that release, without asserting feature availability in 1.57. Historical 1.57 upgrade guides explicitly link to the frozen 1.57 preset reference even when read from the 1.58 snapshot.

After publishing, verify the deployed home, section pages, and old bookmarks with real redirect traces. The local preview does not establish hosted routing or search-index behavior. If Cloudflare serves stale HTML or cached redirects, [purge the affected documentation URLs or hostname](https://developers.cloudflare.com/cache/how-to/purge-cache/) after the Mintlify deployment completes, then repeat the public checks. Scope the purge to `docs.zylon.ai`, including affected entry points, legacy aliases, and discovery files. Review the cache rules so documentation HTML and redirects honor origin `Cache-Control` headers; a browser refresh or query parameter may still hit the same edge cache.

## Zylon Code manual

The bilingual user manual starts at `/zylon-code` (English) and `/zylon-code/es` (Spanish). It has 86 pages per language with its own complete sidebar. `docs.json` keeps the existing Zylon navigation under the Zylon product and adds a hidden Zylon Code product. Each manual page carries `noindex: true`. This is unlisted documentation: anyone with the URL can read it after deployment. [Mintlify's hidden-page reference](https://www.mintlify.com/docs/organize/hidden-pages) explains navigation and indexing behavior.

Edit the matching English/Spanish MDX files together and keep both sidebar groups in the same order. Use the native language picker to change language; do not add translated-page links below the article. Spanish is the default language for navigation entry points.

Before previewing:

```sh
python3 scripts/check-zylon-code-docs.py
mint broken-links
mint dev --port 3010 --no-open
```

Product screenshots live in `images/zylon-code/screenshots/`, with a localized image for each interface state. Refresh the Spanish application states, then repeat them in English. Use an isolated Desktop build of the documented `main` revision, a demonstration project and a local model fixture; label fixture/model limitations in the capture record and never publish credentials. License bypasses are limited to a local capture build and loopback domains, and must never enter a release or this documentation repository. The first-task archives are `files/zylon-code/first-task-desktop-en.zip` and `files/zylon-code/first-task-desktop-es.zip`. Each contains two plain Markdown documents for a workshop-plan task; no terminal, runtime, package manager or dependency installation is needed. Retired tutorial and capture evidence stays outside published assets.

Review the two landing pages, a nested plugin guide and an existing main-doc page. Site search is unavailable in local preview; check hosted search and sitemap exclusion after a preview deployment. Optional provider instructions require separate testing with their runtime and credentials.

## Beta feature warnings

Place this badge beside a Beta feature in a page or changelog entry:

```mdx
<button type="button" className="feature-status-badge" data-feature-status="beta" lang="en" aria-haspopup="dialog" aria-label="Beta: read the feature warning">Beta</button>
```

On Spanish pages, use `lang="es"` and `aria-label="Beta: leer la advertencia de la característica"`. Clicking the badge opens a localized warning; readers can close it with the button, Escape, or the backdrop. `feature-status.js` and `feature-status.css` supply the shared behavior and styling for Mintlify and the offline bundle. Use inline HTML so badges also render inside Mintlify's separately compiled `<Update>` entries. Keep a visible `<Warning>` on the feature's configuration page as well. Inside linked cards, use a plain `<Badge color="orange" size="xs">Beta</Badge>` and link to the feature page so buttons are not nested inside links.

## Offline documentation

`offline/` renders the same registered MDX pages and local assets as a standalone site under `/docs`. It uses its own open-source renderer, navigation and local search; it does not ship the Mintlify application or require Enterprise export. External videos remain clearly marked online links. See [the offline build guide](offline/README.md) for build, container and verification steps.

Release images default to the complete versioned site: `AIRGAP_VERSION` is empty in the root `.env.airgap` file. The manual publication workflow accepts an optional `AIRGAP_VERSION` input to generate a selected bilingual image without a version picker or version segments in article routes. Explicit manual selections use independent tags such as `1.1.0-airgap-1.58`, so they coexist with the base release image. Empty input uses the committed setting; unknown selections include all versions. Mintlify navigation and all source versions remain unchanged. See [airgap version selection](offline/README.md#select-an-airgap-version).
