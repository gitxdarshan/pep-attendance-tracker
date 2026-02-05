#!/bin/bash
set -e

echo "========================================="
echo "Fixing and Rebuilding PEP Tracker"
echo "========================================="

cd /root/PEP-Tracker

echo ""
echo "Step 1: Stopping PM2 app..."
pm2 stop pep-tracker

echo ""
echo "Step 2: Cleaning old build..."
rm -rf dist/

echo ""
echo "Step 3: Rebuilding without base path..."
npm run build

echo ""
echo "Step 4: Restarting PM2 app..."
pm2 restart pep-tracker

echo ""
echo "Step 5: Waiting for app to start..."
sleep 3

echo ""
echo "Step 6: Checking PM2 status..."
pm2 status

echo ""
echo "Step 7: Checking if app is responding..."
curl -I http://localhost:8080 || echo "App might still be starting..."

echo ""
echo "========================================="
echo "✓ Rebuild Complete!"
echo "========================================="
echo ""
echo "Your PEP Tracker should now work at:"
echo "  → http://38.247.3.184:8080"
echo ""
echo "If still not working, check logs:"
echo "  pm2 logs pep-tracker --lines 50"
echo ""
echo "To see live logs:"
echo "  pm2 logs pep-tracker"
echo "========================================="
