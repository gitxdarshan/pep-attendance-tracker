#!/bin/bash
set -e

echo "========================================="
echo "Clearing Puppeteer/Chromium Storage"
echo "========================================="

echo ""
echo "Step 1: Checking disk usage..."
df -h /tmp

echo ""
echo "Step 2: Stopping PEP Tracker..."
pm2 stop pep-tracker

echo ""
echo "Step 3: Cleaning Puppeteer cache and temp files..."
rm -rf /tmp/.com.google.Chrome.* 2>/dev/null || true
rm -rf /tmp/puppeteer_dev_chrome_profile-* 2>/dev/null || true
rm -rf /tmp/chromium-* 2>/dev/null || true
rm -rf /root/.cache/puppeteer 2>/dev/null || true
rm -rf /root/.config/chromium 2>/dev/null || true
rm -rf /root/.config/google-chrome 2>/dev/null || true

echo ""
echo "Step 4: Cleaning general temp files..."
find /tmp -type f -name "*.tmp" -mtime +1 -delete 2>/dev/null || true
find /tmp -type d -empty -delete 2>/dev/null || true

echo ""
echo "Step 5: Cleaning old attendance files..."
rm -rf /tmp/attendance/*.xlsx 2>/dev/null || true

echo ""
echo "Step 6: Checking disk usage after cleanup..."
df -h /tmp

echo ""
echo "Step 7: Restarting PEP Tracker..."
pm2 restart pep-tracker

echo ""
echo "Step 8: Checking PM2 status..."
pm2 status

echo ""
echo "========================================="
echo "✓ Storage Cleanup Complete!"
echo "========================================="
echo ""
echo "Disk space freed up!"
echo "PEP Tracker is running again."
echo ""
echo "To prevent this in future, you can set up a cron job:"
echo "  crontab -e"
echo "  Add: 0 2 * * * /root/PEP-Tracker/clear-storage.sh"
echo "========================================="
