# Faith POS — Phase 1: Infrastructure Plan

> Status: **FINAL** — decisions locked, pending Supabase region migration
> Last updated: 2026-07-21
> Deployment target: single store, Nairobi, Kenya · 3 POS terminals

---

## 1. Confirmed Inputs

| Input | Value |
|---|---|
| Physical location | Nairobi, Kenya (EAT, UTC+3) |
| Scale at launch | 1 store, max 3 concurrent terminals |
| Supabase region (current) | `us-east-1` (N. Virginia) |
| Supabase plan (current) | Free |
| Downtime tolerance | Low — store should keep operating if possible |
| Budget posture | Cost-sensitive |

---

## 2. Application Architecture

### 2.1 Stack as built

| Layer | Technology | Where it runs |
|---|---|---|
| Web app | Next.js 16 (App Router), React 19, Tailwind 4 | DigitalOcean Droplet |
| UI | Radix / shadcn, lucide-react, recharts | bundled |
| Auth | Supabase Auth via `@supabase/ssr` (cookie sessions) | Supabase (managed) |
| Database | PostgreSQL + PostgREST | Supabase (managed) |
| Mobile admin app | Expo / React Native 0.81 | APK / app stores |
| Reverse proxy + TLS | Nginx + Let's Encrypt | Droplet |
| Process manager | PM2 | Droplet |
| Build | GitHub Actions (CI) | GitHub-hosted runner |

### 2.2 Request flow

```
   3 POS terminals (Nairobi)
   Browser / dashboard
            │
            ▼
   DNS (A / AAAA)  faithpos.example
            │
            ▼
   DO Reserved IP  ────────────────► stable, re-attachable
            │
            ▼
   DO Cloud Firewall  ─────────────► network-level, outside the VM
            │
   ┌────────▼─────────────────────┐
   │ Droplet — FRA1, Ubuntu 24.04 │
   │  ┌────────────────────────┐  │
   │  │ UFW (host firewall)    │  │  defense in depth
   │  ├────────────────────────┤  │
   │  │ Nginx :443             │  │  TLS, headers, gzip,
   │  │                        │  │  rate limit, static cache
   │  ├───────────▼────────────┤  │
   │  │ PM2 → Next.js          │  │  bound to 127.0.0.1:3000
   │  │ (SSR + RSC)            │  │  NEVER publicly exposed
   │  └───────────┬────────────┘  │
   └──────────────┼───────────────┘
                  │ HTTPS egress — ~2 ms (colocated)
   ┌──────────────▼───────────────┐
   │ Supabase — eu-central-1      │
   │ Postgres + Auth + PostgREST  │◄── Expo mobile app
   └──────────────────────────────┘    (separate project — see §9)
```

### 2.3 The property that drives every decision

**The Droplet is stateless.** No database, no uploads, no session store on it. Everything
durable lives in Supabase; everything on the server is derived from git plus one config file.

Consequences:

- Backups protect *configuration*, not data. Data durability is Supabase's job.
- Recovery is *rebuild*, not *restore*.
- Horizontal scaling later = add an identical Droplet behind a load balancer. No data
  migration, no primary/replica topology.
- The server is cattle, not a pet.

Most single-VPS deployments lose this the moment they `apt install postgresql`. Keeping
Supabase managed preserves it, and it is why a single box is defensible here.

---

## 3. Region — DECISION: migrate Supabase to `eu-central-1`, Droplet in `FRA1`

### 3.1 The rule

Colocate the Droplet with the **database**, not with the users. SSR makes several
*sequential* database round trips per page render, but only *one* round trip to the browser.
Database latency multiplies; client latency does not.

### 3.2 Options measured from Nairobi

| Configuration | Client→server | Server→DB (×4) | Est. page time |
|---|---|---|---|
| Droplet FRA1 + Supabase `us-east-1` | ~150 ms | ~90 ms × 4 = 360 ms | **~510 ms** ❌ |
| Droplet NYC3 + Supabase `us-east-1` (no migration) | ~240 ms | ~2 ms × 4 = 8 ms | **~250 ms** ✅ |
| **Droplet FRA1 + Supabase `eu-central-1`** | **~150 ms** | **~2 ms × 4 = 8 ms** | **~160 ms** ⭐ |

