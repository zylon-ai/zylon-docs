#!/usr/bin/env bash
# Exercise the actual image with the runtime restrictions used by the Helm chart.
set -euo pipefail

image=${1:?Usage: bash offline/check-container.sh IMAGE}
expected_airgap_version=${2:-}
scratch=$(mktemp -d)
container=
cleanup() {
  result=$?
  if [ -n "$container" ]; then
    if [ "$result" -ne 0 ]; then docker logs "$container" >&2 || true; fi
    docker rm -f "$container" >/dev/null || true
  fi
  rm -rf "$scratch"
}
trap cleanup EXIT
container=$(docker run -d --network none --read-only --user 101:101 \
  --tmpfs /tmp:rw,noexec,nosuid,nodev,size=64m,uid=101,gid=101,mode=0770 \
  --cap-drop ALL --security-opt no-new-privileges "$image")

fetch() { docker exec "$container" wget -q -O - "http://127.0.0.1:8080$1"; }
ready=false
for attempt in $(seq 1 30); do
  if [ "$(fetch /healthz 2>/dev/null || true)" = ok ]; then ready=true; break; fi
  sleep 1
done
if [ "$ready" != true ]; then printf 'Container failed to become ready\n' >&2; exit 1; fi

# Execute requests inside the network-isolated container; no published port is needed.
fetch /docs/zylon-code/getting-started/first-task > "$scratch/en.html"
fetch /docs/zylon-code/es/getting-started/first-task > "$scratch/es.html"
grep -q '<html lang="en"' "$scratch/en.html"
grep -q '<html lang="es"' "$scratch/es.html"
grep -q 'noindex,nofollow' "$scratch/en.html"
grep -q 'href="/docs/zylon-code/es/getting-started/first-task"' "$scratch/en.html"
grep -q 'href="/docs/zylon-code/getting-started/first-task"' "$scratch/es.html"
fetch /docs/ > "$scratch/home.html"
grep -q 'url=/docs/es/' "$scratch/home.html"

fetch /docs/_offline/build.json > "$scratch/build.json"
python3 - "$scratch/build.json" "$expected_airgap_version" <<'PY'
import json, sys
assert json.load(open(sys.argv[1]))['airgapVersion'] == sys.argv[2], 'Unexpected airgap documentation selection'
PY
python3 - "$scratch/build.json" > "$scratch/homes.txt" <<'PY'
import json, sys
report = json.load(open(sys.argv[1]))
for context in report['collections']:
    if context['product'] == 'Zylon':
        print('/docs' + context['home'])
PY
while IFS= read -r route; do
  fetch "$route" > "$scratch/main.html"
  python3 - "$scratch/build.json" "$scratch/main.html" <<'PY'
import json, re, sys
report = json.load(open(sys.argv[1]))
html = open(sys.argv[2]).read()
if report['airgapVersion']:
    assert not re.search(r'(?:mobile-)?version-picker|/docs/(?:en|es)/v[0-9]', html)
    assert 'language-picker' in html
else:
    assert 'version-picker' in html
PY
done < "$scratch/homes.txt"

python3 - "$scratch/build.json" > "$scratch/collections.txt" <<'PY'
import json,sys
with open(sys.argv[1]) as file: report=json.load(file)
assert report['base']=='/docs' and report['pages']>0 and report['redirects']>0
for collection in report['collections']:
    def slug(value):
        import re
        return re.sub('[^a-z0-9]+','-',value.lower()).strip('-')
    print('/docs/_offline/search/'+'/'.join(map(slug,[collection['product'],collection['version'] or 'current',collection['language']]))+'.json')
PY
while IFS= read -r route; do
  fetch "$route" > "$scratch/search.json"
  python3 - "$scratch/search.json" <<'PY'
import json,sys
with open(sys.argv[1]) as file: records=json.load(file)
assert records and all(page['href'].startswith('/docs/') for page in records)
PY
done < "$scratch/collections.txt"

fetch /docs/_offline/site.css > "$scratch/site.css"
fetch /docs/_offline/site.js > "$scratch/site.js"
fetch /docs/logo/light.svg > "$scratch/logo.svg"
fetch /docs/_offline/fonts/inter-latin.woff2 > "$scratch/font.woff2"
fetch /docs/files/zylon-code/first-task-desktop-en.zip > "$scratch/project-en.zip"
fetch /docs/files/zylon-code/first-task-desktop-es.zip > "$scratch/project-es.zip"
test -s "$scratch/site.css" && test -s "$scratch/site.js" && test -s "$scratch/logo.svg" && test -s "$scratch/font.woff2"
python3 - "$scratch/project-en.zip" "$scratch/project-es.zip" <<'PY'
import sys,zipfile
for path in sys.argv[1:]:
    with zipfile.ZipFile(path) as archive:
        assert archive.testzip() is None
        assert set(archive.namelist()) == {"first-task/brief.md", "first-task/notes.md"}
PY

# Both explicit redirects and Nginx directory redirects must preserve the TLS proxy's origin.
for route in /docs /docs/zylon-code/getting-started/first-task; do
  docker exec "$container" wget -S -O /dev/null "http://127.0.0.1:8080$route" 2> "$scratch/headers.txt"
  grep -Ei '^[[:space:]]*Location: /docs/' "$scratch/headers.txt" >/dev/null
  if grep -Ei '^[[:space:]]*Location: (https?:)?//' "$scratch/headers.txt"; then exit 1; fi
done

for route in /docs/docs.json /docs/.env.airgap /docs/.codex/private.json /docs/.git/config /docs/offline/package.json /docs/snippets/note.mdx /docsmith; do
  if fetch "$route" > /dev/null 2>&1; then printf 'Unexpected public source path: %s\n' "$route" >&2; exit 1; fi
done
printf 'Offline image passed: health, EN/ES deep routes, scoped search, local assets, relative redirects and source exclusions\n'
