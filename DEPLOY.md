# Deployment & setup guide

End-to-end setup for the 4-part system. Order matters: provision the backing
services first (they produce the secrets the apps need), then deploy the apps.

Repo: **https://github.com/Kuwguap/bravo-model** (this is the deploy source).

```
Tag buyer ─▶ tag-site (Vercel, njtemporarytag.com) ─▶ Supabase order
                                                      └▶ dispatch-bot (Render) ─▶ supervisors + drivers (Telegram) ─▶ emails
Insurance buyer ─▶ insurance-site (Vercel) ─▶ Supabase policy/invoice ─▶ transactions ledger
central-bot (Render) ─▶ dashboard + 28-day renewals (SendGrid) + /stats
```

---

## 0) Accounts you need
Supabase, Stripe, SendGrid, OpenAI, Telegram (2 bots via @BotFather), Vercel, Render.
`pnpm` locally to generate a lockfile: `corepack enable && corepack prepare pnpm@9 --activate`.

## 1) Supabase (single shared project)
1. Create a project. From **Settings → API** copy: `Project URL`, `anon` key, `service_role` key.
2. **SQL Editor** → run every file in `supabase/migrations/` **in filename order**:
   `0001_init_tags_dispatch.sql`, `0002_renewals_central.sql`, then the `202604*`
   insurance files. (They don't collide.) Buckets `order-documents` and
   `delivery-receipts` are created by `0001`.
3. Seed staff: open `supabase/seed.sql`, replace the Telegram ids/emails with real
   ones, run it. (Or add them later in the central dashboard.)
   - Get a numeric Telegram id by DMing **@userinfobot**; a group id is negative.

## 2) Stripe
1. **Developers → API keys**: copy the **Secret key** (`sk_...`). Use test keys first.
2. Webhooks are added **after** the sites are deployed (you need their URLs) — see §7.

## 3) SendGrid
1. Create an API key (Full Access or Mail Send) → `SENDGRID_API_KEY`.
2. **Verify a sender** (single sender or a domain). Use it as `SENDGRID_FROM`
   (e.g. `no-reply@njtemporarytag.com`). Unverified senders are rejected.

## 4) OpenAI
Create a key → `OPENAI_API_KEY` (used for lead parsing + field normalization).

## 5) Telegram bots
1. **@BotFather** → `/newbot` twice: one **dispatch** bot, one **central** bot.
   Copy each token → `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CENTRAL_BOT_TOKEN`.
2. Webhooks self-register on boot once the bots are deployed with their public URLs.

---

## 6) Deploy the tag site → Vercel → njtemporarytag.com

Because this is a **pnpm monorepo**, deploy via **git integration** (not a
folder upload — the `@speedy/shared` workspace dep only resolves at the repo root).

1. Push a lockfile once (smooths installs): locally run `pnpm install` at the repo
   root and commit `pnpm-lock.yaml`.
2. Vercel → **Add New → Project → Import** the `bravo-model` repo.
3. **Root Directory:** `apps/tag-site`  ·  **Framework:** Vite (auto).
4. If the build can't find `@speedy/shared`, turn ON **Settings → Build & Development →
   "Include files outside the root directory"** (lets Vercel install from the
   workspace root). Install command stays default (`pnpm install`).
5. Add env vars (see the matrix in §9), then **Deploy**.
6. **Attach the domain** (already registered in your Vercel account):
   Project → **Settings → Domains → Add** `njtemporarytag.com` (and `www` → redirect).
   Vercel manages its DNS, so it goes live automatically. Set `APP_URL=https://njtemporarytag.com`.

CLI alternative once the project exists & builds: `vercel --prod` from `apps/tag-site`,
then `vercel domains add njtemporarytag.com <project>`.

## 7) Wire the Stripe webhook (tag site)
Stripe → **Developers → Webhooks → Add endpoint**:
`https://njtemporarytag.com/api/stripe/webhook`, event **`checkout.session.completed`**.
Copy the signing secret → set `STRIPE_WEBHOOK_SECRET` on the tag-site project, redeploy.
(The browser `verify` call is the primary path, so checkout still completes even
before the webhook is set — but set it for tab-close resilience.)

## 8) Deploy the insurance site → Vercel (NJ Coverage)
Same as §6 with **Root Directory `apps/insurance-site`** (Framework: Next.js). It has
no workspace deps, so it installs cleanly. Fill its env from
`apps/insurance-site/.env.example` (shares `SUPABASE_*` and `STRIPE_*`). Add its
Stripe webhook `https://<insurance-domain>/api/stripe/webhook`. Attach a domain of
your choice (you own `instantaiinsurance.com` / `tristatecoverage.com`).

## 9) Deploy the two bots → Render
For each: **New → Web Service → connect `bravo-model`**, set **Root Directory** and
use the `render.yaml` in that folder (Build `corepack enable && pnpm install`,
Start `pnpm start`, Health `/health`).

- **dispatch-bot** — Root `apps/dispatch-bot`. After first deploy, set
  `DISPATCH_PUBLIC_URL` to the Render URL and redeploy (it registers its Telegram
  webhook on boot; or run `pnpm --filter @speedy/dispatch-bot set-webhook`).
- **central-bot** — Root `apps/central-bot`. Set `CENTRAL_PUBLIC_URL` to its Render
  URL. The dashboard is at that URL (`/login`, password = `ADMIN_PASSWORD`).
  Optionally add a Render **Cron Job** hitting `POST /cron/renewals` daily.

Point the tag site at the dispatch bot: set `DISPATCH_BOT_URL` = dispatch-bot Render
URL on the **tag-site** project, and use the **same** `DISPATCH_SHARED_SECRET` on both.

---

## Env var matrix

| Var | tag-site | dispatch-bot | insurance-site | central-bot |
|---|:--:|:--:|:--:|:--:|
| SUPABASE_URL / SERVICE_ROLE_KEY / ANON_KEY | ✅ | ✅ | ✅ | ✅ |
| STRIPE_SECRET_KEY | ✅ |  | ✅ |  |
| STRIPE_WEBHOOK_SECRET | ✅ |  | ✅ |  |
| SENDGRID_API_KEY / SENDGRID_FROM |  | ✅ | ✅ | ✅ |
| OPENAI_API_KEY | ✅ | ✅ | ✅ |  |
| APP_URL (`https://njtemporarytag.com`) | ✅ | ✅ |  | ✅ |
| TAG_PRICE / INSURANCE_OPT_IN_PRICE | ✅ |  |  |  |
| RENEWAL_PERIOD_DAYS | ✅ |  |  | ✅ |
| DISPATCH_BOT_URL | ✅ |  |  |  |
| DISPATCH_SHARED_SECRET | ✅ | ✅ |  |  |
| TELEGRAM_BOT_TOKEN |  | ✅ |  |  |
| DISPATCH_PUBLIC_URL |  | ✅ |  |  |
| ADMIN_PASSWORD / SESSION_SECRET |  |  |  | ✅ |
| TELEGRAM_CENTRAL_BOT_TOKEN / CENTRAL_PUBLIC_URL |  |  |  | ✅ |

`DISPATCH_SHARED_SECRET` must be identical on tag-site and dispatch-bot. Never put
`SUPABASE_SERVICE_ROLE_KEY` in a browser-exposed var.

## 10) End-to-end test (Stripe test mode)
1. njtemporarytag.com → buy a tag as an **NJ** buyer, then a **non-NJ** buyer.
2. Supervisors receive the full PDF; drivers get Accept/Decline. Accept as one driver
   → others see "Claimed", that driver gets the PDF by email, customer emailed.
3. Driver sends a receipt photo → delivery marked delivered.
4. In the dispatch bot chat (as a seeded supervisor) paste a raw lead → parsed → PDF →
   "Send to all / Pick a driver".
5. Central dashboard (`/login`) shows the transactions, deliveries, and renewals.
6. `/stats` in the central Telegram bot returns the snapshot.

> ⚠️ This system generates temporary plates and insurance ID cards from user data.
> Confirm you operate under an authorized dealer/DMV arrangement before going live.
