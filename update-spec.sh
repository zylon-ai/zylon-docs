cd $(dirname $0) || exit 1
cd api-reference || exit 1

host=$1
token=$2
if [ -z "$host" ]; then
  host="https://demo.zylon.ai"
fi

curl -s $host/api/openapi.json -o workspace.json \
-H "Authorization: Bearer $token" || exit 1
curl -s $host/api/gpt/openapi.json -o pgpt.json \
-H "Authorization: Bearer $token" || exit 1

mint openapi-check workspace.json || exit 1
mint openapi-check pgpt.json || exit 1
