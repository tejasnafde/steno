#!/bin/sh
# One-time, on the VM: install the pull timer (runs as root, which is who runs docker here).
set -e
sudo cp /home/tejas/app/deploy/steno-pull.service /home/tejas/app/deploy/steno-pull.timer /etc/systemd/system/
sudo chmod +x /home/tejas/app/deploy/steno-pull.sh
sudo systemctl daemon-reload
sudo systemctl enable --now steno-pull.timer
systemctl list-timers steno-pull.timer --no-pager | head -3
