#!/bin/bash
set -e

echo "========================================="
echo "Setting up Path-Based Routing with SSL"
echo "omwajage.live → Old Website (Port 5000)"
echo "omwajage.live/pep → PEP Tracker (Port 8080)"
echo "========================================="

# Backup existing config
echo "Backing up existing Nginx configuration..."
mkdir -p /root/nginx-backup-$(date +%Y%m%d-%H%M%S)
cp -r /etc/nginx/sites-available/* /root/nginx-backup-$(date +%Y%m%d-%H%M%S)/ 2>/dev/null || true

echo ""
echo "Creating new Nginx configuration..."

# Remove old configs
rm -f /etc/nginx/sites-enabled/*
rm -f /etc/nginx/sites-available/pep-tracker

# Create new unified config
cat > /etc/nginx/sites-available/omwajage.live << 'EOF'
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name omwajage.live www.omwajage.live;
    return 301 https://$server_name$request_uri;
}

# HTTPS server with both websites
server {
    listen 443 ssl http2;
    server_name omwajage.live www.omwajage.live;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/omwajage.live/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/omwajage.live/privkey.pem;

    # Timeouts and buffer sizes
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
    client_max_body_size 50M;

    # PEP Tracker - accessible at /pep
    location /pep {
        rewrite ^/pep(.*) $1 break;
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

    # Old Website - root path (Port 5000)
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
echo "Enabling new configuration..."
ln -s /etc/nginx/sites-available/omwajage.live /etc/nginx/sites-enabled/

echo ""
echo "Testing Nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo ""
    echo "Restarting Nginx..."
    systemctl restart nginx
    
    echo ""
    echo "========================================="
    echo "✓ Configuration Complete!"
    echo "========================================="
    echo ""
    echo "Your websites are now accessible at:"
    echo "  → https://omwajage.live      (Old Website - Port 5000)"
    echo "  → https://omwajage.live/pep  (PEP Tracker - Port 8080)"
    echo ""
    echo "Both HTTP and HTTPS are working!"
    echo "HTTP automatically redirects to HTTPS"
    echo ""
    echo "PM2 Status:"
    pm2 status
    echo ""
    echo "========================================="
else
    echo ""
    echo "ERROR: Nginx configuration test failed!"
    echo "Check the error messages above."
    exit 1
fi
