/**
 * The "sheet" — one live comms_leads row per client, updated the instant any
 * detail arrives. Backed by Supabase so staff can watch it in the control
 * panel in real time.
 */

import { getServiceClient } from "@speedy/shared/supabase";

export const supa = () => getServiceClient();

// Fields the conversation collects (also the columns we merge into the sheet).
export const LEAD_FIELDS = [
  "first_name", "last_name", "email", "phone", "state",
  "address", "address2", "city", "zip",
  "vin", "year", "make", "model", "color", "body",
  "driver_license", "insurance_company", "insurance_policy", "notes",
];

/** Everything we need before a tag can be made. */
export const REQUIRED_FIELDS = [
  "first_name", "last_name", "phone", "email", "state",
  "address", "city", "zip", "vin", "year", "make", "model", "color",
];

function randomHandle(firstName) {
  const base = String(firstName || "GUEST").replace(/[^a-z]/gi, "").toUpperCase().slice(0, 10) || "GUEST";
  return `${base}${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function getOrCreateLead(psid) {
  const client = supa();
  const { data: existing } = await client.from("comms_leads").select("*").eq("fb_psid", String(psid)).maybeSingle();
  if (existing) return existing;
  const { data, error } = await client
    .from("comms_leads")
    .insert({ fb_psid: String(psid), handle: randomHandle(), transcript: [] })
    .select("*")
    .single();
  if (error) throw new Error(`[sheet] create: ${error.message}`);
  return data;
}

export async function getLead(id) {
  const { data } = await supa().from("comms_leads").select("*").eq("id", id).maybeSingle();
  return data || null;
}

/** Merge newly-extracted fields into the sheet immediately. Regenerates the
 * handle from the real name the first time we learn it. */
export async function mergeFields(lead, extracted) {
  const patch = {};
  const optIn = extracted?.insurance_opt_in === true || lead.insurance_opt_in === true;
  for (const key of LEAD_FIELDS) {
    // When they're taking OUR coverage, never store a client/AI-supplied insurer
    // or policy — the card uses National Specialty + our ABP number.
    if (optIn && (key === "insurance_company" || key === "insurance_policy")) continue;
    const v = extracted?.[key];
    if (v != null && String(v).trim() && !lead[key]) patch[key] = String(v).trim();
  }
  if (extracted?.insurance_opt_in === true && !lead.insurance_opt_in) patch.insurance_opt_in = true;

  // Give the sheet a real handle once we know the name.
  if (!handleLooksNamed(lead.handle) && (patch.first_name || lead.first_name)) {
    patch.handle = randomHandle(patch.first_name || lead.first_name);
  }
  if (Object.keys(patch).length === 0) return lead;
  const { data, error } = await supa().from("comms_leads").update(patch).eq("id", lead.id).select("*").single();
  if (error) throw new Error(`[sheet] merge: ${error.message}`);
  return data;
}

function handleLooksNamed(handle) {
  return handle && !handle.startsWith("GUEST");
}

export async function updateLead(id, patch) {
  const { data, error } = await supa().from("comms_leads").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`[sheet] update ${id}: ${error.message}`);
  return data;
}

/** Append to the rolling transcript (kept short for the OpenAI context). */
export async function appendTranscript(lead, role, text) {
  const t = Array.isArray(lead.transcript) ? lead.transcript.slice(-11) : [];
  t.push({ role, text: String(text).slice(0, 500) });
  const stamp = role === "client" ? { last_client_message_at: new Date().toISOString() } : { last_bot_message_at: new Date().toISOString() };
  return updateLead(lead.id, { transcript: t, ...stamp });
}

export function missingRequired(lead) {
  return REQUIRED_FIELDS.filter((f) => !lead[f] || !String(lead[f]).trim());
}

/** Enough to make + dispatch a tag? (driver license required only for non-NJ opt-in). */
export function isComplete(lead) {
  if (missingRequired(lead).length) return false;
  if (lead.insurance_opt_in && String(lead.state).toUpperCase() !== "NJ" && !lead.driver_license) return false;
  return true;
}
