/**
 * Dispatch bot HTTP service (Render).
 *   POST /leads            ← tag site pushes a paid order id to dispatch
 *   POST /telegram/webhook ← Telegram updates (callback_query + message)
 *   GET  /health
 */

import express from "express";
import { config, assertConfig } from "./config.js";
import { setWebhook, sendMessage, downloadTelegramFile, answerCallbackQuery } from "./telegram.js";
import { generateAndDispatch, handleAccept, handleDecline } from "./dispatch.js";
import { handleLeadText, handleLeadDocument, handleRouteCallback } from "./agent.js";
import {
  driverByTelegramId,
  supervisorByTelegramId,
  isKnownSupervisor,
  latestDeliveryForDriver,
  markDelivered,
  storeReceipt,
} from "./db.js";
import { showDriverMenu, showHistory, showReceiptPicker, pickReceiptDelivery, handleReceiptPhoto } from "./receipts.js";
import {
  startAppeal,
  pickAppealOrder,
  askManualReference,
  handleAppealReferenceText,
  handleAppealPhoto,
  handleAppealSubmitCallback,
  handleAppealDescribeCallback,
  handleAppealDescriptionText,
  handleAppealReview,
  handleAppealIgnore,
  handleAppealDecline,
  handleAppealFinalDecision,
} from "./appeals.js";

