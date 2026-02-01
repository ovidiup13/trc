#!/bin/sh
set -eu

cd /workspace

echo "Installing dependencies"
bun install --no-save

echo "Running lint"
bun run lint

if bun -e "const fs=require('fs');const pkg=JSON.parse(fs.readFileSync('package.json','utf8'));process.exit(pkg.scripts&&pkg.scripts.test?0:1)"; then
  echo "Running tests"
  bun run test
else
  echo "No test script defined, skipping"
fi

echo "Running build"
bun run build
