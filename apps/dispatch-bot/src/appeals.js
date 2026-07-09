/**
 * /appeal — a driver flags an order that wasn't valid or was cancelled by
 * the client. Flow: pick a recent order (or type its reference number) →
 * upload a proof photo → Submit or add a description → "submitted, under
 * review". Every active supervisor gets Review / Ignore / Decline; the first
 * to Review claims it (atomic) and gets the proof + a final Accept/Decline.
 */

import {
  driverDeliveries,
  driverById,
  getOrder,
  orderByReferenceCode,
  activeSupervisors,
  createAppeal,
  getAppeal,
  updateAppeal,
  tryClaimAppealReview,
  tryDeclineAppeal,
  storeAppealImage,
  appealImageUrl,
  downloadAppealImage,
} from "./db.js";
import { sendMessage, sendPhoto, editMessageText, answerCallbackQuery, downloadTelegramFile, keyboards } from "./telegram.js";
import { getSession, setSession, clearSession } from "./sessions.js";
import { referenceCode } from "./dispatch.js";

function esc(v) {
  return String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** /appeal entry — offer the driver's last 2 orders + manual reference entry. */
export async function startAppeal(chatId, driver) {
  const deliveries = await driverDeliveries(driver.id, 2);
  const recents = deliveries
    .filter((d) => d.orders)
    .map((d) => ({ id: d.order_id, reference_code: d.orders.reference_code }));
  clearSession(chatId);
  return sendMessage(
    chatId,
    "❗ <b>File an appeal</b>\nPick a recent order, or enter its reference number.",
    { keyboard: keyboards.appealPicker(recents) },
  );
}

export async function pickAppealOrder(chatId, driver, callbackQueryId, orderId) {
  setSession(chatId, { mode: "awaiting_appeal_image", orderId, driverId: driver.id });
  await answerCallbackQuery(callbackQueryId, "Send a photo as proof.");
  return sendMessage(chatId, "📸 Send a photo showing proof for this appeal.");
}

export async function askManualReference(chatId, driver, callbackQueryId) {
  setSession(chatId, { mode: "awaiting_appeal_refcode", driverId: driver.id });
  await answerCallbackQuery(callbackQueryId, "Enter the reference number.");
  return sendMessage(chatId, "🔎 Reply with the order's reference number (e.g. CD356E0D).");
}

/** Text reply while awaiting a manually-typed reference number. Returns true if handled. */
export async function handleAppealReferenceText(chatId, driver, text) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_appeal_refcode") return false;

  const order = await orderByReferenceCode(text);
  if (!order) {
    await sendMessage(chatId, "❌ I couldn't find that reference number. Try again, or /appeal to restart.");
    return true;
  }
  if (order.telegram_accepted_driver_id !== driver.id) {
    await sendMessage(chatId, "❌ That reference isn't linked to one of your deliveries.");
    return true;
  }
  setSession(chatId, { mode: "awaiting_appeal_image", orderId: order.id, driverId: driver.id });
  await sendMessage(chatId, "📸 Send a photo showing proof for this appeal.");
  return true;
}

/** Photo while awaiting appeal proof. Returns true if handled. */
export async function handleAppealPhoto(chatId, fileId) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_appeal_image") return false;

  const file = await downloadTelegramFile(fileId);
  if (!file) {
    await sendMessage(chatId, "❌ Couldn't download that photo — try again.");
    return true;
  }
  setSession(chatId, { ...session, mode: "awaiting_appeal_decision", imageBytes: file.bytes, imageMime: file.mime });
  await sendMessage(chatId, "Got it. Submit now, or add a short description first?", { keyboard: keyboards.submitOrDescribe() });
  return true;
}

export async function handleAppealSubmitCallback(chatId, driver, callbackQueryId) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_appeal_decision") {
    return answerCallbackQuery(callbackQueryId, "Nothing to submit.", { alert: true });
  }
  await answerCallbackQuery(callbackQueryId, "Submitting…");
  return finalizeAppeal(chatId, driver, session, null);
}

export async function handleAppealDescribeCallback(chatId, callbackQueryId) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_appeal_decision") {
    return answerCallbackQuery(callbackQueryId, "Nothing pending.", { alert: true });
  }
  setSession(chatId, { ...session, mode: "awaiting_appeal_description" });
  await answerCallbackQuery(callbackQueryId, "Add your description.");
  return sendMessage(chatId, "📝 Reply with a short description of the issue.");
}

/** Text reply while awaiting an appeal description. Returns true if handled. */
export async function handleAppealDescriptionText(chatId, driver, text) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_appeal_description") return false;
  await finalizeAppeal(chatId, driver, session, text.trim());
  return true;
}

async function finalizeAppeal(chatId, driver, session, description) {
  clearSession(chatId);
  const appeal = await createAppeal({ orderId: session.orderId, driverId: driver.id, description });

  let imagePath = null;
  try {
    const ext = session.imageMime === "image/png" ? "png" : "jpg";
    imagePath = await storeAppealImage(appeal.id, `proof.${ext}`, session.imageBytes, session.imageMime);
    await updateAppeal(appeal.id, { image_path: imagePath });
  } catch (err) {
    console.warn("[appeals] image upload failed:", err.message);
  }

  await sendMessage(chatId, "✅ Appeal submitted successfully — under review.");
  await notifySupervisors({ ...appeal, image_path: imagePath }, driver, session.orderId);
}

