#!/bin/sh
set -eu
url=${1:-http://localhost:8787/digest/2026-10-28}
output=${2:?Pass an output path outside the repository}
curl --fail --silent --show-error "$url" -o "$output"
