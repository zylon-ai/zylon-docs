#!/bin/bash
set -e

script_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)

# Demo tracks the upcoming release. Never overwrite the frozen 1.57 specs.
cd "$script_dir/v1.58/api-reference" || exit 1

host=$1
token=$2
if [ -z "$host" ]; then
  host="https://demo.zylon.ai"
fi

# Fetch the OpenAPI specs
echo "Fetching OpenAPI specs from $host"
curl -s $host/api/openapi.json -o workspace.json \
-H "Authorization: Bearer $token" || exit 1
curl -s $host/api/gpt/openapi.json -o pgpt.json \
-H "Authorization: Bearer $token" || exit 1

echo "Validating OpenAPI specs"
mint openapi-check workspace.json || exit 1
mint openapi-check pgpt.json || exit 1

# Process the specs to update server URLs
echo "Processing OpenAPI specs to update environment placeholders"
"$script_dir/process-spec.sh" workspace.json workspace.json || exit 1
"$script_dir/process-spec.sh" pgpt.json pgpt.json || exit 1

mint openapi-check workspace.json || exit 1
mint openapi-check pgpt.json || exit 1
