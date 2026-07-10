/**
 * Facebook account registry. One row per Page (comms_accounts) — each carries
 * its own page access token and, optionally, its own app secret / verify token.
 *
 * The PRIMARY page is seeded from env on boot (its page id resolved from the
 * token via Graph /me when FB_PAGE_ID isn't set). Every other page is added on
 * the central dashboard; this service picks those up from the shared DB on a
 * short TTL cache, so no redeploy is needed to onboard a new page.
 */

import { supa } from "./sheet.js";
import { config } from "./config.js";

const TTL_MS = 60000;
let cache = { at: 0, byPage: new Map(), byId: new Map() };

async function refresh() {
  const { data, error } = await supa().from("comms_accounts").select("*").eq("active", true);
  if (error) {
    console.warn("[accounts] load failed:", error.message);
    return;
  }
  const byPage = new Map();
  const byId = new Map();
  for (const a of data || []) {
    if (a.page_id) byPage.set(String(a.page_id), a);
    byId.set(a.id, a);
  }
  cache = { at: Date.now(), byPage, byId };
}

async function ensureFresh() {
  if (Date.now() - cache.at > TTL_MS) await refresh();
}

/** Resolve the account that owns a Page id (webhook entry[].id). */
export async function getAccountByPageId(pageId) {
  if (!pageId) return null;
  await ensureFresh();
  let a = cache.byPage.get(String(pageId));
  if (!a) {
    await refresh(); // a brand-new dashboard-added page may not be cached yet
    a = cache.byPage.get(String(pageId));
  }
  return a || null;
}

/** Resolve the account for an existing lead (used by sweeps to pick the token). */
export async function getAccountById(id) {
  if (!id) return null;
  await ensureFresh();
  let a = cache.byId.get(id);
  if (!a) {
    await refresh();
    a = cache.byId.get(id);
  }
  return a || null;
}

/** Best-effort account for a lead: by stored account_id, else by page id. */
export async function accountForLead(lead) {
  return (await getAccountById(lead.account_id)) || (await getAccountByPageId(lead.fb_page_id));
}

export async function listActiveAccounts() {
  await ensureFresh();
  return [...cache.byId.values()];
}

/** Does this verify token belong to any active account (or the env fallback)? */
export async function verifyTokenMatches(token) {
  if (token && token === config.fb.verifyToken) return true;
  await ensureFresh();
  for (const a of cache.byId.values()) {
    if (a.verify_token && a.verify_token === token) return true;
  }
  return false;
}

/** App secret to check a delivery's signature: the page's own, else env. */
export function appSecretFor(account) {
  return account?.app_secret || config.fb.appSecret;
}

/**
 * Seed / refresh the PRIMARY account from env on boot. Env is the source of
 * truth for the primary's token; the row exists so the dashboard can see it
 * alongside the others. Page id comes from FB_PAGE_ID or Graph /me.
 */
export async function ensurePrimaryAccount() {
  const token = config.fb.pageAccessToken;
  if (!token) return null;

  let pageId = config.fb.pageId;
  let name = config.fb.pageName;
  if (!pageId) {
    try {
      const res = await fetch(
        `https://graph.facebook.com/${config.fb.graphVersion}/me?fields=id,name&access_token=${encodeURIComponent(token)}`,
      );
      const j = await res.json().catch(() => ({}));
      if (j.id) {
        pageId = String(j.id);
        name = name || j.name;
      } else {
        console.warn("[accounts] could not resolve primary page id:", j.error?.message || "no id");
      }
    } catch (err) {
      console.warn("[accounts] graph /me failed:", err.message);
    }
  }
  if (!pageId) return null;

  const client = supa();
  const { data: existing } = await client.from("comms_accounts").select("id").eq("page_id", String(pageId)).maybeSingle();

  // Env owns the primary's credentials; don't clobber a dashboard-renamed label
  // or an operator's active toggle on re-boot.
  const creds = {
    page_access_token: token,
    app_secret: config.fb.appSecret || null,
    verify_token: config.fb.verifyToken || null,
    is_primary: true,
  };
  if (existing) {
    await client.from("comms_accounts").update({ ...creds, updated_at: new Date().toISOString() }).eq("id", existing.id);
  } else {
    const { error } = await client
      .from("comms_accounts")
      .insert({ name: name || "Primary page", page_id: String(pageId), active: true, ...creds });
    if (error) console.warn("[accounts] seed primary failed:", error.message);
  }
  await refresh();
  console.log(`[accounts] primary page ready (${name || pageId})`);
  return cache.byPage.get(String(pageId)) || null;
}
