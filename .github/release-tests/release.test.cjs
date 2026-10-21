const {test} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} = require('node:fs');
const {join, resolve} = require('node:path');
const {tmpdir} = require('node:os');
const {spawnSync, execFileSync} = require('node:child_process');
const YAML = require('yaml');
const Ajv = require('ajv');
const {Manifest, configSchema, manifestSchema, setLogger} = require('release-please');
const {buildStrategy} = require('release-please/build/src/factory');
const {parseConventionalCommits} = require('release-please/build/src/commit');
const {Version} = require('release-please/build/src/version');
const {TagName} = require('release-please/build/src/util/tag-name');

const root = resolve(__dirname, '../..');
const json = path => JSON.parse(readFileSync(join(root, path), 'utf8'));
const workflow = YAML.parse(readFileSync(join(root, '.github/workflows/publish-offline-docs.yml'), 'utf8'));
const steps = workflow.jobs.publish.steps;
const quiet = {info() {}, debug() {}, warn() {}, error() {}};
setLogger(quiet);
const github = {
  repository: {owner: 'zylon-ai', repo: 'zylon-docs', defaultBranch: 'main'},
  getFileJson: async path => json(path),
};

async function candidate(message, previous) {
  const manifest = await Manifest.fromManifest(github, 'main');
  const strategy = await buildStrategy({...manifest.repositoryConfig['.'], github, targetBranch: 'main', path: '.'});
  const commits = parseConventionalCommits([{sha: 'a'.repeat(40), message, files: ['zylon-code.mdx']}], quiet);
  const release = previous ? {tag: new TagName(Version.parse(previous)), sha: 'b'.repeat(40), notes: ''} : undefined;
  return strategy.buildReleasePullRequest(commits, release);
}

test('release configuration conforms to the pinned release-please schema', () => {
  const ajv = new Ajv({strict: false});
  for (const [schema, path] of [[configSchema, 'release-please-config.json'], [manifestSchema, '.release-please-manifest.json']]) {
    const validate = ajv.compile(schema);
    assert.equal(validate(json(path)), true, JSON.stringify(validate.errors));
  }
});

test('first docs release starts at 1.0.0 and writes its version file', async () => {
  const pr = await candidate('docs: improve desktop installation');
  assert.equal(pr.version.toString(), '1.0.0');
  assert.equal(pr.updates.find(update => update.path === 'version.txt').updater.updateContent('0.0.0\n'), '1.0.0\n');
});

for (const [message, expected] of [
  ['docs: clarify permissions', '1.0.1'],
  ['fix: repair offline search', '1.0.1'],
  ['feat: add offline collection', '1.1.0'],
  ['feat!: remove an offline route', '2.0.0'],
]) {
  test(`${message} proposes ${expected}`, async () => {
    const pr = await candidate(message, '1.0.0');
    assert.equal(pr.version.toString(), expected);
    assert.match(pr.body.toString(), /clarify permissions|repair offline search|add offline collection|remove an offline route/);
  });
}

test('maintenance-only commits do not produce empty releases', async () => {
  assert.equal(await candidate('chore: tidy release tests', '1.0.0'), undefined);
});

// Execute the workflow's real shell steps with local Git and deterministic CLI doubles.
// Nothing in this suite connects to GitHub, AWS or a Docker daemon.
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'zylon-docs-release-'));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const bin = join(dir, 'bin');
  mkdirSync(bin);
  writeFileSync(join(bin, 'gh'), '#!/usr/bin/env bash\nset -eu\nprintf "%s" "$RELEASE_JSON"\n', {mode: 0o755});
  const git = (...args) => execFileSync('git', ['-c', 'user.name=Release Test', '-c', 'user.email=release@example.invalid', ...args], {cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe']}).trim();
  git('init');
  writeFileSync(join(dir, 'version.txt'), '1.0.0\n');
  writeFileSync(join(dir, '.release-please-manifest.json'), '{".": "1.0.0"}\n');
  git('add', '.');
  git('commit', '-m', 'chore: release 1.0.0');
  git('tag', 'v1.0.0');
  const sha = git('rev-parse', 'HEAD');
  const env = {...process.env, DOCS_SHA: '', RELEASE_TAG: '', BASE_IMAGE_TAG: '1.0.0', REQUESTED_AIRGAP_VERSION: '', RUNNER_TEMP: dir, GITHUB_OUTPUT: join(dir, 'output'), GITHUB_REPOSITORY: 'zylon-ai/zylon-docs', PATH: `${bin}:${process.env.PATH}`, RELEASE_JSON: JSON.stringify({tag_name: 'v1.0.0', draft: false, prerelease: false})};
  return {dir, bin, sha, git, run(step, overrides = {}) {
    writeFileSync(env.GITHUB_OUTPUT, '');
    const script = steps.find(item => item.id === step || item.name === step).run;
    const result = spawnSync('bash', ['--noprofile', '--norc', '-e', '-o', 'pipefail', '-c', script], {cwd: dir, env: {...env, ...overrides}, encoding: 'utf8'});
    return {...result, output: readFileSync(env.GITHUB_OUTPUT, 'utf8')};
  }};
}

test('snapshot dispatch resolves its exact SHA without release files or GitHub access', t => {
  const f = fixture(t);
  rmSync(join(f.bin, 'gh'));
  rmSync(join(f.dir, 'version.txt'));
  rmSync(join(f.dir, '.release-please-manifest.json'));
  assert.equal(f.run('source', {DOCS_SHA: f.sha}).output, `ref=${f.sha}\n`);
  const result = f.run('image', {DOCS_SHA: f.sha});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `tag=docs-${f.sha}\nsha=${f.sha}\n`);
  assert.notEqual(f.run('image', {DOCS_SHA: '0'.repeat(40)}).status, 0);
});

