#!/bin/sh
set -eu

if [ -n "${GITHUB_ACTIONS:-}" ]; then
	docker buildx build --load --cache-from=type=gha --cache-to=type=gha,mode=max -f docker/Dockerfile.runner -t trc-e2e-runner:latest ../..
else
	docker buildx build --load -f docker/Dockerfile.runner -t trc-e2e-runner:latest ../..
fi
