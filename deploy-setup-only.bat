@echo off
echo ========================================
echo VPS Setup Only (files already uploaded)
echo ========================================
echo.

ssh -o StrictHostKeyChecking=no root@38.247.3.184 "cd /var/www/myapp && if ! command -v node &> /dev/null; then curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs; fi && npm install --production && npm run build && npm install -g pm2 && pm2 delete myapp 2>/dev/null || true && pm2 start npm --name myapp -- start && pm2 save && pm2 startup systemd -u root --hp /root && ufw allow 8080/tcp 2>/dev/null || true && echo 'App running at http://38.247.3.184:8080'"

pause
