#! /bin/zsh
set -exuo pipefail
pnpm typedoc --options typedoc.json
pnpm bun typedoc --options typedoc-b.json
rm -rf docs/js
pnpm bun run scripts/build-website.js
