# Faith POS — Deployment Notes

> A concise record of how the production server was built and **why** each
> decision was made. Read this before touching production.
> Last updated: 2026-07-23

---

## 1. Architecture (the one thing to understand first)

**The Droplet is stateless.** It runs only the Next.js web app. All data,
auth, and the database live in **Supabase (managed)**. Nothing durable is on
the server.

```
Browser ──► DO Cloud Firewall ──► Nginx (:80/:443) ──► Next.js app (127.0.0.1:3000)
                                                             │
                                                             ▼ HTTPS
                                                     Supabase (Postgres + Auth)
```

**Why it matters:** backups protect *config*, not data (Supabase owns data
durability). Recovery = rebuild the server, not restore it. The server is
"cattle, not a pet."

| Thing | Value |
|---|---|
| App code | Next.js 16 (App Router), React 19, `@supabase/ssr` |
| Server | DigitalOcean Droplet, `antoney-pos-prod` |
| Public IP | 167.172.131.159 (⚠ attach a **Reserved IP** before DNS) |
| Size | 2 GB RAM / 1 vCPU / 50 GB — $12/mo |
| OS | Ubuntu 24.04 LTS |
| Region | NYC1 (colocated with Supabase `us-east-1` — low DB latency) |
| App location | `/home/antoney/faith-pos` |
| Process manager | **systemd** (`faith-pos.service`) — NOT PM2 |
| DB | Supabase project `nyjlayvobgpuwifzlrcb` (Free tier) |

---

## 2. Sizing — why 2 GB

- Runtime needs ~950 MB (Ubuntu ~400 + Next.js ~400 + Nginx/overhead).
- `next build` peaks ~2 GB — **the build is the constraint, not traffic**
  (3 terminals = trivial load).
- 512 MB (original) could not even start the app. Resized to 2 GB.
- 2 GB swap added as an OOM safety net (not a RAM substitute).
- Builds currently run on-server (fits in 2 GB + swap). Move to CI later to
  free the box entirely.

---

## 3. Security posture (Phases 2–3)

### Server hardening — all done
- **Non-root user** `antoney`; root login over SSH **disabled**.
- **SSH key-only** — password auth off. Login as `antoney`, elevate with `sudo`.
- **Two firewalls (defense in depth):**
  - DO Cloud Firewall (network level, outside VM) — SSH/80/443 in, all out.
  - UFW (host level) — same rules, kernel-enforced.
  - **Port 3000 is NOT open anywhere** — app is loopback-only, reachable only via Nginx.
- **fail2ban** — bans IPs that hammer SSH (hygiene; key-auth already blocks brute force).
- **Auto security updates** (`unattended-upgrades`) with a controlled reboot
  window at 03:30 UTC (06:30 EAT, before the shop opens).
- Clock: **server stays UTC**, app displays EAT. (Prevents end-of-day report
  bugs. Never set the server to local time.)

### The critical rule for secrets
- Secrets live **only** in `/home/antoney/faith-pos/.env.local` (mode `600`,
  owned by `antoney`). Never in git, never in the process config.
- App uses only `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- **The service-role key is deliberately NOT on the server** — it bypasses all
  RLS and the app doesn't need it. Keeping it off the box removes the worst
  thing an attacker could steal.
- ⚠ **Known issue:** the service-role key was historically committed in
  `ecosystem.config.js` on GitHub. It should be **rotated** in Supabase and
  purged from git history. (Deferred by user — still outstanding.)

### RLS is the real data protection
- The anon key is **public** (extractable from the browser bundle and the APK).
  Row Level Security is the *only* thing protecting the data behind it.
- RLS verified enabled on the web app's Supabase project.
- ⚠ The **mobile app uses a different Supabase project** (`soqxolezaulotushohjd`).
  If it holds real data, audit RLS there too.

---

## 4. The application service (systemd)

**We use systemd, not PM2.** PM2 failed to launch the process reliably (empty
logs, fake "online"). systemd worked immediately and gives crash-restart, boot
persistence, and real logging natively.

Unit file: `/etc/systemd/system/faith-pos.service`
- Runs as `antoney`, `WorkingDirectory=/home/antoney/faith-pos`
- `ExecStart=/usr/bin/node .../next start -p 3000 -H 127.0.0.1`
  → **`-H 127.0.0.1` binds to loopback only** (this is what keeps the app
    private behind Nginx — critical, do not change to 0.0.0.0).
- `Restart=always`, `enabled` (survives reboot), logs to journal.

**Daily commands:**
```bash
sudo systemctl status faith-pos      # is it running?
sudo systemctl restart faith-pos     # restart (after a deploy)
sudo journalctl -u faith-pos -f      # live logs
```

Healthy check: `curl -I http://127.0.0.1:3000` → `307` redirect to `/auth/login`.

