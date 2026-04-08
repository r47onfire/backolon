#! /bin/zsh
set -exuo pipefail
pnpm build-for-fuzzer
prog=$1
input=$2
echo "$input" | node -e "import{fuzz}from'./test/fuzz/$prog.fuzz.cjs';let a='';for await(let c of process.stdin)a+=c;fuzz(a)"
