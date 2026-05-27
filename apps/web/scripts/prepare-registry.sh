#!/usr/bin/env bash
set -euo pipefail

# Build the registry straight into apps/web/public/ so the deployed web app
# serves it from the same origin. The build emits:
#   - apps/web/public/registry/{index,modules/*}.json
#   - apps/web/public/schema.json
#
# Both targets are gitignored. The web app is the canonical registry host —
# the published CLI's default STANZA_REGISTRY points at this same /registry/ URL.

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
app_dir="$(cd "$here/.." && pwd)"
repo_root="$(cd "$app_dir/../.." && pwd)"

(cd "$repo_root" && pnpm exec jiti packages/registry/src/build.ts "$app_dir/public")
echo "[prepare-registry] → ${app_dir#"$repo_root/"}/public/{registry/,schema.json}"
