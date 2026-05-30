#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.local.yml)

echo "Rebuilding and restarting local admin with nginx..."
docker compose "${COMPOSE_FILES[@]}" build admin
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps admin
docker compose "${COMPOSE_FILES[@]}" --profile local-gateway up -d --no-deps nginx

cat <<'EOF'

Local admin is available at:
  Admin panel: http://127.0.0.1:3015/admin

Useful commands:
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f admin
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f nginx
EOF