test('published stable release resolves to its own version and commit', t => {
  const f = fixture(t);
  assert.equal(f.run('source', {RELEASE_TAG: 'v1.0.0'}).output, 'ref=refs/tags/v1.0.0\n');
  const result = f.run('image', {RELEASE_TAG: 'v1.0.0'});
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.output, `tag=1.0.0\nsha=${f.sha}\n`);
});

test('ambiguous, mutable and prerelease inputs cannot select an image', t => {
  const f = fixture(t);
  for (const input of [{}, {DOCS_SHA: f.sha, RELEASE_TAG: 'v1.0.0'}, {DOCS_SHA: 'main'}, {RELEASE_TAG: 'main'}, {RELEASE_TAG: 'v1.58.0-beta5'}, {RELEASE_TAG: 'v01.0.0'}]) {
    assert.notEqual(f.run('source', input).status, 0, JSON.stringify(input));
  }
});

test('release tag must match the checked-out commit and both version records', t => {
  const f = fixture(t);
  writeFileSync(join(f.dir, 'version.txt'), '2.0.0\n');
  assert.notEqual(f.run('image', {RELEASE_TAG: 'v1.0.0'}).status, 0);
  writeFileSync(join(f.dir, 'version.txt'), '1.0.0\n');
  writeFileSync(join(f.dir, '.release-please-manifest.json'), '{".": "2.0.0"}');
  assert.notEqual(f.run('image', {RELEASE_TAG: 'v1.0.0'}).status, 0);
  f.git('commit', '--allow-empty', '-m', 'docs: later change');
  assert.notEqual(f.run('image', {RELEASE_TAG: 'v1.0.0'}).status, 0);
});

test('draft, prerelease and mismatched GitHub releases cannot publish images', t => {
  const f = fixture(t);
  for (const release of [{tag_name: 'v1.0.0', draft: true, prerelease: false}, {tag_name: 'v1.0.0', draft: false, prerelease: true}, {tag_name: 'v2.0.0', draft: false, prerelease: false}]) {
    assert.notEqual(f.run('image', {RELEASE_TAG: 'v1.0.0', RELEASE_JSON: JSON.stringify(release)}).status, 0);
  }
});

test('publisher defaults to all versions and manual selections receive independent immutable tags', t => {
  const f = fixture(t);
  const step = 'airgap';
  assert.equal(f.run(step).output, 'version=\ntag=1.0.0\n');
  const oldSnapshot = f.run(step, {REQUESTED_AIRGAP_VERSION: '1.58'});
  assert.notEqual(oldSnapshot.status, 0);
  assert.match(oldSnapshot.stderr, /does not support AIRGAP_VERSION/);
  mkdirSync(join(f.dir, 'offline'));
  for (const name of ['airgap.mjs', 'navigation.mjs']) {
    writeFileSync(join(f.dir, 'offline', name), readFileSync(join(root, 'offline', name)));
  }
  writeFileSync(join(f.dir, 'docs.json'), JSON.stringify({navigation: {products: [{product: 'Zylon', versions: ['1.57', '1.58 (Upcoming release)'].map(version => ({version, languages: ['es', 'en'].map(language => ({language, pages: [`${language}/v${version.split(' ')[0]}/intro`]}))}))}]}}));
  writeFileSync(join(f.dir, '.env.airgap'), 'AIRGAP_VERSION=\n');
  assert.equal(f.run(step).output, 'version=\ntag=1.0.0\n');
  const selected = f.run(step, {REQUESTED_AIRGAP_VERSION: '1.58'});
  assert.equal(selected.status, 0, selected.stderr);
  assert.equal(selected.output, 'version=1.58\ntag=1.0.0-airgap-1.58\n');
  assert.equal(f.run(step, {REQUESTED_AIRGAP_VERSION: '1.57'}).output, 'version=1.57\ntag=1.0.0-airgap-1.57\n');
  assert.equal(f.run(step, {REQUESTED_AIRGAP_VERSION: '1.58', BASE_IMAGE_TAG: `docs-${f.sha}`}).output, `version=1.58\ntag=docs-${f.sha}-airgap-1.58\n`);
  for (const value of ['unknown', 'null']) {
    assert.equal(f.run(step, {REQUESTED_AIRGAP_VERSION: value}).output, 'version=\ntag=1.0.0-airgap-all\n');
  }
});

