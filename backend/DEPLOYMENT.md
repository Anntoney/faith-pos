# Deployment Guide - WhatsApp AI Agent

## Option 1: PM2 Deployment (Recommended for VPS)

### Prerequisites
- SSH access to your server
- Node.js 18+ installed
- PM2 installed globally: `npm install -g pm2`

### Deployment Steps

```bash
# 1. SSH into your server
ssh user@your-server-ip

# 2. Navigate to your app directory
cd /opt/apps/whatsapp-agent

# 3. Pull latest code
git pull origin main

# 4. Install dependencies
npm install --production

# 5. Build TypeScript
npm run build

# 6. Create .env.local file with credentials
nano .env.local
# Paste your environment variables

# 7. Start with PM2
pm2 start ecosystem.config.cjs

# 8. Save PM2 startup configuration
pm2 save
pm2 startup

# 9. Verify it's running
pm2 logs whatsapp-agent
```

### Managing the Service

```bash
# View status
pm2 status

# View logs
pm2 logs whatsapp-agent

# Restart service
pm2 restart whatsapp-agent

# Stop service
pm2 stop whatsapp-agent

# Delete service
pm2 delete whatsapp-agent
```

### Update Deployment

```bash
# Pull latest changes
git pull origin main

# Rebuild
npm install --production
npm run build

# Restart service
pm2 restart whatsapp-agent
```

## Option 2: Docker Deployment

### Prerequisites
- Docker & Docker Compose installed
- Server has 512MB+ RAM

### Deployment Steps

```bash
# 1. SSH into server
ssh user@your-server-ip

# 2. Navigate to app directory
cd /opt/apps/whatsapp-agent

# 3. Create .env file
cp backend/.env.example backend/.env
# Edit backend/.env with your credentials

# 4. Build and start
docker-compose -f backend/docker-compose.yml up -d

# 5. View logs
docker-compose -f backend/docker-compose.yml logs -f whatsapp-agent
```

### Docker Management

```bash
# Status
docker-compose -f backend/docker-compose.yml ps

# Stop
docker-compose -f backend/docker-compose.yml down

# Restart
docker-compose -f backend/docker-compose.yml restart whatsapp-agent

# View logs
docker-compose -f backend/docker-compose.yml logs -f

# Update (rebuild image)
docker-compose -f backend/docker-compose.yml up -d --build
```

## Option 3: Systemd Service (Linux)

### Create Service File

```bash
sudo nano /etc/systemd/system/whatsapp-agent.service
```

Paste:
```ini
[Unit]
Description=WhatsApp AI Agent
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/opt/apps/whatsapp-agent/backend
Environment="NODE_ENV=production"
EnvironmentFile=/opt/apps/whatsapp-agent/backend/.env
ExecStart=/usr/bin/node /opt/apps/whatsapp-agent/backend/dist/index.js
Restart=always
RestartSec=10
StandardOutput=append:/var/log/whatsapp-agent.log
StandardError=append:/var/log/whatsapp-agent.log

[Install]
WantedBy=multi-user.target
```

### Start Service

```bash
# Enable at startup
sudo systemctl enable whatsapp-agent

# Start service
sudo systemctl start whatsapp-agent

# Check status
sudo systemctl status whatsapp-agent

# View logs
sudo tail -f /var/log/whatsapp-agent.log
```

## Nginx Reverse Proxy Setup

Add to your Nginx config:

```nginx
upstream whatsapp_agent {
    server 127.0.0.1:3001;
}

server {
    listen 80;
    server_name your-domain.com;

    location /whatsapp {
        proxy_pass http://whatsapp_agent;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 60s;
    }

    location /reports {
        proxy_pass http://whatsapp_agent;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }
}
```

Then:
```bash
sudo nginx -t
sudo systemctl reload nginx
```

## SSL/HTTPS with Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot python3-certbot-nginx

# Generate certificate
sudo certbot certonly --nginx -d your-domain.com

# Update Nginx to use SSL (certbot does this automatically)
sudo nginx -t
sudo systemctl reload nginx
```

## Monitoring & Logging

### PM2 Monitoring
```bash
# Install PM2 plus
pm2 install pm2-auto-pull

# Monitor with dashboard
pm2 monit
```

### Log Rotation

Create `/etc/logrotate.d/whatsapp-agent`:
```
/var/log/whatsapp-agent.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0640 www-data www-data
    sharedscripts
}
```

## Backup Strategy

### Automated Backups
```bash
# Create backup script
cat > /opt/backup-whatsapp-agent.sh << 'EOF'
#!/bin/bash
BACKUP_DIR="/backups/whatsapp-agent"
mkdir -p $BACKUP_DIR
tar -czf $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz \
    /opt/apps/whatsapp-agent/backend/.env
EOF

chmod +x /opt/backup-whatsapp-agent.sh

# Add to crontab
crontab -e
# Add: 0 2 * * * /opt/backup-whatsapp-agent.sh
```

## Troubleshooting

### Service Won't Start
```bash
# Check logs
pm2 logs whatsapp-agent

# Check port 3001 is available
sudo lsof -i :3001

# Check environment variables
env | grep TWILIO
```

### Memory Issues
```bash
# Check memory usage
pm2 monit

# Increase max memory in ecosystem.config.cjs
# max_memory_restart: '1G'
```

### Database Connection Issues
```bash
# Test Supabase connection
curl https://your-supabase-url/auth/v1/health

# Check credentials in .env
cat .env | grep SUPABASE
```

## Performance Optimization

### Add Load Balancing (if needed)
```nginx
upstream whatsapp_agent_cluster {
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;  # Run multiple instances
    keepalive 32;
}
```

### Enable Caching
```nginx
proxy_cache_path /var/cache/nginx levels=1:2 keys_zone=whatsapp:10m;

location /reports {
    proxy_cache whatsapp;
    proxy_cache_valid 200 1h;
    proxy_cache_key "$scheme$request_method$host$request_uri";
}
```

## Health Checks

### Setup Health Check Monitoring
```bash
# Add to crontab
*/5 * * * * curl -f http://localhost:3001/health || systemctl restart whatsapp-agent
```

## Rollback Plan

```bash
# Keep previous version in git
git log --oneline

# Rollback if needed
git revert <commit-hash>
npm run build
pm2 restart whatsapp-agent
```

## Security Hardening

1. **Firewall Rules**
   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   ```

2. **Update System**
   ```bash
   sudo apt-get update
   sudo apt-get upgrade
   ```

3. **Restrict .env Access**
   ```bash
   chmod 600 /opt/apps/whatsapp-agent/backend/.env
   ```

4. **Use Environment Variables**
   - Never commit .env file
   - Use secure secrets management
   - Rotate API keys regularly

## Maintenance Schedule

- **Weekly**: Check logs for errors
- **Monthly**: Review API usage/costs
- **Quarterly**: Update dependencies
- **Annually**: Security audit

## Support & Issues

For deployment issues:
1. Check logs: `pm2 logs whatsapp-agent`
2. Verify environment variables
3. Test API connectivity
4. Review deployment.log for errors