async function notifySupervisors(appeal, driver, orderId) {
  const supervisors = await activeSupervisors();
  const order = await getOrder(orderId).catch(() => null);
  const ref = order ? referenceCode(order) : String(orderId || "").slice(0, 8).toUpperCase();
  const text = [
    "❗ <b>Driver appeal</b>",
    `Order #${esc(ref)}`,
    `Driver: ${esc(driver.name)}`,
    "",
    "Review to see the proof, Ignore to skip, or Decline to reject outright.",
  ].join("\n");
  const ids = {};
  for (const s of supervisors) {
    const res = await sendMessage(s.telegram_id, text, { keyboard: keyboards.appealSupervisor(appeal.id) });
    if (res.ok) ids[s.telegram_id] = res.result.message_id;
  }
  await updateAppeal(appeal.id, { supervisor_message_ids: ids });
}

/** A supervisor tapped Review — atomic first-review-wins claim. */
export async function handleAppealReview({ appealId, supervisor, callbackQueryId, chatId, messageId }) {
  const won = await tryClaimAppealReview(appealId, supervisor);
  if (!won) {
    const appeal = await getAppeal(appealId);
    const msg = appeal?.status === "declined" ? "Already declined." : "Already being reviewed.";
    return answerCallbackQuery(callbackQueryId, msg, { alert: true });
  }

  await answerCallbackQuery(callbackQueryId, "Reviewing…");
  await editMessageText(chatId, messageId, "👀 <b>You're reviewing this appeal.</b>");

  const ids = won.supervisor_message_ids || {};
  for (const [tgId, msgId] of Object.entries(ids)) {
    if (String(tgId) === String(supervisor.telegram_id)) continue;
    await editMessageText(tgId, msgId, `👀 <b>Being reviewed by ${esc(supervisor.name)}.</b>`);
  }

  if (won.image_path) {
    try {
      const bytes = await downloadAppealImage(won.image_path);
      if (bytes) await sendPhoto(chatId, bytes, "proof.jpg", "🖼 Proof photo");
      else await sendMessage(chatId, `🖼 <a href="${esc(await appealImageUrl(won.image_path))}">View proof photo</a>`);
    } catch {
      /* best-effort */
    }
  }
  if (won.description) await sendMessage(chatId, `📝 <b>Description:</b> ${esc(won.description)}`);
  return sendMessage(chatId, "What's the decision?", { keyboard: keyboards.appealDecision(appealId) });
}

export async function handleAppealIgnore({ appealId, callbackQueryId, chatId, messageId, supervisor }) {
  await answerCallbackQuery(callbackQueryId, "Skipped.");
  return editMessageText(chatId, messageId, `⏭ <b>Skipped</b> by ${esc(supervisor.name)}.`);
}

export async function handleAppealDecline({ appealId, callbackQueryId, chatId, messageId, supervisor }) {
  const declined = await tryDeclineAppeal(appealId);
  if (!declined) {
    return answerCallbackQuery(callbackQueryId, "Already handled.", { alert: true });
  }
  await answerCallbackQuery(callbackQueryId, "Declined.");
  const ids = declined.supervisor_message_ids || {};
  for (const [tgId, msgId] of Object.entries(ids)) {
    await editMessageText(tgId, msgId, `❌ <b>Appeal declined</b> by ${esc(supervisor.name)}.`);
  }
  return notifyDriverOfDecision(declined, "declined");
}

/** The reviewing supervisor's final Accept/Decline. */
export async function handleAppealFinalDecision({ appealId, decision, callbackQueryId, chatId, supervisor }) {
  const appeal = await getAppeal(appealId);
  if (!appeal || appeal.reviewing_supervisor_id !== supervisor.id) {
    return answerCallbackQuery(callbackQueryId, "You're not the reviewer for this appeal.", { alert: true });
  }
  const status = decision === "accept" ? "accepted" : "declined";
  const updated = await updateAppeal(appealId, { status });
  await answerCallbackQuery(callbackQueryId, status === "accepted" ? "Appeal accepted." : "Appeal declined.");
  await sendMessage(chatId, status === "accepted" ? "✅ You accepted this appeal." : "❌ You declined this appeal.");
  return notifyDriverOfDecision(updated, status);
}

async function notifyDriverOfDecision(appeal, status) {
  const driver = appeal.driver_id ? await driverById(appeal.driver_id) : null;
  if (!driver) return;
  const order = appeal.order_id ? await getOrder(appeal.order_id).catch(() => null) : null;
  const orderRef = order ? referenceCode(order) : String(appeal.order_id || "").slice(0, 8).toUpperCase();
  const msg =
    status === "accepted"
      ? `✅ Your appeal for order #${esc(orderRef)} was accepted.`
      : `❌ Your appeal for order #${esc(orderRef)} was declined.`;
  return sendMessage(driver.telegram_id, msg);
}
