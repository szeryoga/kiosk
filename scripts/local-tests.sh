#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_ARGS=(
  -f "${ROOT_DIR}/docker-compose.yml"
  -f "${ROOT_DIR}/docker-compose.local.yml"
)

TARGET="${1:-backend}"

case "${TARGET}" in
  backend)
    API_BASE="http://backend:8000/api/public"
    PROFILES=(--profile tests)
    UP_SERVICES=(backend)
    ;;
  nginx)
    API_BASE="http://nginx/api/public"
    PROFILES=(--profile local-gateway --profile tests)
    UP_SERVICES=(nginx)
    ;;
  *)
    echo "Usage: $0 [backend|nginx]" >&2
    exit 1
    ;;
esac

docker compose "${COMPOSE_ARGS[@]}" "${PROFILES[@]}" up -d "${UP_SERVICES[@]}"
docker compose "${COMPOSE_ARGS[@]}" "${PROFILES[@]}" run --rm -e API_BASE="${API_BASE}" tests ./tests/run-all.sh
