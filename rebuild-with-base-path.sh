#!/bin/bash
set -e

echo "========================================="
echo "Rebuilding PEP Tracker with /pep base path"
echo "========================================="

cd /root/PEP-Tracker

echo ""
echo "Step 1: Stopping PM2 app..."
pm2 stop pep-tracker

echo ""
echo "Step 2: Rebuilding with BASE_PATH=/pep..."
BASE_PATH=/pep npm run build

echo ""
echo "Step 3: Restarting PM2 app..."
pm2 restart pep-tracker

echo ""
echo "Step 4: Checking status..."
pm2 status

echo ""
echo "========================================="
echo "✓ Rebuild Complete!"
echo "========================================="
echo ""
echo "Your PEP Tracker should now work at:"
echo "  → https://omwajage.live/pep"
echo ""
echo "If still not working, check logs:"
echo "  pm2 logs pep-tracker"
echo "========================================="
