#!/usr/bin/env zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

COMPOSE_FILES=(-f docker-compose.yml -f docker-compose.local.yml)

echo "Rebuilding and restarting local frontend with nginx..."
docker build \
  -t kiosk-frontend \
  --build-arg VITE_API_BASE=/api \
  --build-arg VITE_APP_BASE=/app/ \
  ./frontend
docker compose "${COMPOSE_FILES[@]}" up -d --no-deps frontend
docker compose "${COMPOSE_FILES[@]}" --profile local-gateway up -d --no-deps nginx

cat <<'EOF'

Local mini app is available at:
  Mini app: http://127.0.0.1:3015/app

Useful commands:
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f frontend
  docker compose -f docker-compose.yml -f docker-compose.local.yml logs -f nginx
EOF