function esc(v) {
  return String(v ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const app = express();
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => res.json({ ok: true, service: "dispatch-bot" }));

// ─── Lead intake from the tag site ───────────────────────────────────────────
app.post("/leads", async (req, res) => {
  if (config.sharedSecret && req.get("x-dispatch-secret") !== config.sharedSecret) {
    return res.status(401).json({ ok: false, error: "unauthorized" });
  }
  const orderId = req.body?.orderId;
  if (!orderId) return res.status(400).json({ ok: false, error: "orderId required" });
  try {
    const result = await generateAndDispatch(orderId);
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error("[/leads]", err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// ─── Telegram webhook ────────────────────────────────────────────────────────
app.post("/telegram/webhook", async (req, res) => {
  res.json({ ok: true }); // ack immediately; process async
  const update = req.body;
  try {
    if (update.callback_query) await onCallback(update.callback_query);
    else if (update.message) await onMessage(update.message);
  } catch (err) {
    console.error("[webhook] handler error:", err);
  }
});

async function onCallback(cq) {
  const data = cq.data || "";
  const chatId = cq.message?.chat?.id;
  const messageId = cq.message?.message_id;
  const fromId = cq.from?.id;

  // Driver claim actions
  if (data.startsWith("accept_") || data.startsWith("decline_")) {
    const orderId = data.slice(data.indexOf("_") + 1);
    const driver = await driverByTelegramId(fromId);
    if (!driver) {
      return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    }
    if (data.startsWith("accept_")) {
      return handleAccept({ orderId, driver, callbackQueryId: cq.id, chatId, messageId });
    }
    return handleDecline({ orderId, callbackQueryId: cq.id, chatId, messageId });
  }

  // Driver menu: History / Pay receipt
  if (data === "menu_history" || data === "menu_receipt") {
    const driver = await driverByTelegramId(fromId);
    if (!driver) return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    await answerCallbackQuery(cq.id);
    return data === "menu_history" ? showHistory(chatId, driver) : showReceiptPicker(chatId, driver);
  }
  if (data.startsWith("pr_")) {
    const driver = await driverByTelegramId(fromId);
    if (!driver) return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    return pickReceiptDelivery(chatId, driver.id, cq.id, data.slice(3));
  }

  // /appeal driver flow
  if (data.startsWith("arf_")) {
    const driver = await driverByTelegramId(fromId);
    if (!driver) return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    return pickAppealOrder(chatId, driver, cq.id, data.slice(4));
  }
  if (data === "amn") {
    const driver = await driverByTelegramId(fromId);
    if (!driver) return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    return askManualReference(chatId, driver, cq.id);
  }
  if (data === "asub") {
    const driver = await driverByTelegramId(fromId);
    if (!driver) return answerCallbackQuery(cq.id, "You're not registered as a driver.", { alert: true });
    return handleAppealSubmitCallback(chatId, driver, cq.id);
  }
  if (data === "adsc") {
    return handleAppealDescribeCallback(chatId, cq.id);
  }

  // Appeal supervisor review: arev_<id> | aign_<id> | adcl_<id>
  if (data.startsWith("arev_") || data.startsWith("aign_") || data.startsWith("adcl_")) {
    const supervisor = await supervisorByTelegramId(fromId);
    if (!supervisor) return answerCallbackQuery(cq.id, "You're not registered as a supervisor.", { alert: true });
    const appealId = data.slice(data.indexOf("_") + 1);
    if (data.startsWith("arev_")) return handleAppealReview({ appealId, supervisor, callbackQueryId: cq.id, chatId, messageId });
    if (data.startsWith("aign_")) return handleAppealIgnore({ appealId, supervisor, callbackQueryId: cq.id, chatId, messageId });
    return handleAppealDecline({ appealId, supervisor, callbackQueryId: cq.id, chatId, messageId });
  }
  // Appeal reviewer's final decision: afacc_<id> | afdec_<id>
  if (data.startsWith("afacc_") || data.startsWith("afdec_")) {
    const supervisor = await supervisorByTelegramId(fromId);
    if (!supervisor) return answerCallbackQuery(cq.id, "You're not registered as a supervisor.", { alert: true });
    const decision = data.startsWith("afacc_") ? "accept" : "decline";
    const appealId = data.slice(data.indexOf("_") + 1);
    return handleAppealFinalDecision({ appealId, decision, callbackQueryId: cq.id, chatId, supervisor });
  }

  // Agent routing actions: all_<id> | pick_<id> | discard_<id> | drv_<id>_<driverId>
  const parts = data.split("_");
  const action = parts[0];
  if (["all", "pick", "discard", "drv"].includes(action)) {
    return handleRouteCallback({
      action,
      orderId: parts[1],
      driverId: parts[2],
      callbackQueryId: cq.id,
      chatId,
      messageId,
    });
  }
}

async function onMessage(msg) {
  const chatId = msg.chat?.id;
  const fromId = msg.from?.id;
  const text = msg.text || "";
  const driver = await driverByTelegramId(fromId);

  // /start and /help — driver-specific menu, supervisor-specific briefing, else generic.
  if (text.startsWith("/start") || text.startsWith("/help")) {
    if (driver) return showDriverMenu(chatId, driver);
    const supervisor = await supervisorByTelegramId(fromId);
    if (supervisor) {
      return sendMessage(
        chatId,
        [
          `👋 <b>Hey ${esc(supervisor.name)}</b> — supervisor tools:`,
          "",
          "• Paste a lead (text) or forward a document — I'll parse it, make the tag, and ask whether to send to all drivers or pick one.",
          "• When a driver files an appeal, you'll get Review / Ignore / Decline buttons.",
        ].join("\n"),
      );
    }
    return sendMessage(
      chatId,
      [
        "👋 <b>NJ Temporary Tag — dispatch bot</b>",
        "",
        "Ask an admin to add your Telegram id as a driver or supervisor in the dashboard.",
      ].join("\n"),
    );
  }

  // /appeal — driver only
  if (text.startsWith("/appeal")) {
    if (!driver) return sendMessage(chatId, "Only registered drivers can file appeals.");
    return startAppeal(chatId, driver);
  }

  // Session-based text replies (appeal manual reference / description) take priority.
  if (driver && text && !text.startsWith("/")) {
    if (await handleAppealReferenceText(chatId, driver, text)) return;
    if (await handleAppealDescriptionText(chatId, driver, text)) return;
  }

  // A photo/document could be: a pending receipt/appeal upload, a delivery
  // proof, or a supervisor's lead.
  const fileId = pickFileId(msg);

  if (fileId && driver) {
    // Session-based photo uploads (pay-receipt / appeal proof) take priority.
    if (await handleReceiptPhoto(chatId, fileId)) return;
    if (await handleAppealPhoto(chatId, fileId)) return;

    // Fallback: any photo closes the driver's latest accepted delivery (proof of delivery).
    const delivery = await latestDeliveryForDriver(driver.id);
    if (delivery) {
      const file = await downloadTelegramFile(fileId);
      if (file) {
        const ext = file.mime === "application/pdf" ? "pdf" : file.mime === "image/png" ? "png" : "jpg";
        const path = await storeReceipt(delivery.order_id, `receipt.${ext}`, file.bytes, file.mime);
        await markDelivered(delivery.id, path);
        return sendMessage(chatId, "✅ Receipt received — delivery marked as completed. Thank you!");
      }
    }
    return sendMessage(chatId, "📎 Got your file, but I don't see an open delivery to attach it to.");
  }

  // Supervisor lead intake
  const isSupervisor = await isKnownSupervisor(fromId);
  if (fileId && isSupervisor) return handleLeadDocument(chatId, fileId);
  if (text && isSupervisor && !text.startsWith("/")) return handleLeadText(chatId, text);

  // Unknown sender / unhandled
  if (text && !text.startsWith("/")) {
    return sendMessage(chatId, "I only take leads from supervisors and receipts from drivers. If that's you, ask an admin to add your Telegram id in the dashboard.");
  }
}

/** Pick the best file id from a photo/document message. */
function pickFileId(msg) {
  if (msg.document) return msg.document.file_id;
  if (Array.isArray(msg.photo) && msg.photo.length) return msg.photo[msg.photo.length - 1].file_id;
  return null;
}

app.listen(config.port, async () => {
  assertConfig();
  console.log(`[dispatch-bot] listening on :${config.port}`);
  await setWebhook();
});
