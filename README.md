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

- **1.57** is the default. Its canonical paths are `/en/v1.57/...` and `/es/v1.57/...`. Existing `/en/...` and `/es/...` URLs redirect to the matching 1.57 pages, retaining the documentation restored from commit `77bc5d9fa9789d4a7b8677e20f2b44b0558830c8`, immediately before the 1.58 merge, with navigation corrections from the browser audit.
- **1.58 (Upcoming release)** lives at `/en/v1.58/...` and `/es/v1.58/...`. Its content comes from the merged 1.58 docs (`989cce2cec19d64f4caee50dca564cc49be1cc8e`), including the API migration guide. Every page includes a localized upcoming-release notice.

The `navigation.versions` entries in `docs.json` own their language navigation. Keep the 1.57 entry as `default: true` until the 1.58 image is published. New pages introduced in 1.58 have redirects from their former unversioned URLs to the upcoming documentation. Pages reached through in-content links are registered in hidden navigation groups so direct links retain the right release and language. Keep new pages registered even when they should not appear in the sidebar.

Keep the language first and the version second in both releases’ page URLs so Mintlify can match translations and versions without resetting the language or page. Keep internal links within the selected version. Preview installation snippets live under `snippets/v1.58/`; shared images remain under `images/`. The frozen 1.57 API specs remain in `api-reference/`, while 1.58 specs live in `v1.58/api-reference/`. The scheduled `update-spec.sh` job updates only the latter because Demo tracks the upcoming release. Do not point that job at the frozen specs.

Before opening a PR:

```sh
python3 scripts/check-doc-versions.py
bash -n update-spec.sh
mint broken-links
mint dev --port 3010 --no-open
```

Check version and language switching, an existing 1.57 API page, the matching 1.58 page, the migration guide, and an installation page with imported snippets. When 1.58 ships, change its selector label to `1.58`, move `default: true` to it, and remove the upcoming-release notice imports/usages from its pages. Update the expected default, label, and notice checks in `scripts/check-doc-versions.py` at the same time. Preserve the 1.57 URLs, compatibility redirects, and snapshots.

Home pages use an explicit `overview` slug, and navigation entries omit `/index`, so Mintlify can match equivalent pages when switching releases. Root and `/index` URLs remain compatibility redirects. Hidden 1.57 landing pages explain topics first documented in 1.58 and link to that release, without asserting feature availability in 1.57. Historical 1.57 upgrade guides explicitly link to the frozen 1.57 preset reference even when read from the 1.58 snapshot.
