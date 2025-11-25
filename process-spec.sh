#!/bin/bash

set -e

PLACEHOLDER_HOST="{base_url}"

if ! command -v jq &> /dev/null; then
    echo "Error: jq is required but not installed."
    exit 1
fi

if [ $# -lt 1 ]; then
    echo "Usage: $0 <input_spec_file> [output_spec_file]"
    exit 1
fi

INPUT_FILE="$1"
OUTPUT_FILE="${2:-${INPUT_FILE}}"

if [ ! -f "$INPUT_FILE" ]; then
    echo "Error: Input file '$INPUT_FILE' not found"
    exit 1
fi

TEMP_FILE="${INPUT_FILE}.tmp.$$"

ORIGINAL_PATH=$(jq -r 'if .servers and (.servers | length) > 0 then .servers[0].url else "" end' "$INPUT_FILE")

if [ -z "$ORIGINAL_PATH" ] || [ "$ORIGINAL_PATH" = "null" ]; then
    ORIGINAL_PATH=""
fi

if [ "$ORIGINAL_PATH" = "/" ] || [ "$ORIGINAL_PATH" = "" ]; then
    NEW_URL="https://${PLACEHOLDER_HOST}"
else
    CLEAN_PATH="${ORIGINAL_PATH#/}"
    NEW_URL="https://${PLACEHOLDER_HOST}/${CLEAN_PATH}"
fi

jq --arg new_url "$NEW_URL" '
  if .servers then
    .servers[0].url = $new_url |
    .servers[0].description = "Your Zylon instance (replace '$PLACEHOLDER_HOST' with your actual hostname)"
  else
    .servers = [{
      "url": $new_url,
      "description": "Your Zylon instance (replace '$PLACEHOLDER_HOST' with your actual hostname)"
    }]
  end
' "$INPUT_FILE" > "$TEMP_FILE"

if ! jq empty "$TEMP_FILE" 2>/dev/null; then
    rm -f "$TEMP_FILE"
    exit 1
fi

mv "$TEMP_FILE" "$OUTPUT_FILE"