Note that the *intuitive* choice — server near the users, row 1 — is the **worst** option,
roughly 3× slower than the best. This is the single most valuable performance insight in
the whole deployment.

### 3.3 Decision

**Migrate the Supabase project from `us-east-1` to `eu-central-1` (Frankfurt), and create
the Droplet in `FRA1` (Frankfurt).**

Rationale:

- Saves ~90 ms per page load versus the no-migration option. For cashiers performing
  hundreds of repetitive interactions per shift, perceived snappiness compounds.
- FRA1 and Supabase `eu-central-1` are both Frankfurt — genuine colocation, ~2 ms.
- **Now is the cheapest possible moment.** On the Free tier with minimal production data,
  migration is: `pg_dump` → create new project → `pg_restore` → update 2 env vars. Roughly
  one hour. After a year of sales history and three live terminals, the same move requires
  a maintenance window and a rollback plan.

**Deferral is acceptable:** if you'd rather not migrate, use `NYC3` + `us-east-1`
(row 2). That is a perfectly workable production setup — ~250 ms page loads are fine. Do
**not** choose row 1 under any circumstances.

### 3.4 Verify before committing

Measure from the store's actual network:

```
ping -c 20 speedtest-fra1.digitalocean.com
ping -c 20 speedtest-nyc3.digitalocean.com
ping -c 20 speedtest-blr1.digitalocean.com
```

Compare average **and** jitter (`mdev`). For interactive POS use, 150 ms with low jitter
beats 130 ms with high jitter. Kenyan routing to Europe usually goes via SEACOM/EASSy
subsea cable and is stable; BLR1 is occasionally competitive and worth the 30 seconds to
check.

---

## 4. Server Sizing — DECISION: 2 GB / 1 vCPU / 50 GB ($12/mo) with CI builds

### 4.1 Why 512 MB was rejected

| Component | RAM |
|---|---|
| Ubuntu 24.04 at idle | ~400 MB |
| Next.js 16 SSR process | 300–500 MB |
| Nginx | ~20 MB |
| PM2 daemon | ~50 MB |
| **Runtime subtotal** | **~800–950 MB** |
| `next build` peak | **~2 GB** |

512 MB is exceeded before the first request is served, and the build needs 4× the box. The
$4 tier is intended for static sites and bastion hosts.

### 4.2 Why 2 GB is enough — the CI build trick

Moving `next build` into **GitHub Actions** (free tier: unlimited for public repos,
2,000 min/month for private) removes the 2 GB build spike from the server entirely. CI
compiles on GitHub's hardware and ships the built `.next` output to the Droplet.

This is not a workaround for undersizing — it is standard production practice, and it is
already Phase 15 on the roadmap, simply pulled forward. Benefits beyond memory:

- Deploys become reproducible and auditable.
- The server never holds build toolchains or dev dependencies (smaller attack surface).
- A failed build never takes down the running site.

With builds externalised, runtime needs ~950 MB. 2 GB leaves roughly 1 GB of headroom for
traffic spikes, log buffers, and a `pg_dump` running alongside.

### 4.3 Why not 1 GB ($6/mo)

It boots and runs, with essentially zero headroom. A memory leak or traffic spike invites
the OOM killer, and having it terminate the POS mid-sale is a costly way to save $6/mo.

### 4.4 Load check

3 terminals ≈ 3 concurrent users. A single vCPU handles this without noticing; Next.js SSR
on modest hardware serves dozens of concurrent users. **CPU is not the constraint at this
scale — latency is**, which §3 addresses.

### 4.5 Scale-up path

DigitalOcean resizes RAM/CPU reversibly (~60 s downtime); disk resizes are permanent and
one-way. So 2 GB → 4 GB and back is free to do on demand. Revisit above ~20 concurrent
users or if adding a second store.

---

## 5. Network Plan

| Item | Decision | Why |
|---|---|---|
| **VPC** | Default VPC, FRA1 | Free. Retro-fitting requires a rebuild. |
| **Reserved IP** | **Yes — mandatory** | Decouples DNS from Droplet lifecycle. Build a replacement, test it, re-point in seconds. Free while attached. |
| **IPv4** | Yes | Required |
| **IPv6** | Enable | Free; some mobile carriers are IPv6-only |
| **Monitoring agent** | Enable at creation | Free CPU/RAM/disk metrics + alerting |
| **DO Backups** | Enable — +20% ($2.40/mo) | Weekly Droplet-level backup |
| **Tags** | `pos`, `production`, `web` | Cloud Firewall rules target **tags**, not Droplet IDs — future Droplets inherit protection automatically |
| **Project** | `faith-pos-production` | Billing and access clarity |

