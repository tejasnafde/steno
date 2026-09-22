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
# Swap in compressed RAM first; the disk swapfile stays as overflow. Paging an idle process back in from
# a standard persistent disk cost the first request after a quiet spell 10 s or more.
apt-get install -y -q zram-tools >/dev/null 2>&1 || true
sed -i "s/^#\?ALGO=.*/ALGO=zstd/; s/^#\?PERCENT=.*/PERCENT=60/; s/^#\?PRIORITY=.*/PRIORITY=100/" /etc/default/zramswap
systemctl restart zramswap || true
printf 'vm.swappiness=100\nvm.page-cluster=0\n' > /etc/sysctl.d/90-zram.conf && sysctl -q --system
