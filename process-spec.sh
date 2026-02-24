#!/bin/bash

set -e

PLACEHOLDER_HOST="{base_url}"
API_PREFIX="/api"

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed." >&2
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: $0 <input_spec_file> [output_spec_file]" >&2
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${2:-${INPUT_FILE}}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found" >&2
    exit 1
fi

TEMP_FILE="${INPUT_FILE}.tmp.$$"

ORIGINAL_URL=$(jq -r 'if .servers and (.servers | length) > 0 then .servers[0].url else "" end' "$INPUT_FILE")

if [ -z "$ORIGINAL_URL" ] || [ "$ORIGINAL_URL" = "null" ]; then
    NEW_URL="https://${PLACEHOLDER_HOST}${API_PREFIX}"
else
    PATH_PART=$(echo "$ORIGINAL_URL" | sed 's|https\?://[^/]*||; s|/$||')
    PATH_PART=$(echo "$PATH_PART" | sed 's|^/api/|/|; s|^/api$||')
    NEW_URL="https://${PLACEHOLDER_HOST}${API_PREFIX}${PATH_PART}"
fi

DESCRIPTION="Your Zylon instance (replace ${PLACEHOLDER_HOST} with your actual hostname)"

jq --arg new_url "$NEW_URL" --arg desc "$DESCRIPTION" '
  if .servers then
    .servers[0].url = $new_url |
    .servers[0].description = $desc
  else
    .servers = [{"url": $new_url, "description": $desc}]
  end
' "$INPUT_FILE" > "$TEMP_FILE"

if ! jq empty "$TEMP_FILE" 2>/dev/null; then
    echo "Error: Failed to produce valid JSON" >&2
    rm -f "$TEMP_FILE"
    exit 1
fi

mv "$TEMP_FILE" "$OUTPUT_FILE"
echo "Updated servers[0].url to: $NEW_URL"