/**
 * Self-contained Supabase service client for the tag-site serverless functions.
 * Vendored (instead of importing @speedy/shared) so this app deploys to Vercel
 * standalone without the pnpm workspace. Mirrors packages/shared/supabase.js.
 */

import { createClient } from "@supabase/supabase-js";

let _service = null;

function required(name) {
  const v = process.env[name];
  if (!v) throw new Error(`[supabase] missing env ${name}`);
  return cleanEnv(v);
}

/**
 * Strip a stray UTF-8 BOM (U+FEFF) and surrounding whitespace so the value is
 * safe to use in an HTTP header — a leading BOM throws "Cannot convert argument
 * to a ByteString". Defensive, even though env is set clean.
 */
export function cleanEnv(v) {
  let s = String(v == null ? "" : v);
  if (s.charCodeAt(0) === 0xfeff) s = s.slice(1);
  return s.trim();
}

export function getServiceClient() {
  if (_service) return _service;
  _service = createClient(
    required("SUPABASE_URL"),
    required("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  return _service;
}
