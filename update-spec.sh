cd $(dirname $0) || exit 1
cd api-reference || exit 1

host=$1
if [ -z "$host" ]; then
  host="https://zylon.me"
fi

curl -s $host/api/openapi.json -o workspace.json || exit 1
curl -s $host/gpt/openapi.json -o pgpt.json || exit 1

mint openapi-check workspace.json || exit 1
mint openapi-check pgpt.json || exit 1
