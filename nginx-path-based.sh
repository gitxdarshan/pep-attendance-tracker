#!/bin/bash
set -e

echo "========================================="
echo "Setting up Path-Based Routing"
echo "omwajage.live → Old Website"
echo "omwajage.live/pep → PEP Tracker"
echo "========================================="

# Backup existing Nginx config
echo "Backing up existing Nginx configuration..."
mkdir -p /root/nginx-backup
cp -r /etc/nginx/sites-available/* /root/nginx-backup/ 2>/dev/null || true
cp -r /etc/nginx/sites-enabled/* /root/nginx-backup/ 2>/dev/null || true

echo ""
echo "Please provide the following information:"
echo ""

# Get old website details
read -p "Enter the port number where your old website is running (e.g., 3000, 5000): " OLD_PORT
read -p "Enter the root directory of your old website (press Enter if using port): " OLD_ROOT

echo ""
echo "Creating new Nginx configuration..."

# Create new Nginx config with path-based routing
cat > /etc/nginx/sites-available/omwajage.live << EOF
server {
    listen 80;
    server_name omwajage.live www.omwajage.live;

    # Increase timeouts
    proxy_connect_timeout 600;
    proxy_send_timeout 600;
    proxy_read_timeout 600;
    send_timeout 600;
    client_max_body_size 50M;

    # PEP Tracker - accessible at /pep
    location /pep {
        rewrite ^/pep(.*) \$1 break;
        proxy_pass http://localhost:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
    }

    # Old Website - root path
    location / {
EOF

if [ -n "$OLD_ROOT" ]; then
    # If old website is static files
    cat >> /etc/nginx/sites-available/omwajage.live << EOF
        root $OLD_ROOT;
        index index.html index.htm;
        try_files \$uri \$uri/ =404;
EOF
else
    # If old website is running on a port
    cat >> /etc/nginx/sites-available/omwajage.live << EOF
        proxy_pass http://localhost:$OLD_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;
EOF
fi

cat >> /etc/nginx/sites-available/omwajage.live << 'EOF'
    }
}
EOF

echo ""
echo "Enabling new configuration..."
rm -f /etc/nginx/sites-enabled/*
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
    echo "  → http://omwajage.live      (Old Website)"
    echo "  → http://omwajage.live/pep  (PEP Tracker)"
    echo ""
    echo "If PEP Tracker doesn't work, you may need to update"
    echo "the app's base URL configuration."
    echo "========================================="
else
    echo ""
    echo "ERROR: Nginx configuration test failed!"
    echo "Restoring backup..."
    cp /root/nginx-backup/* /etc/nginx/sites-available/ 2>/dev/null || true
    systemctl restart nginx
    exit 1
fi
