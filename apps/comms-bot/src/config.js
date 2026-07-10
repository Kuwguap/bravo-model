import "dotenv/config";

export const config = {
  port: Number(process.env.PORT || 8100),

  // Facebook Messenger (Meta). The PRIMARY page is wired here in env; every
  // additional page (and the primary, for visibility) is managed on the central
  // dashboard as a comms_accounts row. verifyToken/appSecret act as the shared
  // fallback when an account doesn't override them.
  fb: {
    pageAccessToken: process.env.FB_PAGE_ACCESS_TOKEN || "",
    pageId: process.env.FB_PAGE_ID || "", // optional; else resolved from the token via Graph /me
    pageName: process.env.FB_PAGE_NAME || "",
    verifyToken: process.env.FB_VERIFY_TOKEN || "nj-comms-verify",
    appSecret: process.env.FB_APP_SECRET || "",
    graphVersion: process.env.FB_GRAPH_VERSION || "v21.0",
  },

  openaiKey: process.env.OPENAI_API_KEY || "",
  openaiModel: process.env.OPENAI_MODEL || "gpt-4o-mini",

  stripeKey: process.env.STRIPE_SECRET_KEY || "",
  tagPrice: Number(process.env.TAG_PRICE || 150),
  insurancePrice: Number(process.env.INSURANCE_OPT_IN_PRICE || 100),
  appUrl: (process.env.APP_URL || "https://njtemporarytag.com").replace(/\/$/, ""),

  // Hand finished/paid leads to the dispatch bot.
  dispatchBotUrl: (process.env.DISPATCH_BOT_URL || "").replace(/\/$/, ""),
  dispatchSharedSecret: process.env.DISPATCH_SHARED_SECRET || "",

  // Sweeps (minutes)
  followupMinutes: Number(process.env.COMMS_FOLLOWUP_MINUTES || 60),
  maxFollowups: Number(process.env.COMMS_MAX_FOLLOWUPS || 2),
};

export function assertConfig() {
  const missing = [];
  if (!config.fb.pageAccessToken) missing.push("FB_PAGE_ACCESS_TOKEN");
  if (!config.openaiKey) missing.push("OPENAI_API_KEY");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) console.warn(`[comms] missing env: ${missing.join(", ")} — some features disabled.`);
}
