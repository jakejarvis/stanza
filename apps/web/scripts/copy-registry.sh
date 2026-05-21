#!/usr/bin/env bash
set -euo pipefail

# Build the registry (if it isn't already built) and copy its JSON output
# (dist/registry/) into apps/web/public/registry/ so the deployed web app
# serves it from the same origin.
#
# dist/registry/ is gitignored, so on a clean checkout (e.g. Vercel's remote
# build) there's nothing to copy — we build it here. Locally, a prior
# `pnpm registry:build` is reused as-is.
#
# The web app is the canonical registry host. The published CLI's default
# STANZA_REGISTRY points at this same /registry/ URL.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$here/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"

src="$repo_root/dist/registry"
dest="$app_dir/public/registry"

if [[ ! -d "$src" ]]; then
  echo "[copy-registry] $src not found — building registry..." >&2
  # Prefer bun for maintainer convenience; fall back to tsx (resolvable via
  # the workspace's vite/vitest) on node-only deploy targets like Vercel.
  if command -v bun >/dev/null 2>&1; then
    (cd "$repo_root" && bun scripts/registry-build.ts)
  else
    (cd "$repo_root" && pnpm exec tsx scripts/registry-build.ts)
  fi
fi

rm -rf "$dest"
mkdir -p "$(dirname "$dest")"
cp -R "$src" "$dest"
echo "[copy-registry] ${src#"$repo_root/"} → ${dest#"$repo_root/"}"
