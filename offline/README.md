# Offline documentation

This build compiles the repository's MDX into HTML, local styles, browser scripts and collection-specific search indexes. The resulting site uses no Mintlify runtime, API, CDN, hosted search, analytics or external font requests. Explicit links to other websites remain online links. Remote images and embedded media become labelled links instead of background network requests.

## Build and verify

From this repository:

```sh
npm --prefix offline ci --ignore-scripts
npm --prefix offline test
npm --prefix offline run build
```

Serve `offline/dist` at `/docs`, rather than opening the files with `file://`. The browser loads its local search index using a same-origin request. The build reads `docs.json`, preserving products, versions, languages, sidebar groups, hidden pages and redirects. The first language in each canonical navigation array is the entry default; Spanish comes first. Explicit English routes and same-page language/version links remain available. Product and version pickers stay in the header, the language picker stays at the sidebar footer, and main-product tabs select their own sidebar. All top-level Zylon Code groups remain expanded. Hidden Zylon Code has its own direct routes and scoped search, and is omitted from the main product's navigation/search. Its unlisted status is not authentication.

`render.mjs` owns MDX compilation and local component equivalents; `navigation.mjs` owns collection/page identity and switching; `template.mjs` owns page HTML; `build.mjs` owns the static artifact. Components such as steps, warnings, tabs, cards and accordions use ordinary HTML. Tabs are accessible disclosure panels rather than depending on a JavaScript component framework. Code is displayed as readable plain text, without a hosted syntax highlighter. Unknown components and non-MDX module imports fail explicitly. The compiler processes trusted repository content at build time; it is not a public MDX-upload service.

The build copies only public images, files, logos, the favicon and its own browser assets. It does not publish source MDX, snippets, `.codex`, `.git`, npm dependencies or build tools. Missing local image/media references fail the build. External links and APIs described in examples still need their own connectivity if a reader chooses to use them.

## Build a runtime image

Run with the documentation repository as Docker context:

```sh
docker build -f offline/Dockerfile -t zylon-docs:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 zylon-docs:local
# Alternatively, run the automated acceptance check without exposing a host port:
bash offline/check-container.sh zylon-docs:local
```

Open `http://localhost:8080/docs/`. Nginx runs as UID 101, listens on 8080 and exposes `/healthz`. Its PID and temporary files stay under writable `/tmp`; the remaining filesystem can be read-only. `/` and `/docs` redirect to `/docs/`. Static assets, search data and article links use the same `/docs` prefix, so a reverse proxy must preserve it. The container performs no npm install, compilation or registry access at runtime. Build-time npm packages and base images must already be available when building without internet.

`Dockerfile.dockerignore` allows only canonical public documentation, public assets and the offline build sources into the Docker context. The final image contains only Nginx and the generated static artifact.

The image is independent of the Zylon application version. A reviewed documentation snapshot can be tagged `docs-<full-documentation-git-sha>`; record that exact tag and its image digest when distributing an airgap installation. Building the image locally does not publish it.

## Continuous integration

`Validate offline documentation` runs on pull requests and pushes to `main`. It builds all registered pages and runs the Node behavior tests inside the Docker build, then starts the image with `--network none`, a read-only root filesystem, UID/GID 101 and writable `/tmp`. The acceptance script checks health, English/Spanish deep routes and language links, every collection's search data, local CSS/JavaScript/logo/downloads, relative redirects and inaccessible source paths. It neither needs AWS credentials nor publishes an image. Release versioning and registry publication are managed separately from this build and validation workflow.

## Limits and maintenance

This is a static reader, not the Mintlify editor or API playground. Copy buttons, local search, appearance controls, navigation menus and mobile navigation are the browser enhancements. Collection menus and sidebar links remain native HTML links without JavaScript. Inter Latin normal/italic fonts are bundled locally with their SIL Open Font License in `assets/fonts/OFL.txt`; no font CDN is contacted. No service worker caches private paths or stale releases. A new image contains the current search indexes and assets. Edit canonical MDX and `docs.json`, then rebuild; never edit `dist` by hand.

`node --test` covers real MDX/snippet compilation, fenced examples, unsupported/cyclic imports, offline media, product/version/language switching, search isolation, artifact exclusions, redirects and failed builds preserving the previous output. The actual repository build remains the acceptance check for the current content.
