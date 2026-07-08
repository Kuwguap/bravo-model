/**
 * Shared serverless helpers: Stripe client, pricing, order finalize + dispatch.
 * Kept framework-agnostic so both the browser-driven verify path and the
 * Stripe webhook can reuse finalizeOrder() idempotently.
 */

import Stripe from "stripe";
import { getServiceClient, cleanEnv } from "./supabase.js";

export const stripe = new Stripe(cleanEnv(process.env.STRIPE_SECRET_KEY), {
  apiVersion: "2024-12-18.acacia",
});

export const supa = () => getServiceClient();

export const pricing = {
  tag: Number(process.env.TAG_PRICE || 150),
  insuranceOptIn: Number(process.env.INSURANCE_OPT_IN_PRICE || 100),
  currency: "usd",
};

/**
 * Delivery methods. Every option includes the $150 tag; `surcharge` is the
 * amount added on top. Some methods carry a sub-choice (`tiers` for Mail,
 * `uberZones` for the Robot/Uber courier) that sets the surcharge.
 */
export const DELIVERY = {
  email: { label: "Email", surcharge: 0, eta: "Instant — within 15 minutes" },
  mail: {
    label: "Mail",
    surcharge: 12,
    eta: "USPS, tracked",
    tiers: {
      priority: { label: "Priority (2–3 days)", surcharge: 12 },
      overnight: { label: "Overnight (next day)", surcharge: 33 },
    },
  },
  pickup: { label: "Pickup", surcharge: 0, eta: "247 Knox Ave, Cliffside Park, NJ 07010" },
  robot: {
    label: "Robot / Uber courier",
    surcharge: 0,
    eta: "Prepaid tags only — no cash to the courier",
    uberZones: {
      paterson: { label: "Paterson", fee: 27 },
      bronx: { label: "Bronx", fee: 31 },
      brooklyn: { label: "Brooklyn", fee: 50 },
      gwb: { label: "North NJ / near GW Bridge", fee: 50 },
      queens: { label: "Queens", fee: 50 },
    },
  },
  driver: { label: "Human driver", surcharge: 0, eta: "Free delivery" },
};

/** Delivery surcharge in dollars for a method + optional sub-choice. */
export function deliverySurcharge(method, option) {
  const m = DELIVERY[method];
  if (!m) return 0;
  if (m.tiers) return m.tiers[option]?.surcharge ?? m.surcharge;
  if (m.uberZones) return m.uberZones[option]?.fee ?? 0;
  return m.surcharge || 0;
}

/** Aggregate total in dollars: tag + insurance opt-in + delivery. */
export function totalFor(insuranceOptIn, method, option) {
  return pricing.tag + (insuranceOptIn ? pricing.insuranceOptIn : 0) + deliverySurcharge(method, option);
}

/** Read raw request body (needed for Stripe webhook signature). */
export async function readRawBody(req) {
  if (req.body && Buffer.isBuffer(req.body)) return req.body;
  const chunks = [];
  for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

/** POST the paid order to the dispatch bot to generate the PDF + dispatch. */
async function pushToDispatch(orderId) {
  const base = (process.env.DISPATCH_BOT_URL || "").replace(/\/$/, "");
  if (!base) {
    console.warn("[finalize] DISPATCH_BOT_URL not set — order not dispatched");
    return;
  }
  try {
    const res = await fetch(`${base}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": process.env.DISPATCH_SHARED_SECRET || "",
      },
      body: JSON.stringify({ orderId }),
    });
    if (!res.ok) console.warn("[finalize] dispatch returned", res.status, await res.text().catch(() => ""));
  } catch (err) {
    console.warn("[finalize] dispatch push failed:", err.message);
  }
}

/**
 * Mark an order paid, write the transaction, and trigger dispatch — exactly
 * once. Safe to call from both verify and webhook; the paid-status guard makes
 * it idempotent.
 * @param {string} orderId
 * @param {object} session Stripe checkout session (must be paid)
 */
export async function finalizeOrder(orderId, session) {
  const client = supa();
  const { data: order } = await client.from("orders").select("*").eq("id", orderId).single();
  if (!order) return { ok: false, reason: "order-not-found" };
  if (order.status === "paid") return { ok: true, already: true, order };

  const paidAt = new Date().toISOString();
  const renewalDays = Number(process.env.RENEWAL_PERIOD_DAYS || 28);
  const renewalDueAt = new Date(Date.now() + renewalDays * 86400000).toISOString();

  const { data: updated } = await client
    .from("orders")
    .update({
      status: "paid",
      paid_at: paidAt,
      renewal_due_at: renewalDueAt,
      stripe_session_id: session.id,
      price: (session.amount_total ?? 0) / 100,
    })
    .eq("id", orderId)
    .eq("status", "pending") // guard: only the first finalize wins
    .select("*")
    .maybeSingle();

  if (!updated) {
    // Someone else finalized between our read and write.
    return { ok: true, already: true };
  }

  await client.from("transactions").insert({
    source: "tag",
    stripe_id: session.payment_intent || session.id,
    amount_cents: session.amount_total ?? 0,
    status: "paid",
    user_id: updated.user_id,
    order_id: orderId,
  });

  await pushToDispatch(orderId);
  return { ok: true, order: updated };
}

export function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}
