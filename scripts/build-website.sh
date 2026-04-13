#! /bin/zsh
set -exuo pipefail

# build Javascript and CSS
pnpm build --minify
pnpm bun typedoc --options typedoc.json
pnpm bun typedoc --options typedoc-b.json
rm -rf docs/js
pnpm bun run scripts/build-website.ts

# build HTML
