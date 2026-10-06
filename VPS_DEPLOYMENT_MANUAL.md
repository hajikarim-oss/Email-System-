# 🚀 TBM Outreach — Production VPS Deployment & Operations Manual

**Domain:** [https://tbmoutreach.tech](https://tbmoutreach.tech) | **VPS IP:** `201.18.217.65`  
**Host:** Hostinger Cloud (Ubuntu LTS) | **SSL:** Let's Encrypt Automated HTTPS  

---

## 1. System Architecture Overview

```
                      [ Incoming Web Traffic (HTTPS / Port 443) ]
                                          │
                                          ▼
                         [ NGINX Reverse Proxy (Port 80/443) ]
                                          │
       ┌──────────────────────────────────┼──────────────────────────────────┐
       ▼                                  ▼                                  ▼
[ Static Dashboard (/) ]       [ Root API (/api/*) ]          [ Admin Engine (/nexus/*) ]
Path: /web/dist                Port: 3001 (Node / PM2)        Port: 3000 (Next.js / PM2)
RAM: ~10MB (Nginx direct)      RAM: ~50MB                     RAM: ~140MB
                                          │
                                          ▼
                     [ Smartlead AI & Supabase Database ]
```

- **Static Frontend A (`web/dist`)**: Pre-compiled Vite single-page application served directly from disk by Nginx (ultra-fast, zero CPU lag).
- **Root API Daemon (`api/index.ts`)**: Standalone Node.js server handling Smartlead synchronization, webhook events, and AI assistant chat.
- **Nexus Outbound (`nexus-outbound`)**: Next.js service running on port 3000 for backend models and admin workflows.
- **Resource Footprint**: The entire stack uses **under 9% RAM** on your 4GB VPS, leaving >3.5GB of free headroom.

---

## 2. Smartlead Live Webhooks Integration

### Webhook Endpoint Details
- **Production Webhook URL:** `https://tbmoutreach.tech/api/webhooks/smartlead`
- **Signing Method:** HMAC-SHA256 (`x-webhook-signature` / `x-smartlead-signature`)
- **Webhook Secret:** Configured via `SMARTLEAD_WEBHOOK_SECRET` in `.env`
- **Supported Event Types:**
  - `EMAIL_OPEN` (Recipient opened email)
  - `EMAIL_SENT` (Email dispatched from mailbox)
  - `EMAIL_REPLY` (Inbound reply detected)
  - `EMAIL_BOUNCE` (Bounced / invalid email address)
  - `EMAIL_LINK_CLICK` (Clicked tracked link)
  - `LEAD_UNSUBSCRIBED` (Opted out / unsubscribed)

### One-Command Webhook Sync
To verify or automatically register `https://tbmoutreach.tech/api/webhooks/smartlead` across all current and future campaigns in Smartlead:

```bash
node scripts/register_smartlead_webhooks.js
```
*(Automatically fetches every campaign from your Smartlead account and attaches the live production webhook URL).*

---

## 3. Server Management & Common Commands

SSH into your VPS anytime from PowerShell:
```bash
ssh root@201.18.217.65
```

### PM2 Process Manager
| Action | Command |
| :--- | :--- |
| **Check process status** | `pm2 status` |
| **View live logs** | `pm2 logs` |
| **View API logs only** | `pm2 logs email-system-api` |
| **Restart all processes** | `pm2 restart all` |
| **Save current process list** | `pm2 save` |

### Nginx Web Server
| Action | Command |
| :--- | :--- |
| **Test configuration syntax** | `nginx -t` |
| **Reload after config change**| `systemctl reload nginx` |
| **Restart Nginx** | `systemctl restart nginx` |
| **View Nginx access logs** | `tail -f /var/log/nginx/access.log` |
| **View Nginx error logs** | `tail -f /var/log/nginx/error.log` |

### SSL Certificate (Let's Encrypt / Certbot)
Certbot has installed a background timer that automatically renews the SSL certificate before its 90-day expiry.
To test that auto-renewal works:
```bash
certbot renew --dry-run
```

---

## 4. How to Deploy Code Updates in the Future

Whenever you make improvements or changes to the project:

### Option A: From Local Machine (Git Push)
```bash
git add .
git commit -m "feat: your new feature"
git push origin main
```

### Option B: On the VPS (Pull & Build)
Connect to your VPS:
```bash
cd /var/www/email-system
git pull
pnpm --dir web build
pm2 reload ecosystem.config.js
```
*(Zero downtime — the previous version serves requests while the new version starts up).*

---

## 5. Security & Protection Policies

1. **UFW Firewall:**
   - Port `22` (SSH) — Allowed
   - Port `80` (HTTP) — Allowed (Redirected to 443 HTTPS by Certbot)
   - Port `443` (HTTPS) — Allowed
   - All internal ports (`3000`, `3001`, `5432`) are blocked from the public internet.
2. **Webhook Cryptographic Gate:**
   - Unauthenticated or forged webhooks are rejected with `401 Unauthorized`.
   - Only HMAC-SHA256 signatures matching your secret are processed.
3. **Session Authentication:**
   - All `/api/smartlead/*` and `/api/chat` endpoints require valid authenticated session tokens.
