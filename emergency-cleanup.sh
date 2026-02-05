#!/bin/bash
set -e

echo "========================================="
echo "Emergency Disk Cleanup - 99.9% Full!"
echo "========================================="

echo ""
echo "Current disk usage:"
df -h

echo ""
echo "Step 1: Stopping PM2 apps temporarily..."
pm2 stop all

echo ""
echo "Step 2: Clearing Puppeteer/Chromium cache..."
rm -rf /tmp/.com.google.Chrome.* 2>/dev/null || true
rm -rf /tmp/puppeteer_dev_chrome_profile-* 2>/dev/null || true
rm -rf /tmp/chromium-* 2>/dev/null || true
rm -rf /root/.cache/puppeteer 2>/dev/null || true
rm -rf /root/.config/chromium 2>/dev/null || true
rm -rf /root/.config/google-chrome 2>/dev/null || true

echo ""
echo "Step 3: Clearing all temp files..."
rm -rf /tmp/* 2>/dev/null || true

echo ""
echo "Step 4: Clearing npm cache..."
npm cache clean --force

echo ""
echo "Step 5: Clearing PM2 logs..."
pm2 flush

echo ""
echo "Step 6: Clearing system logs..."
journalctl --vacuum-time=1d
find /var/log -type f -name "*.log" -mtime +3 -delete 2>/dev/null || true
find /var/log -type f -name "*.gz" -delete 2>/dev/null || true
find /var/log -type f -name "*.1" -delete 2>/dev/null || true

echo ""
echo "Step 7: APT cleanup..."
apt clean
apt autoclean
apt autoremove -y

echo ""
echo "Step 8: Docker cleanup (if exists)..."
docker system prune -af 2>/dev/null || true

echo ""
echo "Step 9: Finding large files..."
echo "Top 10 largest files:"
find / -type f -size +100M -exec ls -lh {} \; 2>/dev/null | head -10 || true

echo ""
echo "Step 10: Clearing old node_modules if any..."
find /root -name "node_modules" -type d -mtime +30 -prune -exec rm -rf {} \; 2>/dev/null || true

echo ""
echo "Step 11: Restarting PM2 apps..."
pm2 restart all

echo ""
echo "========================================="
echo "Cleanup Complete!"
echo "========================================="
echo ""
echo "Disk usage after cleanup:"
df -h
echo ""
echo "If still full, check these directories:"
echo "  du -sh /var/* | sort -rh | head -10"
echo "  du -sh /root/* | sort -rh | head -10"
echo "  du -sh /tmp/* | sort -rh | head -10"
echo "========================================="
