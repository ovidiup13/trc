#!/bin/sh
set -eu

cd /workspace/examples/basic

mkdir -p /workspace/examples/basic/.turbo
chmod -R a+rwX /workspace/examples/basic

export TURBO_CACHE_DIR=${TURBO_CACHE_DIR:-/workspace/examples/basic/.turbo}
export TURBO_LOG_DIR=${TURBO_LOG_DIR:-/workspace/examples/basic/.turbo}

if [ -n "${E2E_TURBO_API_URL:-}" ]; then
  bun -e "const fs=require('fs');const path='turbo.json';const json=JSON.parse(fs.readFileSync(path,'utf8'));const remote=typeof json.remoteCache==='object'&&json.remoteCache?json.remoteCache:{};json.remoteCache={...remote,enabled:true,apiUrl:process.env.E2E_TURBO_API_URL};fs.writeFileSync(path,JSON.stringify(json,null,2)+'\n');"
fi

if [ ! -d node_modules ]; then
  echo "Installing dependencies"
  bun install --no-save
fi

echo "Running build"
bun run build
