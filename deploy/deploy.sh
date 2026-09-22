#!/bin/sh
# Build the image here for linux/amd64, ship it, and restart the stack on the VM. The VM never builds:
# an e2-micro spends 4 to 17 minutes on the web and pip stages and serves 502s while it does.
# Needs .env.prod locally (provider keys, PUBLIC_HOST, ADMIN_EMAILS, SESSION_SECRET).
set -eo pipefail
GC=${GC:-/opt/homebrew/share/google-cloud-sdk/bin/gcloud}
VM=${VM:-steno}
ZONE=${ZONE:-us-central1-a}
IMAGE=steno-app:prod
ssh() { $GC --configuration=personal compute ssh "$VM" --project teejayproject --zone "$ZONE" --quiet -- "$@"; }
cd "$(dirname "$0")/.."
docker buildx build --platform linux/amd64 -t "$IMAGE" --load . 2>&1 | grep -E "^ => (ERROR|naming)|error" || true
echo "shipping image"
docker save "$IMAGE" | gzip | ssh 'gunzip | sudo docker load' | tail -1
COPYFILE_DISABLE=1 tar --no-xattrs -czf - docker-compose.yml deploy db grafana | ssh 'mkdir -p app && tar xzf - -C app'
ssh 'cat > app/.env' < .env.prod
ssh 'cd app && sudo docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d --remove-orphans && sudo docker image prune -f >/dev/null'
