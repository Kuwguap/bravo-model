/**
 * Conversation engine. One OpenAI call per client message does two jobs at
 * once: pull any tag details out of what they said, and write the next single
 * message back — in a voice that reads like a real person texting, not a bot
 * or a form. See PERSONA for the anti-"this was written by AI" rules.
 */

import { config } from "./config.js";
import { missingRequired } from "./sheet.js";

const PERSONA = `You're Mia. You handle the front desk for a New Jersey temp-tag service, texting someone who DM'd the Facebook page off an ad. Job: get them a 30-day NJ temp tag and gather what's needed as you go. It has to read like a real person texting — a detector should never flag it as AI.

How you text (this is the whole game — do NOT sound like a bot or a script):
- Real texting. Lowercase is normal. Contractions always. Sometimes a fragment, sometimes a run-on. Let the length jump around — a 3-word reply, then a 20-word one. That unevenness is the point.
- DON'T open every message with "Perfect!" / "Awesome!" / "Great!" / "Got it!" / "Thanks!". That's the #1 AI tell. Most of the time just... say the thing or ask the next thing. No cheerleading.
- Barely any exclamation points. No emoji unless it's genuinely natural.
- One thing per message. Never a list, never numbered steps, never "I'll need the following".
- React to the actual thing they said before moving on, in your own words — be specific, not generic filler.
- Never greet twice. Never re-ask what they gave you. Don't front-load everything you need.
- Under ~25 words. Shorter is usually better.

Feel: like this — "what's the vin? that pulls up most of the car for me" / "gotcha, and what city's it registered in" / "cool so no insurance — the $100 add-on covers you, want that?" / "one number to reach you at?"`;

const ORDER_HINT = `Collect only what's still missing, roughly: phone, then email, then the vehicle (the VIN fills in year/make/model — also get color), then where it's registered (street, city, state, zip). Insurance: ONLY record insurance_company + insurance_policy if they name a real insurer they already carry. If they have no insurance or want coverage, set insurance_opt_in true and leave insurance_company/policy empty (never invent one). Also notice if they say they'll pay on the website vs. want to pay right here.

Never quote a dollar figure yourself — if they ask the price or it's time to pay, just say you'll send the total/link over. The exact amount and link get added automatically after your message, so don't make up a number.`;

function knownSummary(lead) {
  const parts = [];
  const add = (label, v) => v && parts.push(`${label}: ${v}`);
  add("name", [lead.first_name, lead.last_name].filter(Boolean).join(" "));
  add("phone", lead.phone);
  add("email", lead.email);
  add("state", lead.state);
  add("city", lead.city);
  add("zip", lead.zip);
  add("address", lead.address);
  add("vin", lead.vin);
  add("vehicle", [lead.year, lead.make, lead.model].filter(Boolean).join(" "));
  add("color", lead.color);
  add("insurance", lead.insurance_company);
  return parts.length ? parts.join("; ") : "nothing yet";
}

/**
 * @returns {Promise<{extracted:object, insurance_opt_in:boolean, pay_method:string|null, reply:string}>}
 */
export async function converse(lead, clientMessage) {
  const missing = missingRequired(lead);
  const sys = [
    PERSONA,
    "",
    ORDER_HINT,
    "",
    `What you already have — do NOT ask for these again: ${knownSummary(lead)}.`,
    `Still needed: ${missing.length ? missing.join(", ") : "nothing — you can wrap up and talk payment"}.`,
    "",
    'Reply with ONLY a JSON object: {"extracted": {any of: first_name,last_name,email,phone,state,address,address2,city,zip,vin,year,make,model,color,body,driver_license,insurance_company,insurance_policy,notes}, "insurance_opt_in": true|false, "pay_method": "site"|"chat"|null, "reply": "<your single next human message>"}. Put a field in "extracted" only if the client just gave it. Use the 2-letter state code. "pay_method" is "chat" if they want to pay here / want a link, "site" if they say they\'ll pay on the website, else null.',
  ].join("\n");

  const history = (Array.isArray(lead.transcript) ? lead.transcript : []).slice(-8).map((m) => ({
    role: m.role === "client" ? "user" : "assistant",
    content: m.text,
  }));

  const fallback = () => ({ extracted: {}, insurance_opt_in: false, pay_method: null, reply: nextQuestionFallback(lead) });
  if (!config.openaiKey) return fallback();

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${config.openaiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: config.openaiModel,
        temperature: 0.95,
        presence_penalty: 0.4,
        frequency_penalty: 0.5,
        response_format: { type: "json_object" },
        messages: [{ role: "system", content: sys }, ...history, { role: "user", content: String(clientMessage || "") }],
      }),
      signal: AbortSignal.timeout(25000),
    });
    if (!res.ok) return fallback();
    const json = await res.json();
    const parsed = JSON.parse(json.choices?.[0]?.message?.content || "{}");
    return {
      extracted: cleanExtracted(parsed.extracted),
      insurance_opt_in: parsed.insurance_opt_in === true,
      pay_method: parsed.pay_method === "site" || parsed.pay_method === "chat" ? parsed.pay_method : null,
      reply: (parsed.reply && String(parsed.reply).trim()) || nextQuestionFallback(lead),
    };
  } catch (err) {
    console.warn("[conversation] openai failed:", err.message);
    return fallback();
  }
}

function cleanExtracted(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const [k, v] of Object.entries(obj)) {
    if (v == null) continue;
    let s = String(v).trim();
    if (!s) continue;
    if (k === "vin") s = s.replace(/\s+/g, "").toUpperCase();
    if (k === "state") s = s.toUpperCase().slice(0, 2);
    if (k === "year") s = s.replace(/\D/g, "").slice(0, 4);
    out[k] = s;
  }
  return out;
}

// Hand-written, varied fallbacks (used when OpenAI is unavailable) so even the
// degraded path doesn't sound robotic or repeat one phrasing.
const ASKS = {
  phone: ["What's a good phone number for you?", "Can I grab your number real quick?", "Best number to reach you at?"],
  email: ["And your email?", "What email should I send it to?", "Drop your email and I'll send it there."],
  first_name: ["First off — what's your name?", "Who am I chatting with? First name's fine.", "What's your name?"],
  last_name: ["And your last name?", "Last name too?", "What's the last name?"],
  state: ["What state's the car registered in?", "Which state are you in?", "What state is this for?"],
  vin: ["What's the VIN? That fills in most of the car details.", "Can you send the VIN?", "Got the VIN handy?"],
  city: ["What city?", "Which city is it registered in?", "City?"],
  zip: ["And the zip?", "What's the zip code?", "Zip?"],
  address: ["What's the street address?", "Street address it's registered to?", "Where's it registered — street address?"],
  year: ["What year is the car?", "Year on it?"],
  make: ["What's the make?", "Make of the car?"],
  model: ["And the model?", "What model?"],
  color: ["What color is it?", "Color?"],
};
function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
function nextQuestionFallback(lead) {
  const missing = missingRequired(lead);
  if (!missing.length) return "Alright, I've got everything — want to pay on our site or should I send you a payment link right here?";
  const key = missing[0];
  return (ASKS[key] && pick(ASKS[key])) || "What else can you tell me?";
}
