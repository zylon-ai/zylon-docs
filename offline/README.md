# Offline documentation

This build compiles the repository's MDX into HTML, local styles, browser scripts and collection-specific search indexes. The resulting site uses no Mintlify runtime, API, CDN, hosted search, analytics or external font requests. Explicit links to other websites remain online links. Remote images and embedded media become labelled links instead of background network requests.

## Build and verify

From this repository:

```sh
npm --prefix offline ci --ignore-scripts
npm --prefix offline test
npm --prefix offline run build
```

## Select an airgap version

The root `.env.airgap` file sets the default Zylon manual included in release images. It is committed alongside the documentation and contains no credentials. The default is empty, so automatic releases include all versions:

```dotenv
AIRGAP_VERSION=
```

Use an available version from `docs.json`, such as `1.57` or `1.58`, when selecting a manual. Empty, `null` and unknown settings build the complete site with the usual version picker and 1.58 as the default version.

A valid selection builds only that Zylon version, in both languages. Articles use `/docs/es/...` and `/docs/en/...`, without a version segment, version picker or versioned redirect directories. Article links, language links, sidebar entries and search indexes use the same routes. Links to another version's article use the selected equivalent; when that article is absent from the selected version, they open its language's home. Source MDX and `docs.json` remain unchanged. Unversioned products, including the hidden Zylon Code manual, retain their routes and search isolation. Shared public assets remain bundled.

For a local build, `AIRGAP_VERSION` in the process environment overrides the file, including an explicitly empty value. For Docker, use the build argument:

```sh
docker build -f offline/Dockerfile --build-arg AIRGAP_VERSION=1.57 -t zylon-docs:1.57-local .
bash offline/check-container.sh zylon-docs:1.57-local 1.57
# Explicitly empty: build all versions, regardless of the committed setting.
docker build -f offline/Dockerfile --build-arg AIRGAP_VERSION= -t zylon-docs:all-local .
bash offline/check-container.sh zylon-docs:all-local
```

`docker build` without that argument reads `.env.airgap`. A generic root `.env` is not read or copied; keep secrets outside the documentation build context. The setting is applied at build time. Changing a running container's environment does not rebuild the static site.

For automatic releases, the publisher reads `.env.airgap` from the tagged commit. An empty setting publishes the complete site under the documentation release tag, for example `zylon-docs:1.1.0`.

To generate a selected image manually, open **Actions > Publish offline documentation image > Run workflow**. Provide either an existing stable `release_tag` or an exact `documentation_sha`, then fill in the optional **AIRGAP_VERSION** input. Empty input uses the committed file. A nonempty input overrides it for that run and creates a separate immutable image tag:

| Source and manual input | Image tag | Included manual |
| --- | --- | --- |
| `release_tag=v1.1.0`, empty input and default file | `1.1.0` | All versions |
| `release_tag=v1.1.0`, `AIRGAP_VERSION=1.58` | `1.1.0-airgap-1.58` | 1.58 only |
| `documentation_sha=<full-sha>`, `AIRGAP_VERSION=1.57` | `docs-<full-sha>-airgap-1.57` | 1.57 only |
| Any supported source, unknown or `null` input | `<base-tag>-airgap-all` | All versions |

These are tag-format examples; a `release_tag` must already exist as a published release, and its commit must include the airgap selector. Historical snapshots without the selector remain supported with an empty input; a nonempty input for such a snapshot fails explicitly.

The native acceptance check and both platform builds receive the same resolved selection. The publisher verifies the `ai.zylon.docs.airgap-version` image label on both platforms and reports the chosen tag, selection and digest in the job summary. Manual variants coexist with the base image and with other selected versions. An existing tag is reused only if its source and selection match; it is never overwritten. Use the reported variant tag in the deployment's image configuration.

Serve `offline/dist` at `/docs`, rather than opening the files with `file://`. The browser loads its local search index using a same-origin request. The first language in each canonical navigation array is the entry default; Spanish comes first. The product picker stays in the header and the language picker stays at the sidebar footer. The complete build also retains version switching in the header. Main-product tabs select their own sidebar. All top-level Zylon Code groups remain expanded. Hidden Zylon Code has its own direct routes and scoped search, and is omitted from the main product's navigation/search. Its unlisted status is not authentication.

`render.mjs` owns MDX compilation and local component equivalents; `navigation.mjs` owns collection/page identity and switching; `template.mjs` owns page HTML; `build.mjs` owns the static artifact. Components such as steps, warnings, tabs, cards and accordions use ordinary HTML. Tabs are accessible disclosure panels rather than depending on a JavaScript component framework. Code is displayed as readable plain text, without a hosted syntax highlighter. Unknown components and non-MDX module imports fail explicitly. The compiler processes trusted repository content at build time; it is not a public MDX-upload service.

The build copies only public images, files, logos, the favicon and its own browser assets. It does not publish source MDX, snippets, `.codex`, `.git`, npm dependencies or build tools. Missing local image/media references fail the build. External links and APIs described in examples still need their own connectivity if a reader chooses to use them.

## Build a runtime image

Run with the documentation repository as Docker context:

```sh
docker build -f offline/Dockerfile -t zylon-docs:local .
docker run --rm --read-only --tmpfs /tmp -p 8080:8080 zylon-docs:local
# Alternatively, run the automated acceptance check without exposing a host port:
bash offline/check-container.sh zylon-docs:local "$(node offline/airgap.mjs)"
```

