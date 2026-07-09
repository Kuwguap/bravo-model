export interface DeliveryTier {
  label: string;
  surcharge?: number;
  fee?: number;
}
export interface DeliveryOption {
  label: string;
  surcharge: number;
  eta: string;
  tiers?: Record<string, DeliveryTier>;
  uberZones?: Record<string, DeliveryTier>;
}
export interface PublicConfig {
  currencySymbol: string;
  tagPrice: number;
  insuranceOptInPrice: number;
  renewalPeriodDays: number;
  delivery?: Record<string, DeliveryOption>;
}

export interface TagFormData {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  state: string;
  address?: string;
  address2?: string;
  city?: string;
  zip?: string;
  vin?: string;
  year?: string;
  make?: string;
  model?: string;
  color?: string;
  body?: string;
  insuranceOptIn: boolean;
  insuranceCompany?: string;
  insurancePolicy?: string;
  driverLicense?: string;
  notes?: string;
  deliveryMethod?: string;
  deliveryOption?: string;
  deliveryEmail?: string;
  deliveryAddress?: string;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...init,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || `Request failed (${res.status})`);
  return data as T;
}

export function getConfig() {
  return req<PublicConfig>("/api/config");
}

export function createCheckoutSession(form: TagFormData) {
  return req<{ url: string; orderId: string }>("/api/checkout/create-session", {
    method: "POST",
    body: JSON.stringify(form),
  });
}

export interface VerifyResult {
  status: "pending" | "paid" | "failed";
  state?: string;
  plate?: string | null;
  email?: string;
  insuranceOptIn?: boolean;
}

export function verifySession(sessionId: string) {
  return req<VerifyResult>(`/api/checkout/verify?session_id=${encodeURIComponent(sessionId)}`);
}

export interface VinDecode {
  year?: string;
  make?: string;
  model?: string;
  body?: string;
}

export function decodeVin(vin: string) {
  return req<VinDecode>(`/api/vin/decode?vin=${encodeURIComponent(vin)}`);
}

/** Log a page visit and return the running total (best-effort). */
export function logVisit() {
  let vid = "";
  try {
    vid = localStorage.getItem("njtt_vid") || "";
    if (!vid) {
      vid = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem("njtt_vid", vid);
    }
  } catch {
    /* ignore */
  }
  return req<{ visits: number }>("/api/visit", {
    method: "POST",
    body: JSON.stringify({ path: typeof location !== "undefined" ? location.pathname : "/", visitorId: vid }),
  });
}

export interface SandboxResult {
  ok: boolean;
  orderId: string;
  plate?: string | null;
  dispatched?: number;
  supervisors?: number;
  dispatchError?: string;
  emailSent?: boolean;
  emailError?: string;
}

/** Sandbox: run the whole flow with no payment (for /qwertyuiop). */
export function simulateSandbox(form: TagFormData) {
  return req<SandboxResult>("/api/test/simulate", {
    method: "POST",
    body: JSON.stringify({ ...form, deliveryEmail: form.deliveryEmail || form.email }),
  });
}
