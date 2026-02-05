#!/bin/bash
# Nginx Setup Script for PEP Tracker on omwajage.live

echo "========================================="
echo "Installing Nginx..."
echo "========================================="
apt update
apt install -y nginx

echo ""
echo "========================================="
echo "Creating Nginx configuration..."
echo "========================================="

# Backup existing config if it exists
if [ -f /etc/nginx/sites-available/omwajage.live ]; then
    cp /etc/nginx/sites-available/omwajage.live /etc/nginx/sites-available/omwajage.live.backup
fi

# Create new Nginx config for PEP Tracker
cat > /etc/nginx/sites-available/pep-tracker << 'EOF'
server {
    listen 80;
    server_name omwajage.live www.omwajage.live;

    # Increase timeouts for long-running requests
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;

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
EOF

echo ""
echo "========================================="
echo "Enabling site configuration..."
echo "========================================="

# Remove old symlink if exists
rm -f /etc/nginx/sites-enabled/pep-tracker
rm -f /etc/nginx/sites-enabled/default

# Create new symlink
ln -s /etc/nginx/sites-available/pep-tracker /etc/nginx/sites-enabled/

echo ""
echo "========================================="
echo "Testing Nginx configuration..."
echo "========================================="
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "========================================="
    echo "Restarting Nginx..."
    echo "========================================="
    systemctl restart nginx
    systemctl enable nginx
    
    echo ""
    echo "========================================="
    echo "Setup Complete!"
    echo "========================================="
    echo "Your PEP Tracker is now accessible at:"
    echo "  http://omwajage.live"
    echo ""
    echo "To enable HTTPS (recommended), run:"
    echo "  apt install -y certbot python3-certbot-nginx"
    echo "  certbot --nginx -d omwajage.live -d www.omwajage.live"
    echo ""
else
    echo ""
    echo "ERROR: Nginx configuration test failed!"
    echo "Please check the configuration and try again."
    exit 1
fi