Open `http://localhost:8080/docs/`. Nginx runs as UID 101, listens on 8080 and exposes `/healthz`. Its PID and temporary files stay under writable `/tmp`; the remaining filesystem can be read-only. `/` and `/docs` redirect to `/docs/`. Static assets, search data and article links use the same `/docs` prefix, so a reverse proxy must preserve it. The container performs no npm install, compilation or registry access at runtime. Build-time npm packages and base images must already be available when building without internet.

`Dockerfile.dockerignore` allows only canonical public documentation, public assets and the offline build sources into the Docker context. The final image contains only Nginx and the generated static artifact.

The image has its own documentation version. A docs GitHub release `v1.0.0` produces the ECR image `zylon-docs:1.0.0`, regardless of the Zylon application version or beta suffix. The manual `docs-<full-documentation-git-sha>` snapshot path remains available for the current delivery. Neither path changes a cluster or the public Mintlify site.

## GitHub Actions and ECR setup

`Validate offline documentation` runs on pull requests and pushes to `main`. It builds all registered pages and runs the Node behavior tests inside the Docker build, then starts the image with `--network none`, a read-only root filesystem, UID/GID 101 and writable `/tmp`. The acceptance script checks health, English/Spanish deep routes and language links, every collection's search data, local CSS/JavaScript/logo/downloads, relative redirects and inaccessible source paths. It neither needs AWS credentials nor publishes an image.

`Release documentation` maintains a release-please PR on `main`. The initial version is `1.0.0`; subsequent `docs:` and `fix:` commits produce patch releases, `feat:` produces a minor release, and breaking changes produce a major release. The PR updates `version.txt`, `.release-please-manifest.json` and `CHANGELOG.md`. A published stable release triggers `Publish offline documentation image`, which builds the exact tagged commit. Pushing an integration branch or opening a PR does not publish a release or an image.

Before enabling publication:

1. Provision the immutable `zylon-docs` ECR repository through the reviewed infrastructure change, in AWS account `918593742895`, region `us-east-1`. This workflow does not create infrastructure.
2. Grant the `zylon-docs` GitHub repository access to `CI_GITHUB_TOKEN`, with repository contents and pull request write access, and enable GitHub Actions to create pull requests. Release-please uses this token so its release events and release PRs trigger their workflows; the default `GITHUB_TOKEN` does not trigger those downstream workflows. Also provide organization or repository secrets named `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY`. These names match the existing frontend/backend release workflows; their availability for this repository has not been verified. No existing OIDC role is assumed.
3. Give the publishing identity `ecr:GetAuthorizationToken` on `*`, and `ecr:DescribeRepositories`, `ecr:ListImages`, `ecr:DescribeImages`, `ecr:BatchCheckLayerAvailability`, `ecr:BatchGetImage`, `ecr:GetDownloadUrlForLayer`, `ecr:InitiateLayerUpload`, `ecr:UploadLayerPart`, `ecr:CompleteLayerUpload` and `ecr:PutImage` on `arn:aws:ecr:us-east-1:918593742895:repository/zylon-docs`.
4. Merge the reviewed release-please PR when a documentation release is wanted. Wait for its image workflow to finish before selecting that version in `zylon-bom`. The BOM integration checks the Git tag and ECR image before producing distribution artifacts; a release whose image is still building or failed must be retried after publication succeeds.

The publisher checks the AWS account, immutable ECR configuration, tagged Git commit, matching version files and published stable GitHub release. It runs the native-container acceptance check, publishes `linux/amd64` and `linux/arm64`, then verifies both platforms and their `org.opencontainers.image.revision` and version labels. Existing immutable tags are reused only after these checks pass; a mismatched image fails rather than being overwritten. The job summary reports the tag and digest. Arm64 publication uses the platform's Nginx image; runtime acceptance runs on the runner's native architecture.

For a failed release publication, rerun the workflow from `main` with `release_tag: v1.0.0` and an empty `documentation_sha`. For the current SHA-based delivery, pass only the exact full lowercase 40-character `documentation_sha`; the workflow publishes `docs-<sha>` without requiring version files in that older commit. Never supply both inputs. A retry does not invent a tag, change a version or rebuild an existing immutable image.

The separate chart/BOM integration uses `__TAGS_ZYLON_DOCS__` to select a published documentation version. Do not substitute the application version: for example, Zylon `1.58.0-beta5` can use docs `1.0.0`. Keep the current chart's explicit SHA snapshot until the versioned image and BOM integration are ready.

Release behavior tests use the pinned release-please library to generate candidate PRs and execute the publisher's actual shell steps against temporary Git repositories and CLI doubles. They make no GitHub, ECR or Docker calls:

```sh
npm --prefix .github/release-tests ci --ignore-scripts
npm --prefix .github/release-tests test
```

See [AWS's ECR push permissions](https://docs.aws.amazon.com/AmazonECR/latest/userguide/image-push-iam.html) and [the official AWS credentials action](https://github.com/aws-actions/configure-aws-credentials) for IAM and credential setup. Never put access keys in documentation, workflow files or image build arguments.

## Limits and maintenance

This is a static reader, not the Mintlify editor or API playground. Copy buttons, local search, appearance controls, navigation menus and mobile navigation are the browser enhancements. Collection menus and sidebar links remain native HTML links without JavaScript. Inter Latin normal/italic fonts are bundled locally with their SIL Open Font License in `assets/fonts/OFL.txt`; no font CDN is contacted. No service worker caches private paths or stale releases. A new image contains the current search indexes and assets. Edit canonical MDX and `docs.json`, then rebuild; never edit `dist` by hand.

`node --test` covers real MDX/snippet compilation, fenced examples, unsupported/cyclic imports, offline media, product/version/language switching, search isolation, artifact exclusions, redirects and failed builds preserving the previous output. The actual repository build remains the acceptance check for the current content.
