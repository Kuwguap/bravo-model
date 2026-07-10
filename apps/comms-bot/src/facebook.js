/**
 * Facebook Messenger (Meta Graph API) send + webhook verification.
 * Account-aware: every send uses the specific Page's own access token, so one
 * service can drive many Facebook pages. Best-effort sends: log and return,
 * never throw.
 */

import crypto from "node:crypto";
import { config } from "./config.js";

const graph = (path) => `https://graph.facebook.com/${config.fb.graphVersion}/${path}`;

/** The page-scoped send token for an account (falls back to the env primary). */
function tokenFor(account) {
  return account?.page_access_token || config.fb.pageAccessToken || "";
}

/** Send a plain text message from `account`'s page to a page-scoped id. */
export async function sendText(account, psid, text) {
  const token = tokenFor(account);
  if (!token) {
    console.warn("[fb] no page token — would send:", text);
    return { ok: false, error: "no page token" };
  }
  try {
    const res = await fetch(`${graph("me/messages")}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        recipient: { id: psid },
        messaging_type: "RESPONSE",
        message: { text: String(text).slice(0, 1900) },
      }),
    });
    const json = await res.json().catch(() => ({}));
    if (json.error) {
      console.warn("[fb] send error:", json.error.message);
      return { ok: false, error: json.error.message };
    }
    return { ok: true, result: json };
  } catch (err) {
    console.warn("[fb] send threw:", err.message);
    return { ok: false, error: err.message };
  }
}

/** Toggle the typing indicator so replies feel a touch more human. */
export async function sendTyping(account, psid, on = true) {
  const token = tokenFor(account);
  if (!token) return;
  try {
    await fetch(`${graph("me/messages")}?access_token=${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ recipient: { id: psid }, sender_action: on ? "typing_on" : "typing_off" }),
    });
  } catch {
    /* ignore */
  }
}

/**
 * Verify the X-Hub-Signature-256 header against the raw body. The app secret is
 * the delivery's page's own secret when set, else the shared env secret.
 */
export function verifySignature(rawBody, signatureHeader, appSecret = config.fb.appSecret) {
  if (!appSecret) return true; // not enforced if no secret configured
  if (!signatureHeader) return false;
  const expected = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(signatureHeader), Buffer.from(expected));
  } catch {
    return false;
  }
}
