#!/bin/sh
set -eu

sh ./scripts/build-runner.sh &
sh ./scripts/build-server.sh &
wait
