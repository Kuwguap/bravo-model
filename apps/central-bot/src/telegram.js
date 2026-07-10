/**
 * Central Telegram control bot. Optional (only active when
 * TELEGRAM_CENTRAL_BOT_TOKEN is set). Lets an operator pull a live summary
 * with /stats and trigger the renewal sweep with /renewals.
 */

import { config } from "./config.js";
import { overview, analytics } from "./db.js";
import { runRenewalSweep } from "./renewals.js";

const api = (method) => `https://api.telegram.org/bot${config.botToken}/${method}`;

async function send(chatId, text) {
  if (!config.botToken) return;
  try {
    await fetch(api("sendMessage"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
    });
  } catch (err) {
    console.warn("[central-tg] send failed:", err.message);
  }
}

const money = (c) => `$${((c || 0) / 100).toFixed(2)}`;

export async function handleUpdate(update) {
  const msg = update.message;
  if (!msg?.text) return;
  const chatId = msg.chat.id;
  const cmd = msg.text.trim().split(/\s+/)[0].toLowerCase();

  if (cmd === "/start" || cmd === "/help") {
    return send(
      chatId,
      [
        "🛰 <b>NJ control bot</b>",
        "",
        "/stats — live totals (revenue, users, deliveries, FB leads, renewals)",
        "/sheet — comms bot sheet summary (Facebook conversations)",
        "/renewals — send any due 28-day renewal emails now",
      ].join("\n"),
    );
  }

  if (cmd === "/stats") {
    const [o, a] = await Promise.all([overview(), analytics()]);
    return send(
      chatId,
      [
        "📊 <b>System snapshot</b>",
        `Visits: <b>${(a.visits ?? 0).toLocaleString()}</b> (${(a.uniqueVisitors ?? 0).toLocaleString()} unique)`,
        `Revenue: <b>${money(o.revenueCents)}</b> (${o.txnCount} paid)`,
        `• Tags: ${money(o.tagRevenueCents)} (${o.tagCount})`,
        `• Insurance: ${money(o.insRevenueCents)} (${o.insCount})`,
        `Tag customers: <b>${o.userCount}</b> · Insurance: <b>${o.insCustomers}</b> (${o.activePolicies} active)`,
        `Deliveries: ${o.deliveriesOpen} open · ${o.deliveriesDone} done`,
        `FB leads: <b>${o.commsTotal ?? 0}</b> (${o.commsCollecting ?? 0} collecting · ${o.commsAwaiting ?? 0} awaiting pay · ${o.commsConverted ?? 0} converted)`,
        `Renewals due: <b>${o.renewalsDue}</b>`,
      ].join("\n"),
    );
  }

  if (cmd === "/sheet") {
    const o = await overview();
    return send(
      chatId,
      [
        "🗒 <b>Comms bot sheet</b>",
        `Total conversations: <b>${o.commsTotal ?? 0}</b>`,
        `• Collecting: ${o.commsCollecting ?? 0}`,
        `• Awaiting payment: ${o.commsAwaiting ?? 0}`,
        `• Converted: ${o.commsConverted ?? 0}`,
        "",
        "Full live sheet: the dashboard's Sheet tab.",
      ].join("\n"),
    );
  }

  if (cmd === "/renewals") {
    await send(chatId, "⏳ Running renewal sweep…");
    const r = await runRenewalSweep();
    return send(chatId, `✅ Renewals: sent ${r.sent} of ${r.considered} due (${r.errors} errors).`);
  }

  return send(chatId, "Unknown command. Try /stats, /sheet or /renewals.");
}

export async function setWebhook() {
  if (!config.botToken || !config.publicUrl) return { ok: false };
  try {
    const res = await fetch(api("setWebhook"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: `${config.publicUrl}/telegram/webhook`,
        allowed_updates: ["message"],
      }),
    });
    const json = await res.json();
    if (json.ok) console.log(`[central-tg] webhook set → ${config.publicUrl}/telegram/webhook`);
    return json;
  } catch (err) {
    console.warn("[central-tg] setWebhook failed:", err.message);
    return { ok: false };
  }
}