---

## 5. Nginx reverse proxy (Phase 9)

Config: `/etc/nginx/sites-available/faith-pos` (symlinked into `sites-enabled`;
default site removed).

Provides:
- Reverse proxy `:80` → `127.0.0.1:3000` with correct forwarded headers.
- **Rate limiting** (20 r/s per IP, burst 40) — blunts floods.
- **Gzip** compression.
- **Security headers** (X-Frame-Options, X-Content-Type-Options, Referrer-Policy).
- **Aggressive caching** for `/_next/static/` assets.
- **Timeouts** and `client_max_body_size 10M` (product image uploads).

**Golden rule:** always `sudo nginx -t` before `sudo systemctl reload nginx`.
Never reload an untested config.

---

## 6. Deploy procedure

Next.js runs a **compiled build** — pulling code is not enough, you must
rebuild. Deploy script: `/home/antoney/faith-pos/deploy.sh`

```bash
cd /home/antoney/faith-pos
git fetch origin
git reset --hard origin/main   # server mirrors GitHub exactly
npm ci
npm run build                  # ← the step people forget
sudo systemctl restart faith-pos
```

- `set -euo pipefail` in the script → a failed build never restarts the service.
- **Workflow rule:** develop on your own machine → push to GitHub → server
  pulls. **Never commit directly on the server** (its deploy key is read-only,
  so commits get stranded — this already caused a divergence we had to reset).
- `git config pull.ff only` set to prevent future divergence.
- Brief downtime (~1–2 s) during restart — deploy off-hours until CI/CD
  (zero-downtime) is set up.

---

## 7. GitHub access

- **Read-only deploy key** generated *on the server* (`~/.ssh/github_deploy`),
  registered on the repo only. Least privilege: a server breach can't push
  malicious code or touch other repos.
- Private key never leaves the server.

---

## 8. What's still OUTSTANDING

| # | Item | Priority |
|---|---|---|
| 1 | **Domain** — buy one, point DNS (A record) at the Reserved IP | Next step |
| 2 | **SSL/HTTPS** — run certbot after DNS resolves (needs domain first) | Next step |
| 3 | **Attach Reserved IP** before pointing DNS (stable address) | Next step |
| 4 | **Rotate the leaked service-role key** + purge from git history | High |
| 5 | **Nightly `pg_dump` backup** (Free tier has NO backups/PITR) | Before go-live |
| 6 | **Upgrade Supabase to Pro** ($25/mo) for PITR | Before real transactions |
| 7 | Audit RLS on the mobile app's Supabase project | High |
| 8 | Monitoring + uptime alerts | Phase 13 |
| 9 | CI/CD (zero-downtime deploys, rollback) | Phase 15 |
| 10 | Remove unused PM2, prune `mysql2`/migration script, fix `allowedDevOrigins` warning | Low |

---

## 9. Key principles we followed (carry these forward)

1. **Verify before you cut** — never disable an access path (root, SSH, firewall)
   until the replacement is proven in a separate session. Kept the web console
   as an out-of-band fallback throughout.
2. **Test config before applying** — `sshd -t`, `nginx -t` before every reload.
3. **Least privilege everywhere** — non-root app user, read-only deploy key,
   service-role key kept off the box.
4. **Defense in depth** — two firewalls, so one mistake doesn't expose the app.
5. **Secrets in exactly one place**, never in git.
6. **Boring is good** — LTS OS, LTS Node, the version everyone else has debugged.
