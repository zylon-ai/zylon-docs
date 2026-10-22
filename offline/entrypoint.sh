#!/bin/sh
# Choose a precompiled manual; only /tmp changes on the read-only filesystem.
set -eu
root=/usr/share/zylon-docs
version=${AIRGAP_VERSION-$(cat "$root/default-version")}
version=$(printf '%s' "$version" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//')
site=$root/all
while IFS= read -r available; do
  if [ -n "$available" ] && [ "$version" = "$available" ]; then
    site=$root/versions/$available
    break
  fi
done < "$root/versions.txt"
ln -sfn "$site" /tmp/zylon-docs
exec nginx "$@"
