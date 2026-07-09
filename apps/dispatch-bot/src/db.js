/**
 * Supabase data access for the dispatch bot. Uses the service-role client
 * (bypasses RLS). All the row-shape ↔ camelCase mapping lives here.
 */

import { getServiceClient, uploadBytes, signedUrl, BUCKETS } from "@speedy/shared/supabase";

export const supa = () => getServiceClient();

export async function getOrder(orderId) {
  const { data, error } = await supa().from("orders").select("*").eq("id", orderId).single();
  if (error) throw new Error(`[db] getOrder ${orderId}: ${error.message}`);
  return data;
}

export async function updateOrder(orderId, patch) {
  const { data, error } = await supa()
    .from("orders")
    .update(patch)
    .eq("id", orderId)
    .select("*")
    .single();
  if (error) throw new Error(`[db] updateOrder ${orderId}: ${error.message}`);
  return data;
}

export async function insertOrder(row) {
  const { data, error } = await supa().from("orders").insert(row).select("*").single();
  if (error) throw new Error(`[db] insertOrder: ${error.message}`);
  return data;
}

export async function activeDrivers() {
  const { data, error } = await supa()
    .from("drivers")
    .select("*")
    .eq("active", true)
    .order("created_at", { ascending: true });
  if (error) throw new Error(`[db] activeDrivers: ${error.message}`);
  return data || [];
}

export async function driverByTelegramId(tgId) {
  const { data } = await supa()
    .from("drivers")
    .select("*")
    .eq("telegram_id", String(tgId))
    .maybeSingle();
  return data || null;
}

export async function driverById(id) {
  const { data } = await supa().from("drivers").select("*").eq("id", id).maybeSingle();
  return data || null;
}

export async function activeSupervisors() {
  const { data, error } = await supa().from("supervisors").select("*").eq("active", true);
  if (error) throw new Error(`[db] activeSupervisors: ${error.message}`);
  return data || [];
}

export async function isKnownSupervisor(tgId) {
  const { data } = await supa()
    .from("supervisors")
    .select("id")
    .eq("telegram_id", String(tgId))
    .maybeSingle();
  return Boolean(data);
}

export async function supervisorByTelegramId(tgId) {
  const { data } = await supa()
    .from("supervisors")
    .select("*")
    .eq("telegram_id", String(tgId))
    .maybeSingle();
  return data || null;
}

export async function orderByReferenceCode(code) {
  const { data } = await supa()
    .from("orders")
    .select("*")
    .eq("reference_code", String(code).trim().toUpperCase())
    .maybeSingle();
  return data || null;
}

/**
 * Atomic first-to-accept-wins. Returns the updated order iff THIS driver won
 * (the row was still unclaimed); null if someone already accepted.
 */
export async function tryAcceptOrder(orderId, driver) {
  const { data, error } = await supa()
    .from("orders")
    .update({
      telegram_accepted_by: driver.telegram_id,
      telegram_accepted_driver_id: driver.id,
      telegram_accepted_at: new Date().toISOString(),
    })
    .eq("id", orderId)
    .is("telegram_accepted_by", null)
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] tryAcceptOrder ${orderId}: ${error.message}`);
  return data || null;
}

export async function createDelivery({ orderId, driverId, status = "accepted" }) {
  const now = new Date().toISOString();
  const row = {
    order_id: orderId,
    driver_id: driverId,
    status,
    accepted_at: status === "accepted" ? now : null,
  };
  const { data, error } = await supa().from("deliveries").insert(row).select("*").single();
  if (error) throw new Error(`[db] createDelivery: ${error.message}`);
  return data;
}

export async function markDelivered(deliveryId, receiptPath) {
  const { error } = await supa()
    .from("deliveries")
    .update({ status: "delivered", delivered_at: new Date().toISOString(), receipt_path: receiptPath })
    .eq("id", deliveryId);
  if (error) throw new Error(`[db] markDelivered ${deliveryId}: ${error.message}`);
}

export async function latestDeliveryForDriver(driverId) {
  const { data } = await supa()
    .from("deliveries")
    .select("*")
    .eq("driver_id", driverId)
    .eq("status", "accepted")
    .order("accepted_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data || null;
}

export async function driverDeliveries(driverId, limit = 10) {
  const { data, error } = await supa()
    .from("deliveries")
    .select("*, orders(reference_code, plate, first_name, last_name, state)")
    .eq("driver_id", driverId)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[db] driverDeliveries: ${error.message}`);
  return data || [];
}

