#!/usr/bin/env bash
# ==============================================================================
# TURNKEY 4GB VPS PROVISIONING & DEPLOYMENT SCRIPT
# OS Target: Ubuntu 22.04 LTS or 24.04 LTS
# Run as root or with sudo: sudo bash deploy-vps.sh
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo " Starting 4GB VPS Provisioning for Email System 101"
echo "=========================================================="

# 1. Update OS packages
echo "--> [1/8] Updating apt packages..."
apt-get update -y && apt-get upgrade -y
apt-get install -y curl git ufw redis-server nginx certbot python3-certbot-nginx build-essential

# 2. Configure 4GB Swap Space (Essential safety net against OOM on 4GB RAM)
echo "--> [2/8] Setting up 4GB Swap space..."
if [ ! -f /swapfile ]; then
    fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    echo '/swapfile none swap sw 0 0' >> /etc/fstab
    # Tune swappiness (10 is optimal for database-backed web apps)
    sysctl vm.swappiness=10
    echo 'vm.swappiness=10' >> /etc/sysctl.conf
    echo "✔ 4GB Swap file created and active."
else
    echo "✔ Swapfile already exists."
fi

# 3. Install Node.js 22 LTS & pnpm
echo "--> [3/8] Installing Node.js 22 LTS & Global Tooling..."
if ! command -v node &> /dev/null; then
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
    apt-get install -y nodejs
fi
npm install -g pnpm pm2 tsx

# 4. Configure Redis
echo "--> [4/8] Configuring local Redis server..."
systemctl enable redis-server
systemctl restart redis-server

# 5. Configure Firewall (UFW)
echo "--> [5/8] Securing firewall..."
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 6. Install Dependencies & Build Apps
APP_DIR="/var/www/email-system"
echo "--> [6/8] Building applications in ${APP_DIR}..."

if [ ! -d "${APP_DIR}" ]; then
    echo "Directory ${APP_DIR} not found. Please clone your repo to ${APP_DIR}"
    echo "Example: git clone <your-git-url> ${APP_DIR}"
    exit 1
fi

cd "${APP_DIR}"

# Ensure environment files are present and synchronized
if [ -f "${APP_DIR}/.env" ] && [ ! -f "${APP_DIR}/nexus-outbound/.env" ]; then
    cp "${APP_DIR}/.env" "${APP_DIR}/nexus-outbound/.env"
    echo "✔ Synced .env to nexus-outbound/.env"
elif [ -f "${APP_DIR}/nexus-outbound/.env" ] && [ ! -f "${APP_DIR}/.env" ]; then
    cp "${APP_DIR}/nexus-outbound/.env" "${APP_DIR}/.env"
    echo "✔ Synced nexus-outbound/.env to root .env"
fi

# Build Root dependencies
pnpm install

# Build Vite frontend
cd "${APP_DIR}/web"
pnpm install
pnpm build
echo "✔ Vite static dashboard built into web/dist."

# Build Nexus Outbound (Next.js)
cd "${APP_DIR}/nexus-outbound"
pnpm install
npx prisma generate
pnpm build
echo "✔ Next.js application built."

# 7. Start PM2 Daemons
cd "${APP_DIR}"
mkdir -p logs
echo "--> [7/8] Launching services with PM2..."
pm2 start ecosystem.config.js
pm2 save
pm2 startup systemd -u root --hp /root || true

# 8. Configure Nginx
echo "--> [8/8] Configuring Nginx..."
cp "${APP_DIR}/nginx-vps.conf" /etc/nginx/sites-available/email-system
ln -sf /etc/nginx/sites-available/email-system /etc/nginx/sites-enabled/email-system
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

echo "=========================================================="
echo "✔ DEPLOYMENT COMPLETE!"
echo "Next step: Run certbot for free HTTPS certificate:"
echo "  sudo certbot --nginx -d your-domain.com"
echo "=========================================================="