### 5.1 Port plan

| Port | Bind address | Public | Purpose |
|---|---|---|---|
| 22 | 0.0.0.0 | Yes — **source-restricted** | SSH |
| 80 | 0.0.0.0 | Yes | 301 → HTTPS; ACME challenge |
| 443 | 0.0.0.0 | Yes | HTTPS |
| 3000 | **127.0.0.1** | **No** | Next.js — loopback only |

Binding Next.js to `127.0.0.1` is not optional. On `0.0.0.0` the app is reachable at
`http://<droplet-ip>:3000`, bypassing Nginx — and therefore bypassing TLS, security
headers, and rate limiting. This silently negates most of Phases 9 and 12.

---

## 6. Firewall Strategy — Defense in Depth

**Layer 1 — DO Cloud Firewall** (network level, outside the VM). Traffic is dropped before
reaching the NIC. Survives a misconfigured UFW and cannot be altered by an attacker who has
compromised the server, since it is controlled via the DO API.

| Direction | Type | Port | Source / Destination |
|---|---|---|---|
| Inbound | SSH | 22 | **Your IP/CIDR** (`0.0.0.0/0` only if your ISP is dynamic) |
| Inbound | HTTP | 80 | `0.0.0.0/0`, `::/0` |
| Inbound | HTTPS | 443 | `0.0.0.0/0`, `::/0` |
| Outbound | All | All | `0.0.0.0/0` — apt, Supabase, Let's Encrypt, NTP |

**Layer 2 — UFW** (host level). Same rules, kernel-enforced. Catches anything bypassing
Layer 1, including intra-VPC traffic.

**Why both:** either alone is a single point of failure. Two layers means two independent
mistakes are required to open a hole.

⚠️ **Never run `ufw enable` before `ufw allow OpenSSH`.** This locks you out instantly.
Recovery is the DigitalOcean web recovery console (out-of-band, so it still works) — but
the correct order is: allow SSH → verify → enable.

---

## 7. Backup Strategy

| Layer | Protects | Mechanism | Frequency | Cost | RPO |
|---|---|---|---|---|---|
| 1 | Business data | Supabase PITR *(requires Pro)* | Continuous | $25/mo | seconds |
| 2 | Independent copy | `pg_dump` → off-server, cron | Nightly | ~$1/mo | 24 h |
| 3 | Server state | DO automated backups | Weekly | $2.40/mo | 7 days |
| 4 | Pre-change safety | DO snapshot, manual | On demand | $0.06/GB/mo | on demand |
| 5 | Configuration | Committed to git | Every change | free | instant |

### 7.1 Free tier — the precise risk

The 7-day inactivity pause is **not** your problem; an active POS never idles that long.

**The problem is that the Free tier has no automated backups and no PITR — none at all.**
One bad migration, one accidental `delete from sales`, one buggy bulk update, and the sales
history is permanently gone with no recovery path.

**Interim mitigation (mandatory if staying Free):** nightly `pg_dump` via cron, pushed
off-server. Moves you from *no recovery* to *24-hour worst-case loss*. For a POS that is
still poor — a full trading day of sales — but it is vastly better than nothing, and costs
about $1/mo in storage.

**Plan of record: stay Free through pilot and testing; upgrade to Pro before the first real
transaction.**

### 7.2 The rule that makes backups real

> A backup that has never been restored is not a backup. It is a hope.

Phase 14 includes a mandatory restore drill — restore the nightly dump into a scratch
project and verify row counts against production. Quarterly thereafter.

---

## 8. Recovery Strategy

### 8.1 Targets

| Metric | Target (Pro) | Target (Free + nightly dump) |
|---|---|---|
| **RPO** — max data loss | < 1 min | **up to 24 h** |
| **RTO** — max downtime | < 30 min | < 30 min |

### 8.2 Scenario playbook

