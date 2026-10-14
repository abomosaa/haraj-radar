"use strict";
// Web Push helpers (web-push lib).
// Generate keys once:  npx web-push generate-vapid-keys
// Then set env: VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT (mailto:).

const webpush = require("web-push");
const { db } = require("./db");

let configured = null; // tri-state cache: null = unchecked

function isConfigured() {
  if (configured === null) {
    const { VAPID_PUBLIC, VAPID_PRIVATE } = process.env;
    configured = Boolean(VAPID_PUBLIC && VAPID_PRIVATE);
    if (configured) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT || "mailto:admin@example.com",
        VAPID_PUBLIC,
        VAPID_PRIVATE
      );
    }
  }
  return configured;
}

function getPublicKey() {
  return process.env.VAPID_PUBLIC || null;
}

function saveSubscription(sub) {
  if (!sub || !sub.endpoint) throw new Error("Invalid subscription");
  db.prepare(
    "INSERT OR REPLACE INTO subscriptions (endpoint, keys, created_at) VALUES (?, ?, ?)"
  ).run(sub.endpoint, JSON.stringify(sub.keys || {}), new Date().toISOString());
}

function getSubscriptions() {
  return db.prepare("SELECT endpoint, keys FROM subscriptions").all().map((r) => ({
    endpoint: r.endpoint,
    keys: JSON.parse(r.keys || "{}"),
  }));
}

// Best-effort broadcast; drops dead (410/404) subscriptions.
async function sendToAll(payload) {
  if (!isConfigured()) return { sent: 0, skipped: "vapid-not-configured" };
  const body = typeof payload === "string" ? payload : JSON.stringify(payload);
  let sent = 0;
  for (const sub of getSubscriptions()) {
    try {
      await webpush.sendNotification(sub, body);
      sent++;
    } catch (err) {
      if (err && (err.statusCode === 410 || err.statusCode === 404)) {
        db.prepare("DELETE FROM subscriptions WHERE endpoint = ?").run(sub.endpoint);
      }
    }
  }
  return { sent };
}

module.exports = { isConfigured, getPublicKey, saveSubscription, sendToAll };