test('manual input overrides committed selection while an empty input follows the file', t => {
  const f = fixture(t);
  mkdirSync(join(f.dir, 'offline'));
  for (const name of ['airgap.mjs', 'navigation.mjs']) {
    writeFileSync(join(f.dir, 'offline', name), readFileSync(join(root, 'offline', name)));
  }
  writeFileSync(join(f.dir, 'docs.json'), JSON.stringify({navigation: {products: [{product: 'Zylon', versions: ['1.57', '1.58'].map(version => ({version, languages: ['es', 'en'].map(language => ({language, pages: [`${language}/v${version}/intro`]}))}))}]}}));
  writeFileSync(join(f.dir, '.env.airgap'), 'AIRGAP_VERSION=1.57\n');
  assert.equal(f.run('airgap', {AIRGAP_VERSION: 'unknown-ambient-value'}).output, 'version=1.57\ntag=1.0.0\n');
  assert.equal(f.run('airgap', {REQUESTED_AIRGAP_VERSION: '1.58'}).output, 'version=1.58\ntag=1.0.0-airgap-1.58\n');
  assert.equal(f.run('airgap', {REQUESTED_AIRGAP_VERSION: 'null'}).output, 'version=\ntag=1.0.0-airgap-all\n');
});

test('existing images must contain both platforms with the requested revision and version', t => {
  const f = fixture(t);
  writeFileSync(join(f.bin, 'docker'), `#!/usr/bin/env python3
import json, os, sys
args = sys.argv[1:]
if args[:3] == ['buildx', 'imagetools', 'inspect']:
    print(json.dumps({'manifests': [{'platform': {'os': 'linux', 'architecture': a}, 'digest': 'sha256:' + ('a' if a == 'amd64' else 'b') * 64} for a in os.environ['PLATFORMS'].split(',')]}))
elif args[0] == 'pull':
    assert '@sha256:' in args[3], 'Pull must use the child manifest digest'
elif args[:2] == ['image', 'inspect']:
    assert '@sha256:' in args[2], 'Inspection must use the child manifest digest'
    arch = 'amd64' if args[2].endswith('a' * 64) else 'arm64'
    if 'airgap-version' in args[-1]:
        print(os.environ.get('PUBLISHED_AIRGAP_VERSION', ''))
    elif 'revision' in args[-1]:
        print(os.environ['REVISION_' + arch])
    elif 'version' in args[-1]:
        print(os.environ['IMAGE_VERSION'])
    else:
        print('linux/' + os.environ.get('ARCH_' + arch, arch))
else:
    raise SystemExit('Unexpected Docker call: ' + repr(args))
`, {mode: 0o755});
  const input = {REGISTRY: 'example.invalid', ECR_REPOSITORY: 'zylon-docs', IMAGE_TAG: '1.0.0', DOCS_SHA: f.sha, PLATFORMS: 'amd64,arm64', REVISION_amd64: f.sha, REVISION_arm64: f.sha, IMAGE_VERSION: '1.0.0', AIRGAP_VERSION: ''};
  const step = 'Verify both published platforms and their source revision';
  assert.equal(f.run(step, input).status, 0);
  for (const invalid of [{PLATFORMS: 'amd64'}, {ARCH_arm64: 'amd64'}, {REVISION_arm64: 'wrong'}, {REVISION_amd64: 'wrong'}, {IMAGE_VERSION: '1.58.0-beta5'}]) {
    assert.notEqual(f.run(step, {...input, ...invalid}).status, 0, JSON.stringify(invalid));
  }
  assert.equal(f.run(step, {...input, IMAGE_TAG: `docs-${f.sha}`, IMAGE_VERSION: ''}).status, 0);
  assert.equal(f.run(step, {...input, AIRGAP_VERSION: '1.58', PUBLISHED_AIRGAP_VERSION: '1.58'}).status, 0);
  assert.notEqual(f.run(step, {...input, AIRGAP_VERSION: '1.58', PUBLISHED_AIRGAP_VERSION: '1.57'}).status, 0);
  const variant = {...input, IMAGE_TAG: '1.0.0-airgap-1.58', IMAGE_VERSION: '1.0.0-airgap-1.58', AIRGAP_VERSION: '1.58', PUBLISHED_AIRGAP_VERSION: '1.58'};
  assert.equal(f.run(step, variant).status, 0);
  assert.notEqual(f.run(step, {...variant, IMAGE_VERSION: '1.0.0'}).status, 0);
});