export async function pendingReceiptDeliveries(driverId, limit = 10) {
  const { data, error } = await supa()
    .from("deliveries")
    .select("*, orders(reference_code, plate, driver_pay_amount)")
    .eq("driver_id", driverId)
    .is("receipt_amount_true", null)
    .order("assigned_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`[db] pendingReceiptDeliveries: ${error.message}`);
  return data || [];
}

export async function deliveryById(id) {
  const { data } = await supa()
    .from("deliveries")
    .select("*, orders(reference_code, plate, driver_pay_amount)")
    .eq("id", id)
    .maybeSingle();
  return data || null;
}

export async function updateDelivery(id, patch) {
  const { data, error } = await supa().from("deliveries").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`[db] updateDelivery ${id}: ${error.message}`);
  return data;
}

export async function getSettingsRow() {
  const { data } = await supa().from("settings").select("*").eq("id", 1).single();
  return data || {};
}

// ─── Appeals ─────────────────────────────────────────────────────────────────
export async function createAppeal({ orderId, driverId, imagePath, description }) {
  const { data, error } = await supa()
    .from("appeals")
    .insert({ order_id: orderId, driver_id: driverId, image_path: imagePath || null, description: description || null })
    .select("*")
    .single();
  if (error) throw new Error(`[db] createAppeal: ${error.message}`);
  return data;
}

export async function getAppeal(id) {
  const { data } = await supa().from("appeals").select("*").eq("id", id).maybeSingle();
  return data || null;
}

export async function updateAppeal(id, patch) {
  const { data, error } = await supa().from("appeals").update(patch).eq("id", id).select("*").single();
  if (error) throw new Error(`[db] updateAppeal ${id}: ${error.message}`);
  return data;
}

/** Atomic first-review-wins: only succeeds while the appeal is still 'submitted'. */
export async function tryClaimAppealReview(appealId, supervisor) {
  const { data, error } = await supa()
    .from("appeals")
    .update({ status: "reviewing", reviewing_supervisor_id: supervisor.id })
    .eq("id", appealId)
    .eq("status", "submitted")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] tryClaimAppealReview ${appealId}: ${error.message}`);
  return data || null;
}

/** Atomic: only succeeds while the appeal is still 'submitted' (not claimed/decided). */
export async function tryDeclineAppeal(appealId) {
  const { data, error } = await supa()
    .from("appeals")
    .update({ status: "declined" })
    .eq("id", appealId)
    .eq("status", "submitted")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(`[db] tryDeclineAppeal ${appealId}: ${error.message}`);
  return data || null;
}

export async function storeAppealImage(appealId, name, bytes, contentType) {
  return uploadBytes(supa(), BUCKETS.receipts, `appeals/${appealId}/${name}`, bytes, contentType);
}

export async function appealImageUrl(path) {
  return signedUrl(supa(), BUCKETS.receipts, path);
}

export async function downloadAppealImage(path) {
  const { data, error } = await supa().storage.from(BUCKETS.receipts).download(path);
  if (error) return null;
  return Buffer.from(await data.arrayBuffer());
}

// ─── storage helpers ─────────────────────────────────────────────────────────
export async function storeDocument(orderId, name, bytes) {
  return uploadBytes(supa(), BUCKETS.documents, `${orderId}/${name}`, bytes);
}

export async function storeReceipt(orderId, name, bytes, contentType) {
  return uploadBytes(supa(), BUCKETS.receipts, `${orderId}/${name}`, bytes, contentType);
}

export async function documentUrl(path) {
  return signedUrl(supa(), BUCKETS.documents, path);
}

export async function downloadDocument(path) {
  const { data, error } = await supa().storage.from(BUCKETS.documents).download(path);
  if (error) throw new Error(`[db] downloadDocument ${path}: ${error.message}`);
  return Buffer.from(await data.arrayBuffer());
}
