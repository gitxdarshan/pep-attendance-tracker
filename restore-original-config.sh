#!/bin/bash
set -e

echo "========================================="
echo "Restoring Original Configuration"
echo "omwajage.live → Old Website (Port 5000)"
echo "38.247.3.184:8080 → PEP Tracker"
echo "========================================="

echo ""
echo "Removing PEP Tracker Nginx config..."
rm -f /etc/nginx/sites-enabled/*
rm -f /etc/nginx/sites-available/pep-tracker

echo ""
echo "Creating original Nginx configuration..."

# Restore original config for domain only
cat > /etc/nginx/sites-available/omwajage.live << 'EOF'
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name omwajage.live;
    return 301 https://$server_name$request_uri;
}

# HTTPS server - Old Website only
server {
    listen 443 ssl http2;
    server_name omwajage.live;

    ssl_certificate /etc/letsencrypt/live/omwajage.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/omwajage.live/privkey.pem;

    location / {
        proxy_pass http://localhost:5000;
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
EOF

echo ""
echo "Enabling configuration..."
ln -s /etc/nginx/sites-available/omwajage.live /etc/nginx/sites-enabled/

echo ""
echo "Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "Restarting Nginx..."
    systemctl restart nginx
    
    echo ""
    echo "Checking PM2 status..."
    pm2 status
    
    echo ""
    echo "========================================="
    echo "✓ Configuration Restored!"
    echo "========================================="
    echo ""
    echo "Your websites are now accessible at:"
    echo "  → https://omwajage.live        (Old Website)"
    echo "  → http://38.247.3.184:8080     (PEP Tracker)"
    echo ""
    echo "PEP Tracker is running 24/7 with PM2"
    echo "========================================="
else
    echo ""
    echo "ERROR: Nginx configuration test failed!"
    exit 1
fi
