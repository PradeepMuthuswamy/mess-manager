#!/usr/bin/env bash
# Design-system token audit. Usage: scripts/ds-audit.sh [path ...]
# Exits non-zero if any banned raw color / font / inline style is found.
set -euo pipefail
TARGETS=("${@:-app components}")
PATTERN='text-(gray|red|green|blue|emerald|slate|zinc|neutral|stone|amber|rose|indigo|violet|teal|cyan|sky|lime|orange|yellow|fuchsia|pink|purple)-[0-9]|bg-(gray|red|green|blue|emerald|slate|zinc|neutral|stone|amber|rose|indigo|violet|teal|cyan|sky|lime|orange|yellow|fuchsia|pink|purple)-[0-9]|border-(gray|red|green|blue|emerald|slate|zinc|neutral|stone)-[0-9]|#[0-9a-fA-F]{3,6}\b|\[oklch|\[rgb|\[hsl|style=\{\{[^}]*(color|background|fontFamily)'
if grep -rnE "$PATTERN" "${TARGETS[@]}" --include='*.tsx' --include='*.ts' --include='*.css' 2>/dev/null; then
  echo "DS AUDIT: FAIL — banned token(s) above"; exit 1
fi
echo "DS AUDIT: PASS (${TARGETS[*]})"
