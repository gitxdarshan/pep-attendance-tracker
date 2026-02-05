@echo off
echo ========================================
echo VPS Deployment Script
echo ========================================
echo.
echo VPS: 38.247.3.184:8080
echo.

REM Check if SSH is available
where ssh >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: SSH not found!
    echo.
    echo Please install one of these:
    echo 1. Git for Windows: https://git-scm.com/download/win
    echo 2. OpenSSH: Settings ^> Apps ^> Optional Features ^> OpenSSH Client
    echo.
    echo After installation, run this script again.
    pause
    exit /b 1
)

echo ========================================
echo Step 1: Creating deployment package
echo ========================================

if exist deploy-package rmdir /s /q deploy-package
mkdir deploy-package

echo Copying files...
robocopy . deploy-package /E /XD node_modules .git dist deploy-temp deploy-package .config .local attached_assets /XF deploy-*.* /NFL /NDL /NJH /NJS

echo Creating .env file...
(
echo PORT=8080
echo NODE_ENV=production
) > deploy-package\.env

echo.
echo Package created successfully!
echo.

echo ========================================
echo Step 2: Preparing VPS
echo ========================================
echo Installing Node.js and creating directories...
echo Password: Djl2xuR9Kk29GNdcY1EY
echo.

ssh -o StrictHostKeyChecking=no root@38.247.3.184 "mkdir -p /var/www/myapp && if ! command -v node &> /dev/null; then echo 'Installing Node.js...' && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt install -y nodejs; else echo 'Node.js already installed'; fi"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: Could not connect to VPS or setup failed.
    echo Please check your internet connection and VPS credentials.
    pause
    exit /b 1
)

echo.
echo ========================================
echo Step 3: Uploading files to VPS
echo ========================================
echo This may take a few minutes...
echo.

scp -o StrictHostKeyChecking=no -r deploy-package/* root@38.247.3.184:/var/www/myapp/

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo ERROR: File upload failed!
    echo.
    echo Please use WinSCP instead:
    echo 1. Download: https://winscp.net/eng/download.php
    echo 2. Connect to: 38.247.3.184 (user: root, password: Djl2xuR9Kk29GNdcY1EY)
    echo 3. Upload deploy-package\ contents to /var/www/myapp/
    echo 4. Then run: deploy-setup-only.bat
    pause
    exit /b 1
)

echo Files uploaded successfully!
echo.

echo ========================================
echo Step 4: Installing dependencies
echo ========================================
echo.

ssh -o StrictHostKeyChecking=no root@38.247.3.184 "cd /var/www/myapp && echo 'Installing dependencies...' && npm install --production"

echo.
echo ========================================
echo Step 5: Building application
echo ========================================
echo.

ssh -o StrictHostKeyChecking=no root@38.247.3.184 "cd /var/www/myapp && echo 'Building app...' && npm run build"

echo.
echo ========================================
echo Step 6: Setting up PM2 and starting app
echo ========================================
echo.

ssh -o StrictHostKeyChecking=no root@38.247.3.184 "npm install -g pm2 && cd /var/www/myapp && pm2 delete myapp 2>/dev/null || true && pm2 start npm --name myapp -- start && pm2 save && pm2 startup systemd -u root --hp /root && ufw allow 8080/tcp 2>/dev/null || true"

echo.
echo ========================================
echo Deployment Complete!
echo ========================================
echo.
echo Your app is running at:
echo http://38.247.3.184:8080
echo.
echo To manage your app, SSH to VPS and use:
echo   pm2 status
echo   pm2 logs myapp
echo   pm2 restart myapp
echo.
echo Cleaning up...
rmdir /s /q deploy-package

pause
