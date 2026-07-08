/**
 * POST /api/test/simulate  (sandbox, no payment)
 * Creates a paid TEST order and runs the real dispatch pipeline, so the whole
 * flow — order → PDF → supervisors → drivers → emails — can be exercised
 * without Stripe. Backs the /qwertyuiop page.
 */

import { supa, totalFor, deliverySurcharge, json } from "../_lib/core.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function pushToDispatch(orderId) {
  const base = (process.env.DISPATCH_BOT_URL || "").replace(/\/$/, "");
  if (!base) return { ok: false, error: "DISPATCH_BOT_URL not set" };
  try {
    const res = await fetch(`${base}/leads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-dispatch-secret": process.env.DISPATCH_SHARED_SECRET || "",
      },
      body: JSON.stringify({ orderId }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `dispatch ${res.status}` };
    return { ok: true, ...data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "method-not-allowed" });
  try {
    const b = await readJson(req);
    const email = String(b.email || "sandbox@example.com").trim().toLowerCase();
    const client = supa();

    const { data: user } = await client
      .from("users")
      .upsert(
        { email, first_name: b.firstName || "Sandbox", last_name: b.lastName || "Tester", phone: b.phone || null },
        { onConflict: "email" },
      )
      .select("id")
      .single();

    const insuranceOptIn = Boolean(b.insuranceOptIn);
    const deliveryMethod = b.deliveryMethod || "email";
    const deliveryOption = b.deliveryOption || null;
    const total = totalFor(insuranceOptIn, deliveryMethod, deliveryOption);
    const now = new Date().toISOString();

    const { data: order, error } = await client
      .from("orders")
      .insert({
        reference: `test_${Date.now().toString(36)}`,
        user_id: user?.id || null,
        status: "paid",
        paid_at: now,
        state: String(b.state || "NJ").toUpperCase(),
        first_name: b.firstName || "Sandbox",
        last_name: b.lastName || "Tester",
        email,
        phone: b.phone || null,
        address: b.address || null,
        address2: b.address2 || null,
        city: b.city || null,
        zip: b.zip || null,
        vin: b.vin || null,
        year: b.year || null,
        make: b.make || null,
        model: b.model || null,
        color: b.color || null,
        body: b.body || null,
        insurance_opt_in: insuranceOptIn,
        insurance_company: b.insuranceCompany || null,
        insurance_policy: b.insurancePolicy || null,
        notes: `[SANDBOX] ${b.notes || ""}`.trim(),
        delivery_method: deliveryMethod,
        delivery_option: deliveryOption,
        delivery_price: deliverySurcharge(deliveryMethod, deliveryOption),
        delivery_email: b.deliveryEmail || email,
        delivery_address: b.deliveryAddress || null,
        price: total,
      })
      .select("*")
      .single();
    if (error) return json(res, 500, { error: error.message });

    // Ledger entry, then run the real dispatch pipeline.
    await client.from("transactions").insert({
      source: "tag",
      stripe_id: `sandbox-${order.id}`,
      amount_cents: Math.round(total * 100),
      status: "paid",
      user_id: user?.id || null,
      order_id: order.id,
    });

    const dispatch = await pushToDispatch(order.id);

    // The bot allocates the plate during generation; re-read it.
    const { data: fresh } = await client.from("orders").select("plate").eq("id", order.id).single();

    return json(res, 200, {
      ok: true,
      orderId: order.id,
      plate: fresh?.plate || null,
      dispatched: dispatch.dispatched,
      supervisors: dispatch.supervisors,
      dispatchError: dispatch.ok ? undefined : dispatch.error,
      emailSent: dispatch.emailSent,
      emailError: dispatch.emailError,
    });
  } catch (err) {
    console.error("[simulate]", err);
    return json(res, 500, { error: err.message });
  }
}
