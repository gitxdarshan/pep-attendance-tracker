#!/bin/bash
set -e

echo "========================================="
echo "Installing Node.js..."
echo "========================================="
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
else
    echo "Node.js already installed: $(node -v)"
fi

echo ""
echo "========================================="
echo "Installing dependencies..."
echo "========================================="
cd /var/www/myapp
npm install --production

echo ""
echo "========================================="
echo "Building application..."
echo "========================================="
npm run build

echo ""
echo "========================================="
echo "Setting up PM2..."
echo "========================================="
npm install -g pm2

# Stop existing app if running
pm2 delete myapp 2>/dev/null || true

# Start the app
pm2 start npm --name "myapp" -- start

# Save PM2 configuration
pm2 save

# Setup PM2 to start on boot
pm2 startup systemd -u root --hp /root

echo ""
echo "========================================="
echo "Opening firewall port 8080..."
echo "========================================="
ufw allow 8080/tcp 2>/dev/null || echo "Firewall not configured (ufw not available)"

echo ""
echo "========================================="
echo "Deployment Complete!"
echo "========================================="
echo "Your app is running at: http://38.247.3.184:8080"
echo ""
echo "Useful commands:"
echo "  pm2 status          - Check app status"
echo "  pm2 logs myapp      - View logs"
echo "  pm2 restart myapp   - Restart app"
echo "  pm2 stop myapp      - Stop app"
echo ""
