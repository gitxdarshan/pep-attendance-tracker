#!/bin/bash
set -e
echo "Installing dependencies..."
cd /var/www/myapp
npm install --production
echo "Building application..."
npm run build
echo "Setting up PM2..."
npm install -g pm2
pm2 delete myapp 2>/dev/null || true
pm2 start npm --name "myapp" -- start
pm2 save
pm2 startup systemd -u root --hp /root || true
echo "Opening firewall port 8080..."
ufw allow 8080/tcp 2>/dev/null || true
echo "Deployment complete!"
echo "App running on http://38.247.3.184:8080"
