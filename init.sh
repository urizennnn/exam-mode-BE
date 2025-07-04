#!/usr/bin/env sh
set -euo pipefail

if command -v yum >/dev/null; then
  yum install -y poppler-utils
elif command -v apk >/dev/null; then
  apk add --no-cache poppler-utils
else
  echo "⚠️ No supported package manager found." >&2
  exit 1
fi