| Scenario | Detection | Response | Time |
|---|---|---|---|
| Node process crash | PM2 | Auto-restart | < 10 s |
| Memory leak | PM2 `max_memory_restart` | Auto-restart at threshold | < 30 s |
| Bad deploy | Health check | Symlink to previous release, `pm2 reload` | < 2 min |
| Nginx misconfig | `nginx -t` | Validated *before* reload — never breaks live | 0 |
| TLS expiry | certbot timer + monitor | Auto-renewal; alert at 14 days | 0 |
| Droplet failure | Uptime monitor | Restore snapshot → re-attach Reserved IP | ~15 min |
| Region outage | Uptime monitor | Rebuild elsewhere from script → update DNS | ~1 h |
| Server compromised | Audit logs | **Rebuild from scratch. Rotate every secret.** | ~1 h |
| Bad migration | Data anomaly | PITR *(Pro)* or restore nightly dump *(Free)* | 15 min / 24 h loss |
| Supabase outage | Uptime monitor | Vendor dependency — no mitigation our side | vendor |

### 8.3 Keeping the store operating — honest assessment

Stated preference: the store should keep selling during an outage. Three options:

1. **True offline mode** — cache catalogue in IndexedDB, queue sales locally, sync on
   reconnect. This is the real fix, and it is an **application rewrite, not a deployment
   task.** It touches the entire data layer and introduces genuinely hard problems: stock
   conflict resolution across terminals, duplicate-sale prevention, clock skew. Weeks of
   work. Belongs on the product roadmap.
2. **4G failover router at the store** — ~$50 hardware, zero code changes, addresses the
   *most likely* failure by a wide margin (last-mile ISP, not DO or Supabase). **Recommended now.**
3. **Manual fallback** — paper receipts reconciled later. Zero cost. Worth documenting as
   the procedure of last resort regardless of what else is implemented.

**Plan of record: option 2 now, option 3 documented, option 1 on the product roadmap.**

---

## 9. Open Issues Blocking Later Phases

| # | Issue | Severity | Blocks |
|---|---|---|---|
| 1 | `SUPABASE_SERVICE_ROLE_KEY` hardcoded in `ecosystem.config.js`, committed to GitHub | **Critical** | Phase 2 |
| 2 | Web and mobile point at **different Supabase projects** (`nyjlayvobgpuwifzlrcb` vs `soqxolezaulotushohjd`) — they cannot see each other's data | **High** | Phase 6 |
| 3 | RLS coverage unverified. The anon key is public by design and extractable from the APK; RLS is the *only* access control | **Critical** | Phase 6 |
| 4 | Supabase region migration `us-east-1` → `eu-central-1` | High | Phase 2 |
| 5 | `typescript.ignoreBuildErrors: true` — type-broken code ships silently in a money-handling system | Medium | Phase 7 |
| 6 | `@supabase/supabase-js: "latest"` — unpinned, builds not reproducible | Medium | Phase 7 |
| 7 | `mysql2` + `scripts/migrate-mysql-to-supabase.ts` — dead weight from prior migration | Low | Phase 7 |
| 8 | `experimental.allowedDevOrigins` hardcodes a public IP (`108.181.203.106`) | Low | Phase 7 |
| 9 | Kenya Data Protection Act 2019 — controller registration and cross-border transfer obligations (see §12) | **Review needed** | Before go-live |

---

## 10. Cost

### Lean path — pilot / testing

| Item | $/mo |
|---|---|
| Droplet 2 GB / 1 vCPU / 50 GB (FRA1) | 12.00 |
| DO automated backups (20%) | 2.40 |
| Supabase Free + nightly `pg_dump` | 0.00 |
| Off-server dump storage | ~1.00 |
| Domain (amortised, ~$14/yr) | 1.15 |
| GitHub Actions builds | 0.00 |
| Reserved IP · bandwidth · monitoring · TLS | 0.00 |
| **Total** | **≈ $16.55** |

Accepted risk: up to 24 h data loss, no database SLA.

### Production path — before first real transaction

| Item | $/mo |
|---|---|
| Everything above | 16.55 |
| **Supabase Pro** (PITR, SLA, no pausing) | 25.00 |
| **Total** | **≈ $41.55** |

### Optional later

