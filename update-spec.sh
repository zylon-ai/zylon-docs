cd $(dirname $0) || exit 1
cd api-reference || exit 1

host=$1
if [ -z "$host" ]; then
  host="https://zylon.me"
fi

curl -q $host/api/openapi.json -o workspace.json || exit 1
curl -q $host/gpt/openapi.json -o pgpt.json || exit 1

function jq-i() {
    # jq in place
    jq "$1" $2 > $2.tmp && mv $2.tmp $2
    rm -f $2.tmp
}

function sed-i() {
    # sed in place, required for macOS, works with -i on linux
    sed "$1" $2 > $2.tmp && mv $2.tmp $2
    rm -f $2.tmp
}

query='.paths
         | to_entries
         | map({path: .key, methods: (.value | to_entries
             | map(select(.value.summary | not)
             | {method: .key, operation: .value}))})
         | map(select(.methods != []))'

# Validate all endpoints have a summary
out="$(jq -r $query workspace.json)"
if [ "$out" != "[]" ]; then
    echo "Workspace endpoints missing summaries"
    echo "$out"
    exit 1
fi

out="$(jq -r $query pgpt.json)"
if [ "$out" != "[]" ]; then
    echo "PGPT endpoints missing summaries"
    echo "$out"
    exit 1
fi

mkdir -p workspace/
npx --yes @mintlify/scraping@latest openapi-file workspace.json -o workspace/

mkdir -p pgpt/
npx --yes @mintlify/scraping@latest openapi-file pgpt.json -o pgpt/
