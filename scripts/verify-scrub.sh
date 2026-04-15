#!/usr/bin/env bash
#
# verify-scrub.sh — Verify that sensitive data has been removed from git history
#
# Run this AFTER scrub-history.sh to confirm no sensitive strings remain
# in any commit across the entire repository history.

set -euo pipefail

ERRORS=0

check_pattern() {
    local label="$1"
    local pattern="$2"

    echo -n "Checking for $label ... "
    # Search all commits for the pattern
    if git rev-list --all | xargs git grep -l "$pattern" 2>/dev/null | head -1 | grep -q .; then
        echo "FOUND — scrub incomplete!"
        echo "  Commits still containing '$pattern':"
        git rev-list --all | xargs git grep -l "$pattern" 2>/dev/null | head -5
        ERRORS=$((ERRORS + 1))
    else
        echo "clean"
    fi
}

echo "=== Post-Scrub Verification ==="
echo ""

check_pattern "server IP (49.235.162.129)"  '49\.235\.162\.129'
check_pattern "DB password (treatbot123)"    'treatbot123'
check_pattern "MySQL root password (root123)" 'root123'

echo ""
if [ "$ERRORS" -gt 0 ]; then
    echo "FAILED: $ERRORS sensitive pattern(s) still found in history."
    echo "Re-run scrub-history.sh or investigate manually."
    exit 1
else
    echo "PASSED: No sensitive data found in git history."
    echo ""
    echo "Also verify in the working tree:"
    echo "  grep -r '49\.235\.162\.129' --include='*.py' --include='*.sh' --include='*.js' --include='*.ts' --include='*.yml' --include='*.md' ."
    echo "  grep -r 'treatbot123' --include='*.py' --include='*.sh' --include='*.js' --include='*.ts' --include='*.yml' --include='*.md' ."
    echo "  grep -r 'root123' --include='*.py' --include='*.sh' --include='*.js' --include='*.ts' --include='*.yml' --include='*.md' ."
fi
