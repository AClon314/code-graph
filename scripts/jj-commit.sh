#!/usr/bin/env sh
# jj has no commit hooks; run the same fast checks before `jj commit`.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
bun run check:commit
exec jj commit "$@"
