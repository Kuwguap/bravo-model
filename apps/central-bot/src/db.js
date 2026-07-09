/** Supabase data access for the central dashboard (service role). */

import { getServiceClient, signedUrl, BUCKETS } from "@speedy/shared/supabase";

export const supa = () => getServiceClient();

// ─── Overview metrics ────────────────────────────────────────────────────────
export async function overview() {
  const client = supa();
  const [txns, users, deliveries, dueRenewals, insCustomers, activePolicies] = await Promise.all([
    client.from("transactions").select("source, amount_cents, status"),
    client.from("users").select("id", { count: "exact", head: true }),
    client.from("deliveries").select("status"),
    client
      .from("orders")
      .select("id", { count: "exact", head: true })
      .eq("status", "paid")
      .lte("renewal_due_at", new Date().toISOString())
      .is("renewal_reminded_at", null),
    // Insurance side of the shared DB — surfaced so the dashboard is unified.
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("policies").select("id", { count: "exact", head: true }).eq("status", "active"),
  ]);

  const rows = txns.data || [];
  const paid = rows.filter((r) => r.status === "paid");
  const sum = (arr) => arr.reduce((n, r) => n + (r.amount_cents || 0), 0);
  const bySource = (s) => paid.filter((r) => r.source === s);

  const dels = deliveries.data || [];
  return {
    revenueCents: sum(paid),
    txnCount: paid.length,
    tagRevenueCents: sum(bySource("tag")),
    tagCount: bySource("tag").length,
    insRevenueCents: sum(bySource("insurance")),
    insCount: bySource("insurance").length,
    userCount: users.count || 0,
    insCustomers: insCustomers.count || 0,
    activePolicies: activePolicies.count || 0,
    deliveriesOpen: dels.filter((d) => d.status === "accepted").length,
    deliveriesDone: dels.filter((d) => d.status === "delivered").length,
    renewalsDue: dueRenewals.count || 0,
  };
}

