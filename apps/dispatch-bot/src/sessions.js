/**
 * Tiny in-memory per-Telegram-chat conversation state, for the short
 * multi-step flows (pay-receipt upload, /appeal). Single dispatch-bot
 * instance, so a Map is sufficient — same pattern as dispatch.js's
 * fallbackTimers.
 */

const sessions = new Map();

export function getSession(chatId) {
  return sessions.get(String(chatId)) || null;
}

export function setSession(chatId, state) {
  sessions.set(String(chatId), state);
}

export function clearSession(chatId) {
  sessions.delete(String(chatId));
}
