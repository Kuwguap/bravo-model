/**
 * Driver menu: History + Pay receipt.
 *
 * Pay receipt: driver taps a reference-number button for one of their
 * outstanding deliveries, sends a photo of the receipt, OpenAI reads the
 * total off it (the "true amount"), and we record it against the order's
 * "set amount" (a per-order override or the control panel's global
 * default) — set - true = difference, expressed as a % of the set amount.
 */

import { parseReceiptAmount, openAiEnabled } from "@speedy/shared/openai";
import { driverDeliveries, pendingReceiptDeliveries, deliveryById, updateDelivery, getSettingsRow, storeReceipt } from "./db.js";
import { sendMessage, keyboards, downloadTelegramFile, answerCallbackQuery } from "./telegram.js";
import { getSession, setSession, clearSession } from "./sessions.js";

function esc(v) {
  return String(v ?? "—").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function refOf(delivery) {
  return delivery.orders?.reference_code || String(delivery.order_id || "").slice(0, 8).toUpperCase();
}

export async function showDriverMenu(chatId, driver) {
  return sendMessage(
    chatId,
    `👋 <b>Hey ${esc(driver.name)}</b> — here's your driver menu.\n\nUse the buttons below, or /appeal if an order wasn't valid or was cancelled by the client.`,
    { keyboard: keyboards.driverMenu() },
  );
}

export async function showHistory(chatId, driver) {
  const rows = await driverDeliveries(driver.id, 10);
  if (!rows.length) return sendMessage(chatId, "No delivery history yet.");
  const lines = rows.map((r) => {
    const paid = r.receipt_amount_true != null ? `paid $${Number(r.receipt_amount_true).toFixed(2)}` : "no receipt yet";
    return `• <b>${esc(refOf(r))}</b> — ${esc(r.orders?.plate || "—")} — ${esc(r.status)} — ${esc(paid)}`;
  });
  return sendMessage(chatId, `📋 <b>Your last ${rows.length} order${rows.length === 1 ? "" : "s"}</b>\n\n${lines.join("\n")}`);
}

export async function showReceiptPicker(chatId, driver) {
  const rows = await pendingReceiptDeliveries(driver.id, 10);
  if (!rows.length) return sendMessage(chatId, "🎉 No pending receipts — you're all caught up.");
  const items = rows.map((r) => ({ deliveryId: r.id, reference: refOf(r), plate: r.orders?.plate }));
  return sendMessage(chatId, "🧾 Pick the order to submit a receipt for:", { keyboard: keyboards.receiptPicker(items) });
}

export async function pickReceiptDelivery(chatId, driverId, callbackQueryId, deliveryId) {
  const delivery = await deliveryById(deliveryId);
  if (!delivery || delivery.driver_id !== driverId) {
    return answerCallbackQuery(callbackQueryId, "Not found.", { alert: true });
  }
  setSession(chatId, { mode: "awaiting_receipt_photo", deliveryId });
  await answerCallbackQuery(callbackQueryId, "Send the receipt photo.");
  return sendMessage(chatId, `📸 Send a photo of the receipt for <b>${esc(refOf(delivery))}</b>.`);
}

/** Handle an incoming photo while a receipt upload is pending. Returns true if it was handled. */
export async function handleReceiptPhoto(chatId, fileId) {
  const session = getSession(chatId);
  if (!session || session.mode !== "awaiting_receipt_photo") return false;
  clearSession(chatId);

  const delivery = await deliveryById(session.deliveryId);
  if (!delivery) {
    await sendMessage(chatId, "❌ Couldn't find that order anymore.");
    return true;
  }

  const file = await downloadTelegramFile(fileId);
  if (!file) {
    await sendMessage(chatId, "❌ Couldn't download that photo — try again.");
    return true;
  }

  let trueAmount = null;
  if (openAiEnabled()) {
    try {
      trueAmount = (await parseReceiptAmount(file.bytes, file.mime)).amount;
    } catch (err) {
      console.warn("[receipts] parseReceiptAmount failed:", err.message);
    }
  }

  const settings = await getSettingsRow();
  const setAmount = Number(delivery.orders?.driver_pay_amount ?? settings.default_driver_pay_amount ?? 150);
  const diff = trueAmount != null ? Number((setAmount - trueAmount).toFixed(2)) : null;
  const pct = trueAmount != null && setAmount ? Number(((diff / setAmount) * 100).toFixed(1)) : null;

  const ext = file.mime === "image/png" ? "png" : "jpg";
  const path = await storeReceipt(delivery.order_id, `receipt-${delivery.id}.${ext}`, file.bytes, file.mime);

  await updateDelivery(delivery.id, {
    receipt_path: path,
    receipt_amount_set: setAmount,
    receipt_amount_true: trueAmount,
    receipt_amount_diff: diff,
    receipt_amount_diff_pct: pct,
    receipt_uploaded_at: new Date().toISOString(),
  });

  if (trueAmount == null) {
    await sendMessage(chatId, "✅ Receipt saved, but I couldn't read an amount from it automatically — an admin will check it.");
    return true;
  }

  await sendMessage(
    chatId,
    [
      "✅ <b>Receipt recorded</b>",
      `Set amount: $${setAmount.toFixed(2)}`,
      `Receipt amount: $${trueAmount.toFixed(2)}`,
      `Difference: $${diff.toFixed(2)} (${pct}%)`,
    ].join("\n"),
  );
  return true;
}