| Item | $/mo | When |
|---|---|---|
| Uptime monitoring (free tiers exist) | 0–20 | Phase 13 |
| Error tracking — Sentry | 0–26 | Recommended for a POS |
| 4G failover router | ~$50 one-off | Now (§8.3) |
| Staging Droplet | 12 | Once the business depends on this |

---

## 11. Ubuntu Version — DECISION: 24.04 LTS (Noble Numbat)

| Option | Supported until | Assessment |
|---|---|---|
| **24.04 LTS** | Apr 2029 (2034 w/ Pro) | **Chosen** — mature, universal third-party repo support |
| 26.04 LTS | Apr 2031 | Released Apr 2026; wait for `26.04.1` (~Aug 2026) |
| Non-LTS interim | 9 months | Never for production |

**Why LTS:** interim releases get 9 months. Reaching EOL on a production server means an
urgent distribution upgrade or running unpatched — neither acceptable for a system handling
payment data.

**Why not the newer LTS:** standard practice is to wait for the first point release of a new
LTS. The `.1` (~4 months post-launch) folds in early-adoption fixes, and by then NodeSource,
certbot, PM2, and Docker repos have caught up. 26.04.1 is not out yet; 24.04 runs to 2029.

**The principle:** production infrastructure should be boring. Choose the version everyone
else has already debugged. Novelty is a cost you pay at 2am.

---

## 12. Kenya-Specific Considerations

### 12.1 Locale

| Setting | Value | Phase |
|---|---|---|
| Timezone | `Africa/Nairobi` (EAT, UTC+3) | Phase 3 |
| NTP | `systemd-timesyncd` | Phase 3 |
| Currency | KES — app already has a `currencies` table with `is_default` | Phase 7 |

⚠️ **Timezone note:** the server should run **UTC** internally with `Africa/Nairobi` used
only for display. Storing local timestamps in the database is a recurring source of
end-of-day reporting bugs. Verify the app's date handling in Phase 7 — sales reports that
close at midnight EAT but aggregate on UTC dates will silently mis-attribute revenue.

### 12.2 Data protection — requires legal review, not my advice

Kenya's **Data Protection Act, 2019** is likely relevant here. Your `customers` table holds
names, phone numbers, emails, and physical addresses — personal data under the Act.

Two points to raise with a qualified advisor **before go-live**:

1. **Registration.** Data controllers and processors may be required to register with the
   Office of the Data Protection Commissioner (ODPC), subject to turnover and data-volume
   thresholds.
2. **Cross-border transfer.** Hosting personal data on servers in Frankfurt constitutes a
   transfer outside Kenya, which the Act regulates and which may require specific safeguards
   or consent.

I am not a lawyer and this is not legal advice — but a deployment that ignores it is
incomplete, and it is far cheaper to establish the position now than to relocate
infrastructure later. If the review concludes data must remain in Kenya, the architecture
changes materially (DigitalOcean has no African region), so **resolve this before Phase 2.**

### 12.3 M-Pesa

The schema includes `mobile_money` as a payment method. If M-Pesa/Daraja API integration is
planned, it introduces additional secrets (consumer key, secret, passkey) and a webhook
endpoint that must be publicly reachable and IP-allowlisted. Out of scope for this
deployment, but flag it now so the Nginx and firewall configuration in Phase 9 can
accommodate it without rework.

---

## 13. Phase 1 Sign-off

| # | Item | Status |
|---|---|---|
| 1 | Architecture defined | ✅ |
| 2 | Droplet size: 2 GB / 1 vCPU / 50 GB | ✅ |
| 3 | Region: FRA1 + Supabase `eu-central-1` | ✅ pending migration |
| 4 | OS: Ubuntu 24.04 LTS | ✅ |
| 5 | Firewall: Cloud Firewall + UFW | ✅ |
| 6 | Backup strategy: 5 layers | ✅ |
| 7 | Recovery: RTO < 30 min, RPO 24 h → < 1 min on Pro | ✅ |
| 8 | Budget: ~$17/mo pilot → ~$42/mo production | ✅ |
| 9 | Latency tested from store network | ⬜ **to do** |
| 10 | Supabase migrated to `eu-central-1` | ⬜ **to do** |
| 11 | **Critical: service role key rotated, history purged** | ⬜ **BLOCKING** |
| 12 | Kenya DPA position established | ⬜ **to do** |

**Phases 2+ are blocked on item 11.**
