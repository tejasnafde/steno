#!/bin/sh
# Ship config (compose, Caddyfile, schema, dashboards, .env) to the VM and restart. Images come from
# Artifact Registry: a push to main builds and publishes one (.github/workflows/deploy.yml) and the VM's
# steno-pull.timer picks it up within two minutes. Use this script only when config or .env changed.
set -eo pipefail
GC=${GC:-/opt/homebrew/share/google-cloud-sdk/bin/gcloud}
VM=${VM:-steno}
ZONE=${ZONE:-us-central1-a}
ssh() { $GC --configuration=personal compute ssh "$VM" --project teejayproject --zone "$ZONE" --quiet -- "$@"; }
cd "$(dirname "$0")/.."
COPYFILE_DISABLE=1 tar --no-xattrs -czf - docker-compose.yml deploy db grafana | ssh 'mkdir -p app && tar xzf - -C app'
ssh 'cat > app/.env' < .env.prod
ssh 'sudo /home/tejas/app/deploy/steno-pull.sh'
ssh 'cd app && sudo docker compose -f docker-compose.yml -f deploy/compose.prod.yml exec -T caddy caddy reload --config /etc/caddy/Caddyfile 2>&1 | tail -1'
