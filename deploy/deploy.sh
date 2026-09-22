#!/bin/sh
# Ship the working tree to the VM and rebuild. Needs .env.prod locally (provider keys, TUNNEL_TOKEN, PUBLIC_HOST).
set -e
GC=${GC:-/opt/homebrew/share/google-cloud-sdk/bin/gcloud}
VM=${VM:-steno}
ZONE=${ZONE:-us-central1-a}
ssh() { $GC --configuration=personal compute ssh "$VM" --project teejayproject --zone "$ZONE" --quiet -- "$@"; }
cd "$(dirname "$0")/.."
COPYFILE_DISABLE=1 tar --no-xattrs -czf - --exclude .git --exclude .venv --exclude web/node_modules --exclude web/dist --exclude chat/static . | ssh 'mkdir -p app && tar xzf - -C app'
ssh 'cat > app/.env' < .env.prod
ssh 'cd app && sudo docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d --build && sudo docker image prune -f'
