set -exu

# build HTML, Javascript and CSS
pnpm build --minify
pnpm bun typedoc --options typedoc.json
pnpm bun typedoc --options typedoc-b.json
pnpm bun run scripts/build-website.ts

# clean up
rm -f typedoc_output.json
