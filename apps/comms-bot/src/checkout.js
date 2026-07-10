/**
 * Turning a finished sheet into money + a tag.
 *   chat pay  → create a pending order + a Stripe checkout link, send it,
 *               poll the session, and on payment mark it paid + hand to dispatch.
 *   site pay  → the client buys on njtemporarytag.com; we match the paid order
 *               back to this lead by name and close the loop.
 */

import Stripe from "stripe";
import { config } from "./config.js";
import { supa } from "./sheet.js";

const stripe = new Stripe(config.stripeKey || "sk_test_placeholder", { apiVersion: "2024-12-18.acacia" });

function totalFor(lead) {
  return config.tagPrice + (lead.insurance_opt_in ? config.insurancePrice : 0);
}

/** Insert (once) a pending order from the sheet; returns the order row. */
export async function ensureOrder(lead) {
  if (lead.order_id) {
    const { data } = await supa().from("orders").select("*").eq("id", lead.order_id).maybeSingle();
    if (data) return data;
  }
  const client = supa();
  const { data: user } = await client
    .from("users")
    .upsert({ email: lead.email, first_name: lead.first_name, last_name: lead.last_name, phone: lead.phone || null }, { onConflict: "email" })
    .select("id")
    .maybeSingle();

  const { data: order, error } = await client
    .from("orders")
    .insert({
      reference: `fb_${Date.now().toString(36)}`,
      user_id: user?.id || null,
      status: "pending",
      state: String(lead.state || "NJ").toUpperCase(),
      first_name: lead.first_name,
      last_name: lead.last_name,
      email: lead.email,
      phone: lead.phone || null,
      address: lead.address || null,
      address2: lead.address2 || null,
      city: lead.city || null,
      zip: lead.zip || null,
      vin: lead.vin || null,
      year: lead.year || null,
      make: lead.make || null,
      model: lead.model || null,
      color: lead.color || null,
      body: lead.body || null,
      insurance_opt_in: Boolean(lead.insurance_opt_in),
      insurance_company: lead.insurance_company || null,
      insurance_policy: lead.insurance_policy || null,
      driver_license: lead.driver_license || null,
      delivery_method: "email",
      delivery_email: lead.email,
      price: totalFor(lead),
      comms_handle: lead.handle,
    })
    .select("*")
    .single();
  if (error) throw new Error(`[checkout] create order: ${error.message}`);
  await client.from("comms_leads").update({ order_id: order.id }).eq("id", lead.id);
  return order;
}

/** A Stripe Checkout link for the chat-payment path. */
export async function createPaymentLink(lead) {
  if (!config.stripeKey) return { ok: false, error: "STRIPE_SECRET_KEY not set" };
  const order = await ensureOrder(lead);
  const total = totalFor(lead);
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: lead.email || undefined,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: Math.round(total * 100),
          product_data: {
            name: "New Jersey 30-day Temporary Tag",
            description: lead.insurance_opt_in ? "+ 1-month coverage card" : undefined,
          },
        },
      },
    ],
    metadata: { orderId: order.id, comms_handle: lead.handle },
    success_url: `${config.appUrl}/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${config.appUrl}/`,
  });
  await supa().from("orders").update({ stripe_session_id: session.id }).eq("id", order.id);
  await supa().from("comms_leads").update({ stripe_session_id: session.id, status: "awaiting_payment", pay_method: "chat" }).eq("id", lead.id);
  return { ok: true, url: session.url, orderId: order.id, sessionId: session.id, total };
}

/** Check a chat-pay session; if paid, finalize the order + dispatch. Returns true if paid. */
export async function checkAndFinalize(lead) {
  if (!lead.stripe_session_id || !config.stripeKey) return false;
  let session;
  try {
    session = await stripe.checkout.sessions.retrieve(lead.stripe_session_id);
  } catch (err) {
    console.warn("[checkout] retrieve session:", err.message);
    return false;
  }
  if (session.payment_status !== "paid" && session.status !== "complete") return false;

  const client = supa();
  const order = await client.from("orders").select("*").eq("id", lead.order_id).maybeSingle();
  if (order.data && order.data.status !== "paid") {
    await client.from("orders").update({ status: "paid", paid_at: new Date().toISOString() }).eq("id", lead.order_id);
    await client.from("transactions").upsert(
      { source: "tag", stripe_id: session.payment_intent || session.id, amount_cents: session.amount_total ?? Math.round(totalFor(lead) * 100), status: "paid", user_id: order.data.user_id, order_id: lead.order_id },
      { onConflict: "stripe_id", ignoreDuplicates: true },
    );
  }
  await dispatch(lead.order_id);
  await client.from("comms_leads").update({ status: "dispatched" }).eq("id", lead.id);
  return true;
}

/** Site-pay: find a paid order matching this lead's name that isn't linked yet. */
export async function matchSitePayment(lead) {
  if (!lead.first_name || !lead.last_name) return null;
  const { data } = await supa()
    .from("orders")
    .select("*")
    .eq("status", "paid")
    .is("comms_handle", null)
    .ilike("first_name", lead.first_name)
    .ilike("last_name", lead.last_name)
    .gte("created_at", lead.created_at)
    .order("created_at", { ascending: false })
    .limit(1);
  const order = (data || [])[0];
  if (!order) return null;
  await supa().from("orders").update({ comms_handle: lead.handle }).eq("id", order.id);
  await supa().from("comms_leads").update({ order_id: order.id, status: "dispatched" }).eq("id", lead.id);
  return order;
}

async function dispatch(orderId) {
  if (!config.dispatchBotUrl) {
    console.warn("[checkout] DISPATCH_BOT_URL not set — order not dispatched");
    return;
  }
  try {
    await fetch(`${config.dispatchBotUrl}/leads`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-dispatch-secret": config.dispatchSharedSecret },
      body: JSON.stringify({ orderId }),
    });
  } catch (err) {
    console.warn("[checkout] dispatch push failed:", err.message);
  }
}
