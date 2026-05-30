#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if docker compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(docker-compose)
else
  echo "Docker Compose не найден. Установите plugin 'docker compose' или бинарник 'docker-compose'."
  exit 1
fi

"${COMPOSE_CMD[@]}" stop postgres backend frontend admin

cat <<'EOF'

Production services stopped:
  postgres
  backend
  frontend
  admin
EOF
