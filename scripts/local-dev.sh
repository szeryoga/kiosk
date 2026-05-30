#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.local.yml)

echo "Building and starting local services with nginx..."
docker compose "${COMPOSE_FILES[@]}" --profile local-gateway up -d --build postgres backend frontend admin nginx

cat <<'EOF'

Local services are available at:
  Mini app:    http://127.0.0.1:3015/app
  Admin panel: http://127.0.0.1:3015/admin
  Backend API: http://127.0.0.1:3015/api/
  Healthcheck: http://127.0.0.1:3015/health
  Direct API:  http://127.0.0.1:8015/docs

Useful commands:
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f backend
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f nginx
EOF