export async function listTransactions(limit = 100) {
  const { data } = await supa()
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Drivers CRUD ────────────────────────────────────────────────────────────
export async function listDrivers() {
  const { data } = await supa().from("drivers").select("*").order("created_at", { ascending: true });
  return data || [];
}
export async function addDriver({ name, email, telegram_id }) {
  const { error } = await supa().from("drivers").insert({ name, email, telegram_id: String(telegram_id), active: true });
  if (error) throw new Error(error.message);
}
export async function setDriverActive(id, active) {
  await supa().from("drivers").update({ active }).eq("id", id);
}
export async function deleteDriver(id) {
  await supa().from("drivers").delete().eq("id", id);
}

// ─── Supervisors CRUD ────────────────────────────────────────────────────────
export async function listSupervisors() {
  const { data } = await supa().from("supervisors").select("*").order("created_at", { ascending: true });
  return data || [];
}
export async function addSupervisor({ name, telegram_id }) {
  const { error } = await supa().from("supervisors").insert({ name, telegram_id: String(telegram_id), active: true });
  if (error) throw new Error(error.message);
}
export async function setSupervisorActive(id, active) {
  await supa().from("supervisors").update({ active }).eq("id", id);
}
export async function deleteSupervisor(id) {
  await supa().from("supervisors").delete().eq("id", id);
}

// ─── Deliveries (+ receipt links, driver names) ──────────────────────────────
export async function listDeliveries(limit = 100) {
  const { data } = await supa()
    .from("deliveries")
    .select("*, drivers(name), orders(reference_code, plate, first_name, last_name, state)")
    .order("assigned_at", { ascending: false })
    .limit(limit);
  const rows = data || [];
  for (const r of rows) {
    if (r.receipt_path) {
      try {
        r.receipt_url = await signedUrl(supa(), BUCKETS.receipts, r.receipt_path, 3600);
      } catch {
        r.receipt_url = null;
      }
    }
  }
  return rows;
}

// ─── Plate / doc-number settings ─────────────────────────────────────────────
export async function getSettings() {
  const { data } = await supa().from("settings").select("*").eq("id", 1).single();
  return data || {};
}
export async function updateSettings(patch) {
  const clean = {};
  for (const [k, v] of Object.entries(patch)) {
    if (v !== undefined && v !== null && v !== "") clean[k] = v;
  }
  clean.updated_at = new Date().toISOString();
  const { error } = await supa().from("settings").update(clean).eq("id", 1);
  if (error) throw new Error(error.message);
}
/** Bump every start counter by a random 100–300 (makes the next numbers jump). */
export async function randomizeStarts() {
  const s = await getSettings();
  const bump = () => Math.floor(Math.random() * 201 + 100);
  await updateSettings({
    nj_plate_next_number: Number(s.nj_plate_next_number || 0) + bump(),
    non_nj_plate_next_number: Number(s.non_nj_plate_next_number || 0) + bump(),
    nj_car_next_number: Number(s.nj_car_next_number || 0) + bump(),
    non_nj_car_next_number: Number(s.non_nj_car_next_number || 0) + bump(),
  });
}

// ─── Analytics ───────────────────────────────────────────────────────────────
export async function analytics() {
  const client = supa();
  const [orders, users, profiles, policies, visits, uniqueVisitors, appeals] = await Promise.all([
    client.from("orders").select("status, price, delivery_method, insurance_opt_in, insurance_provisioned, paid_at"),
    client.from("users").select("id", { count: "exact", head: true }),
    client.from("profiles").select("id", { count: "exact", head: true }),
    client.from("policies").select("id", { count: "exact", head: true }).eq("status", "active"),
    client.from("visits").select("id", { count: "exact", head: true }),
    client.from("visits").select("visitor_id").not("visitor_id", "is", null).limit(50000),
    client.from("appeals").select("status"),
  ]);
  const all = orders.data || [];
  const paid = all.filter((o) => o.status === "paid");
  const now = Date.now();
  const byMethod = {};
  for (const o of paid) {
    const k = o.delivery_method || "email";
    byMethod[k] = (byMethod[k] || 0) + 1;
  }
  const rev = (arr) => arr.reduce((n, o) => n + Number(o.price || 0), 0);
  const last7 = paid.filter((o) => o.paid_at && now - new Date(o.paid_at).getTime() < 7 * 86400000);
  return {
    liveClients: (users.count || 0) + (profiles.count || 0),
    tagCustomers: users.count || 0,
    insuranceCustomers: profiles.count || 0,
    activePolicies: policies.count || 0,
    ordersTotal: all.length,
    ordersPaid: paid.length,
    ordersPending: all.filter((o) => o.status === "pending").length,
    revenue: rev(paid),
    avgOrder: paid.length ? rev(paid) / paid.length : 0,
    byMethod,
    insuranceOptIns: paid.filter((o) => o.insurance_opt_in).length,
    insuranceProvisioned: paid.filter((o) => o.insurance_provisioned).length,
    last7Count: last7.length,
    last7Revenue: rev(last7),
    visits: visits.count || 0,
    uniqueVisitors: new Set((uniqueVisitors.data || []).map((r) => r.visitor_id)).size,
    appealsPending: (appeals.data || []).filter((a) => a.status === "submitted" || a.status === "reviewing").length,
    appealsTotal: (appeals.data || []).length,
  };
}

export async function listOrders(limit = 60) {
  const { data } = await supa()
    .from("orders")
    .select("id, first_name, last_name, email, state, plate, status, price, delivery_method, insurance_opt_in, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  return data || [];
}

/** Delete an order and its dependent rows (deliveries have a restrict FK). */
export async function deleteOrder(id) {
  const c = supa();
  await c.from("deliveries").delete().eq("order_id", id);
  await c.from("transactions").delete().eq("order_id", id);
  const { error } = await c.from("orders").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// ─── Insurance (auto-provisioned accounts) ───────────────────────────────────
export async function listInsurance(limit = 100) {
  const { data } = await supa()
    .from("orders")
    .select(
      "id, first_name, last_name, email, delivery_email, plate, paid_at, insurance_opt_in, insurance_provisioned, insurance_login_email, insurance_login_password, insurance_assigned_policy",
    )
    .eq("insurance_opt_in", true)
    .order("paid_at", { ascending: false })
    .limit(limit);
  return data || [];
}

// ─── Appeals (driver-filed, supervisor-reviewed) ─────────────────────────────
export async function listAppeals(limit = 100) {
  const { data, error } = await supa()
    .from("appeals")
    .select("*, drivers(name), supervisors(name), orders(reference_code, plate)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return [];
  const rows = data || [];
  for (const r of rows) {
    if (r.image_path) {
      try {
        r.image_url = await signedUrl(supa(), BUCKETS.receipts, r.image_path, 3600);
      } catch {
        r.image_url = null;
      }
    }
  }
  return rows;
}

// ─── Renewals ────────────────────────────────────────────────────────────────
export async function upcomingRenewals(limit = 100) {
  const { data } = await supa()
    .from("orders")
    .select("id, first_name, last_name, email, plate, paid_at, renewal_due_at, renewal_reminded_at, renewal_count")
    .eq("status", "paid")
    .not("renewal_due_at", "is", null)
    .order("renewal_due_at", { ascending: true })
    .limit(limit);
  return data || [];
}
