/**
 * GET /api/vin/decode?vin=...
 * Decodes a VIN via the free NHTSA vPIC API and returns year/make/model/body.
 * Proxied server-side so the browser doesn't depend on NHTSA CORS.
 */

import { json } from "../_lib/core.js";

function titleCase(s) {
  return String(s || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, "http://localhost");
    const vin = (url.searchParams.get("vin") || "").trim().toUpperCase();
    if (vin.length < 11) return json(res, 400, { error: "VIN too short" });

    const api = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${encodeURIComponent(vin)}?format=json`;
    const r = await fetch(api, { signal: AbortSignal.timeout(12000) });
    if (!r.ok) return json(res, 502, { error: `vPIC ${r.status}` });
    const data = await r.json();
    const row = data?.Results?.[0] || {};

    return json(res, 200, {
      year: row.ModelYear || "",
      make: titleCase(row.Make),
      model: titleCase(row.Model),
      body: row.BodyClass || "",
    });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
}
