import "dotenv/config";

export const config = {
  botToken: process.env.TELEGRAM_BOT_TOKEN || "",
  // On Render, RENDER_EXTERNAL_URL is injected automatically, so the bot
  // self-registers its Telegram webhook without a manual DISPATCH_PUBLIC_URL.
  publicUrl: (process.env.DISPATCH_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "").replace(/\/$/, ""),
  sharedSecret: process.env.DISPATCH_SHARED_SECRET || "",
  port: Number(process.env.PORT || 8080),
  fallbackTimeoutMs: Number(process.env.FALLBACK_CLAIM_TIMEOUT_MS || 300000),
  appUrl: (process.env.APP_URL || "http://localhost:5173").replace(/\/$/, ""),
  // Insurance auto-provisioning (when a customer opts into the $100 coverage).
  insuranceSiteUrl: (process.env.INSURANCE_SITE_URL || "https://njportal.us").replace(/\/$/, ""),
  integrationsApiKey: process.env.INTEGRATIONS_API_KEY || "",
  insuranceOptInPrice: Number(process.env.INSURANCE_OPT_IN_PRICE || 100),
};

export const tg = {
  api: (method) => `https://api.telegram.org/bot${config.botToken}/${method}`,
  file: (filePath) => `https://api.telegram.org/file/bot${config.botToken}/${filePath}`,
};

export function assertConfig() {
  const missing = [];
  if (!config.botToken) missing.push("TELEGRAM_BOT_TOKEN");
  if (!process.env.SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (missing.length) {
    console.warn(`[config] missing env: ${missing.join(", ")} — some features will be disabled.`);
  }
}
