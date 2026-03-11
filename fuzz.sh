#! /bin/zsh
set -exuo pipefail
rm -rf "test/fuzz/inputs/$1"
pnpm jsfuzz "test/fuzz/$1.fuzz.cjs" "test/fuzz/inputs/$1" --only-ascii true
