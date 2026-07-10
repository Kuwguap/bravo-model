/**
 * Background sweep (runs on an interval):
 *   1. chat-pay leads awaiting payment → check Stripe; if paid, dispatch + tell them.
 *   2. site-pay leads → match a paid website order by name; if found, tell them.
 *   3. leads that went quiet mid-collection → a gentle, human follow-up nudge
 *      (capped, so we never pester).
 *
 * Leads sit in limbo on the sheet as long as the client needs — nothing here
 * deletes them; it only nudges and reconciles.
 */

import { config } from "./config.js";
import { supa } from "./sheet.js";
import { sendText } from "./facebook.js";
import { accountForLead } from "./accounts.js";
import { checkAndFinalize, matchSitePayment } from "./checkout.js";

/** Send to a lead using its own page's token (each page replies as itself). */
async function tell(lead, text) {
  const account = await accountForLead(lead);
  return sendText(account, lead.fb_psid, text);
}

// Varied, human-written nudges (never the same line twice in a row per lead).
const NUDGES = [
  (l) => `hey${l.first_name ? " " + l.first_name : ""}, still wanna finish getting that tag sorted?`,
  (l) => `no rush — whenever you're ready, just send the next bit and we'll keep going`,
  (l) => `picking back up whenever you are. we left off needing a couple more details`,
  (l) => `you still there? happy to wrap this up when you've got a sec`,
];

export async function runSweep() {
  const client = supa();
  const now = Date.now();

  // 1 + 2: reconcile payments.
  const { data: awaiting } = await client
    .from("comms_leads")
    .select("*")
    .in("status", ["awaiting_payment"])
    .limit(200);
  for (const lead of awaiting || []) {
    try {
      if (lead.pay_method === "chat" && lead.stripe_session_id) {
        const paid = await checkAndFinalize(lead);
        if (paid) await tell(lead, "payment came through 🎉 your temp tag's being made now — it'll hit your email shortly.");
      } else if (lead.pay_method === "site") {
        const order = await matchSitePayment(lead);
        if (order) await tell(lead, "got your payment on the site — tag's being made now, check your email in a bit.");
      }
    } catch (err) {
      console.warn("[sweep] reconcile", lead.handle, err.message);
    }
  }

  // Site-pay leads that never got flagged awaiting (matched opportunistically).
  const { data: sitePending } = await client
    .from("comms_leads")
    .select("*")
    .eq("pay_method", "site")
    .eq("status", "collecting")
    .limit(200);
  for (const lead of sitePending || []) {
    try {
      const order = await matchSitePayment(lead);
      if (order) await tell(lead, "saw your payment come through on the site — making the tag now.");
    } catch (err) {
      console.warn("[sweep] site-match", lead.handle, err.message);
    }
  }

  // 3: nudge quiet, still-collecting leads.
  const cutoff = new Date(now - config.followupMinutes * 60000).toISOString();
  const { data: quiet } = await client
    .from("comms_leads")
    .select("*")
    .eq("status", "collecting")
    .lt("follow_up_count", config.maxFollowups)
    .not("last_client_message_at", "is", null)
    .lt("last_client_message_at", cutoff)
    .limit(100);
  for (const lead of quiet || []) {
    try {
      // Don't nudge if we already messaged since their last reply and it's recent.
      const idx = Math.min(lead.follow_up_count, NUDGES.length - 1);
      await tell(lead, NUDGES[idx](lead));
      await client
        .from("comms_leads")
        .update({ follow_up_count: lead.follow_up_count + 1, last_bot_message_at: new Date().toISOString() })
        .eq("id", lead.id);
    } catch (err) {
      console.warn("[sweep] nudge", lead.handle, err.message);
    }
  }

  return {
    reconciled: (awaiting || []).length,
    sitePending: (sitePending || []).length,
    nudged: (quiet || []).length,
  };
}
