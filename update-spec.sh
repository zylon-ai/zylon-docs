cd $(dirname $0) || exit 1
cd api-reference || exit 1

host=$1
if [ -z "$host" ]; then
  host="https://zylon.me"
fi
server="$host/api"

curl -s $host/api/openapi.json -o workspace.json || exit 1
curl -s $host/gpt/openapi.json -o pgpt.json || exit 1

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

mint openapi-check api-reference/workspace.json || exit 1
mint openapi-check api-reference/pgpt.json || exit 1
