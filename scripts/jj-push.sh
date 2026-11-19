#!/usr/bin/env sh
# jj has no push hooks; run the push gate explicitly.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
cd "$root"
bun run check:push
exec jj git push "$@"
