#!/usr/bin/env sh
# Install tracked git hooks for this submodule. Jujutsu does not run git hooks;
# use scripts/jj-commit.sh / scripts/jj-push.sh when committing with jj.
set -eu
root=$(cd "$(dirname "$0")/.." && pwd)
chmod +x "$root"/.githooks/pre-commit "$root"/.githooks/pre-push
git -C "$root" config core.hooksPath .githooks
echo "installed git hooks: $root/.githooks"
echo "jj users: run scripts/jj-commit.sh or scripts/jj-push.sh"
