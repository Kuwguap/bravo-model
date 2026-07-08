/**
 * Insurance auto-provisioning. When a customer opts into the $100 coverage,
 * create a NJ Coverage account on the insurance site (via its integrations
 * API), assign a policy, and return login details so we can email them.
 */

import crypto from "node:crypto";
import { config } from "./config.js";
import { updateOrder } from "./db.js";

/** Strong 12-char alphanumeric password (unambiguous chars). */
export function strongPassword(len = 12) {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += chars[bytes[i] % chars.length];
  // guarantee at least one letter + one digit
  if (!/[0-9]/.test(out)) out = out.slice(0, -1) + "7";
  if (!/[A-Za-z]/.test(out)) out = "K" + out.slice(1);
  return out;
}

/** Unique alternating letter/digit policy number, e.g. NJC-4A9B2C7D. */
function policyNumber() {
  const L = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const D = "23456789";
  const b = crypto.randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += i % 2 === 0 ? D[b[i] % D.length] : L[b[i] % L.length];
  return `NJC-${s}`;
}

const iso = (d) => d.toISOString().slice(0, 10);

/**
 * @param {object} order  paid order row (insurance_opt_in = true)
 * @param {Uint8Array|Buffer} [insuranceBytes]  the generated insurance card PDF
 * @returns {Promise<{ok:boolean, email?:string, password?:string, policyNumber?:string, loginUrl?:string, error?:string}>}
 */
export async function provisionInsurance(order, insuranceBytes) {
  if (!config.integrationsApiKey) return { ok: false, error: "INTEGRATIONS_API_KEY not set" };
  const email = order.delivery_email || order.email;
  if (!email) return { ok: false, error: "no customer email" };

  const password = strongPassword(12);
  const policy = policyNumber();
  const now = new Date();
  const exp = new Date(now.getTime() + 30 * 86400000);

  const payload = {
    email,
    password,
    name: `${order.first_name || ""} ${order.last_name || ""}`.trim() || "Policyholder",
    phone: String(order.phone || "0000000").replace(/[^\d+]/g, "").padEnd(7, "0"),
    vehicleName: [order.year, order.make, order.model].filter(Boolean).join(" ") || "Vehicle",
    vin: String(order.vin || "").padEnd(11, "0").slice(0, 20),
    modelYear: String(order.year || ""),
    vehicleMake: order.make || "",
    vehicleModel: order.model || "",
    policyNumber: policy,
    policyEffectiveDate: iso(now),
    policyExpirationDate: iso(exp),
    policyAddress: [order.address, order.city, order.state, order.zip].filter(Boolean).join(", "),
    annualPremium: config.insuranceOptInPrice,
    liability: true,
    collision: true,
    comprehensive: true,
    skipWelcomeEmail: true, // we send our own with the login details
    insuranceCardPdfBase64: insuranceBytes ? Buffer.from(insuranceBytes).toString("base64") : undefined,
    insuranceCardFilename: `insurance-card-${policy}.pdf`,
  };

  try {
    const res = await fetch(`${config.insuranceSiteUrl}/api/integrations/clients`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.integrationsApiKey}`,
      },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data.ok) return { ok: false, error: data.error || `HTTP ${res.status}` };

    await updateOrder(order.id, {
      insurance_provisioned: true,
      insurance_login_email: email,
      insurance_login_password: password,
      insurance_assigned_policy: policy,
    });
    return { ok: true, email, password, policyNumber: policy, loginUrl: `${config.insuranceSiteUrl}/login` };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}
