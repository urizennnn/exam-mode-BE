#!/usr/bin/env bash
set -euo pipefail

IMAGE="$1"
COLOR="$2"
APP_NAME="exam-be"
NETWORK="exam-net"
HEALTH_ENDPOINT="/health"
PORT=$(shuf -i 4000-4999 -n 1)

# ensure network exists
if ! docker network ls --format '{{.Name}}' | grep -q "^${NETWORK}$"; then
  docker network create "${NETWORK}"
fi

docker pull "$IMAGE"

NEW_CONTAINER="${APP_NAME}-${COLOR}"

docker run -d \
  --name "$NEW_CONTAINER" \
  --network "$NETWORK" \
  --network-alias "${APP_NAME}-active" \
  -p "$PORT:8080" \
  --label color="$COLOR" \
  "$IMAGE"

for i in {1..20}; do
  if curl -fs "http://localhost:${PORT}${HEALTH_ENDPOINT}" >/dev/null; then
    READY=1
    break
  fi
  sleep 3
done

if [ "${READY:-0}" != "1" ]; then
  echo "Health check failed" >&2
  docker logs "$NEW_CONTAINER" >&2
  exit 1
fi

OLD_CONTAINER=$(docker ps --filter "name=${APP_NAME}-" --filter "label=color" --format '{{.Names}}' | grep -v "$NEW_CONTAINER" || true)

if [ -n "$OLD_CONTAINER" ]; then
  docker network disconnect "$NETWORK" "$OLD_CONTAINER" || true
fi

if [ -n "$OLD_CONTAINER" ]; then
  docker stop "$OLD_CONTAINER" && docker rm "$OLD_CONTAINER"
fi

docker image prune -f
