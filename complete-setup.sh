#!/bin/bash
set -e

echo "========================================="
echo "PEP Tracker - Complete 24/7 Setup"
echo "========================================="

# Navigate to project directory
cd /root/PEP-Tracker

echo ""
echo "Step 1: Installing Node.js..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt install -y nodejs
fi
echo "Node.js version: $(node -v)"
echo "NPM version: $(npm -v)"

echo ""
echo "Step 2: Installing Chromium for web scraping..."
apt update
apt install -y chromium-browser

echo ""
echo "Step 3: Installing project dependencies..."
npm install

echo ""
echo "Step 4: Building the application..."
npm run build

echo ""
echo "Step 5: Setting up environment variables..."
cat > .env << 'EOF'
NODE_ENV=production
PORT=8080
PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
EOF

echo ""
echo "Step 6: Installing PM2 globally..."
npm install -g pm2

echo ""
echo "Step 7: Stopping any existing PEP Tracker instance..."
pm2 delete pep-tracker 2>/dev/null || true

echo ""
echo "Step 8: Starting PEP Tracker with PM2..."
PORT=8080 PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser pm2 start npm --name "pep-tracker" -- start

echo ""
echo "Step 9: Saving PM2 configuration..."
pm2 save

echo ""
echo "Step 10: Setting up PM2 to start on system boot..."
pm2 startup systemd -u root --hp /root

echo ""
echo "Step 11: Installing and configuring Nginx..."
apt install -y nginx

# Remove default site
rm -f /etc/nginx/sites-enabled/default

# Create Nginx config
cat > /etc/nginx/sites-available/pep-tracker << 'NGINX_EOF'
server {
    listen 80;
    server_name omwajage.live www.omwajage.live;

    # Increase timeouts
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

    # Increase buffer sizes
    client_max_body_size 50M;

    location / {
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
NGINX_EOF

# Enable site
ln -sf /etc/nginx/sites-available/pep-tracker /etc/nginx/sites-enabled/

echo ""
echo "Step 12: Testing Nginx configuration..."
nginx -t

echo ""
echo "Step 13: Restarting Nginx..."
systemctl restart nginx
systemctl enable nginx

echo ""
echo "Step 14: Opening firewall ports..."
ufw allow 80/tcp 2>/dev/null || true
ufw allow 443/tcp 2>/dev/null || true
ufw allow 8080/tcp 2>/dev/null || true

echo ""
echo "========================================="
echo "✓ Setup Complete!"
echo "========================================="
echo ""
echo "Your PEP Tracker is now running 24/7 at:"
echo "  → http://omwajage.live"
echo "  → http://38.247.3.184:8080 (direct access)"
echo ""
echo "PM2 Status:"
pm2 status
echo ""
echo "Useful Commands:"
echo "  pm2 status              - Check app status"
echo "  pm2 logs pep-tracker    - View live logs"
echo "  pm2 restart pep-tracker - Restart app"
echo "  pm2 stop pep-tracker    - Stop app"
echo "  pm2 monit               - Monitor resources"
echo ""
echo "To enable HTTPS (SSL):"
echo "  apt install -y certbot python3-certbot-nginx"
echo "  certbot --nginx -d omwajage.live -d www.omwajage.live"
echo ""
echo "PM2 will automatically restart the app if it crashes"
echo "and start it on system reboot!"
echo "========================================="
