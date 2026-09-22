#!/bin/sh
# GCE startup script: Docker plus a 2 GB swapfile so an e2-micro can build the images.
set -e
if ! command -v docker >/dev/null; then
  apt-get update -q && apt-get install -y -q ca-certificates curl
  curl -fsSL https://get.docker.com | sh
fi
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
