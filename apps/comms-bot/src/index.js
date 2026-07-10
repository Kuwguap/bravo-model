/**
 * Communications bot HTTP service (Render).
 *   GET  /webhook   ← Meta webhook verification (hub.challenge)
 *   POST /webhook   ← Messenger messaging events
 *   POST /sweep     ← manual sweep trigger (guarded)
 *   GET  /health
 */

import express from "express";
import { config, assertConfig } from "./config.js";
import { sendText, sendTyping, verifySignature } from "./facebook.js";
import { getOrCreateLead, mergeFields, updateLead, appendTranscript, isComplete } from "./sheet.js";
import { converse } from "./conversation.js";
import { createPaymentLink } from "./checkout.js";
import { runSweep } from "./followups.js";
import { ensurePrimaryAccount, getAccountByPageId, verifyTokenMatches, appSecretFor } from "./accounts.js";

const app = express();
app.use(express.json({ verify: (req, _res, buf) => { req.rawBody = buf; } }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "comms-bot" }));

// ─── Meta webhook verification ───────────────────────────────────────────────
// Accepts the env verify token or any dashboard-added account's own token, so
// one webhook URL can serve every connected page/app.
app.get("/webhook", async (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && (await verifyTokenMatches(token))) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ─── Messenger events ────────────────────────────────────────────────────────
app.post("/webhook", async (req, res) => {
  const body = req.body;
  // A delivery concerns one app/page batch, so verify against that page's
  // account secret (or the shared env secret) resolved from the first entry.
  const firstAccount = await getAccountByPageId(body?.entry?.[0]?.id).catch(() => null);
  if (!verifySignature(req.rawBody, req.get("x-hub-signature-256"), appSecretFor(firstAccount))) {
    return res.sendStatus(403);
  }
  res.sendStatus(200); // ack fast; process async
  if (body.object !== "page") return;
  for (const entry of body.entry || []) {
    const account = await getAccountByPageId(entry.id).catch(() => null);
    if (!account) {
      console.warn("[comms] no registered account for page", entry.id, "— skipping");
      continue;
    }
    for (const event of entry.messaging || []) {
      const psid = event.sender?.id;
      const text = event.message?.text;
      if (!psid || event.message?.is_echo || !text) continue;
      handleMessage(account, psid, text).catch((err) => console.error("[comms] handleMessage:", err.message));
    }
  }
});

/** The core: one inbound message → update the right page's sheet → one human reply. */
export async function handleMessage(account, psid, text) {
  let lead = await getOrCreateLead(account, psid);
  await appendTranscript(lead, "client", text);
  lead = await getOrCreateLead(account, psid); // reload with the appended transcript

  const { extracted, insurance_opt_in, pay_method, reply } = await converse(lead, text);

  // Save every detail to the sheet the moment we have it.
  lead = await mergeFields(lead, { ...extracted, insurance_opt_in });
  if (pay_method && lead.pay_method !== pay_method) lead = await updateLead(lead.id, { pay_method });

  const messages = [reply];

  // Once the sheet has everything, move to payment.
  if (isComplete(lead)) {
    if (lead.pay_method === "chat") {
      const link = await createPaymentLink(lead);
      if (link.ok) messages.push(`here's your secure link — $${link.total}: ${link.url}\nonce it's paid I'll send the tag right over.`);
      else messages.push("give me one sec on that payment link — having a hiccup, i'll get it to you shortly.");
    } else if (lead.pay_method === "site") {
      await updateLead(lead.id, { status: "awaiting_payment" });
      messages.push(`you can pay on our site here: ${config.appUrl}\njust use the same name and i'll catch it on my end and send the tag.`);
    }
  }

  await send(account, psid, messages, lead);
}

async function send(account, psid, messages, lead) {
  for (const m of messages) {
    if (!m) continue;
    await sendTyping(account, psid, true);
    await sendText(account, psid, m);
    await appendTranscript(lead, "bot", m);
  }
}

// ─── Manual sweep (guarded) ──────────────────────────────────────────────────
app.post("/sweep", async (req, res) => {
  if ((req.get("x-sweep-secret") || req.query.secret) !== (config.dispatchSharedSecret || "sweep")) {
    return res.status(401).json({ ok: false });
  }
  try {
    res.json({ ok: true, ...(await runSweep()) });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(config.port, async () => {
  assertConfig();
  console.log(`[comms-bot] listening on :${config.port}`);
  // Register the primary page from env so it appears on the dashboard and its
  // page id is known for webhook routing before the first message lands.
  await ensurePrimaryAccount().catch((e) => console.error("[comms] primary account:", e.message));
  const everyMs = Math.max(1, config.followupMinutes) * 60000;
  // Reconcile payments frequently; nudges are rate-limited inside the sweep.
  setInterval(() => {
    runSweep().catch((e) => console.error("[comms] sweep:", e.message));
  }, Math.min(everyMs, 120000)); // at least every 2 min for payment reconciliation
});
