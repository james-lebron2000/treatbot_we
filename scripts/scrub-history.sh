#!/usr/bin/env bash
#
# scrub-history.sh — Remove sensitive data from git history
#
# This script uses git-filter-repo to replace hardcoded credentials and
# server addresses with safe placeholders across ALL commits.
#
# Prerequisites:
#   pip3 install git-filter-repo
#
# Usage:
#   1. Work on a FRESH CLONE (git-filter-repo requires it):
#        git clone https://github.com/james-lebron2000/treatbot_we.git treatbot_we_scrub
#        cd treatbot_we_scrub
#
#   2. Run this script:
#        bash scripts/scrub-history.sh
#
#   3. Verify no sensitive data remains:
#        bash scripts/verify-scrub.sh
#
#   4. Force-push the rewritten history:
#        git push origin --force --all
#        git push origin --force --tags
#
# IMPORTANT:
#   - All collaborators must re-clone after force-push.
#   - Contact GitHub support to purge cached commit data.
#   - Rotate ALL exposed credentials immediately — scrubbing history
#     does NOT revoke secrets that were already public.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
REPLACEMENTS_FILE="$SCRIPT_DIR/sensitive-replacements.txt"

# --- Pre-flight checks ---

if ! command -v git-filter-repo &>/dev/null; then
    echo "ERROR: git-filter-repo is not installed."
    echo "Install it with: pip3 install git-filter-repo"
    exit 1
fi

if [ ! -f "$REPLACEMENTS_FILE" ]; then
    echo "ERROR: Replacements file not found at $REPLACEMENTS_FILE"
    exit 1
fi

cd "$REPO_ROOT"

# Verify we're in a git repo
if [ ! -d .git ]; then
    echo "ERROR: Not in a git repository root (no .git directory)."
    echo "This script must be run from a FRESH CLONE, not a worktree."
    exit 1
fi

echo "=== Sensitive Data Scrubbing ==="
echo ""
echo "This will rewrite ALL git history to remove sensitive data."
echo "Replacements file: $REPLACEMENTS_FILE"
echo ""
echo "Contents of replacements file:"
cat "$REPLACEMENTS_FILE"
echo ""
read -p "Proceed? (y/N) " confirm
if [[ "$confirm" != "y" && "$confirm" != "Y" ]]; then
    echo "Aborted."
    exit 0
fi

echo ""
echo "Running git-filter-repo --replace-text ..."
git-filter-repo --replace-text "$REPLACEMENTS_FILE" --force

echo ""
echo "=== Done ==="
echo ""
echo "Next steps:"
echo "  1. Run: bash scripts/verify-scrub.sh"
echo "  2. Re-add the remote:  git remote add origin https://github.com/james-lebron2000/treatbot_we.git"
echo "  3. Force-push:         git push origin --force --all"
echo "  4. Force-push tags:    git push origin --force --tags"
echo "  5. Contact GitHub support to purge cached data"
echo "  6. ROTATE ALL EXPOSED CREDENTIALS (passwords, SSH keys, etc.)"
echo "  7. Notify collaborators to re-clone the repository"
