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

echo "Building and starting production services..."
"${COMPOSE_CMD[@]}" up -d --build postgres backend frontend admin

cat <<'EOF'

Production services are available to gateway:
  frontend: kiosk-frontend:80
  admin:    kiosk-admin:80
  backend:  kiosk-backend:8000
EOF
