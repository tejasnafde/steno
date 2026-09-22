#!/bin/sh
# Runs on the VM every two minutes (steno-pull.timer): pull the published image and restart what changed.
# The VM's own service account authenticates to Artifact Registry; the token lasts an hour, so log in each run.
cd /home/tejas/app || exit 1
gcloud auth print-access-token | docker login -u oauth2accesstoken --password-stdin us-central1-docker.pkg.dev >/dev/null 2>&1
docker compose -f docker-compose.yml -f deploy/compose.prod.yml pull -q chat 2>/dev/null
docker compose -f docker-compose.yml -f deploy/compose.prod.yml up -d --remove-orphans 2>&1 | grep -E "Recreat|Started" || true
docker image prune -f >/dev/null
