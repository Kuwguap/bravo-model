/**
 * GET  /api/visit           → { visits } total count
 * POST /api/visit { path, visitorId } → logs a visit, returns { visits }
 * Tolerant of the visits table not existing yet (returns 0).
 */

import { supa, json } from "./_lib/core.js";

async function readJson(req) {
  if (req.body && typeof req.body === "object") return req.body;
  const chunks = [];
  for await (const c of req) chunks.push(typeof c === "string" ? Buffer.from(c) : c);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

export default async function handler(req, res) {
  const client = supa();
  try {
    if (req.method === "POST") {
      const b = await readJson(req);
      await client.from("visits").insert({
        site: "tag",
        path: (b.path || "/").slice(0, 300),
        visitor_id: b.visitorId ? String(b.visitorId).slice(0, 60) : null,
      });
    }
    const { count, error } = await client.from("visits").select("*", { count: "exact", head: true });
    if (error) return json(res, 200, { visits: 0 });
    return json(res, 200, { visits: count || 0 });
  } catch {
    return json(res, 200, { visits: 0 });
  }
}
