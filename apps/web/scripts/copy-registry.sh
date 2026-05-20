#!/usr/bin/env bash
set -euo pipefail

# Copy the registry JSON output (dist/registry/) into apps/web/public/registry/
# so the deployed web app serves it from the same origin. Does *not* build the
# registry itself: run `pnpm registry:build` from the repo root first.
#
# The web app is the canonical registry host. The published CLI's default
# STANZA_REGISTRY points at this same /registry/ URL.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$here/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"

src="$repo_root/dist/registry"
dest="$app_dir/public/registry"

if [[ ! -d "$src" ]]; then
  echo "[copy-registry] $src not found." >&2
  echo "Run \`pnpm registry:build\` from the repo root first." >&2
  exit 1
fi

rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
cp -R "$src" "$dest"
echo "[copy-registry] ${src#"$repo_root/"} → ${dest#"$repo_root/"}"
