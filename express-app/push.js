"use strict";
// Web Push helpers (web-push lib).
// Keys come from env (VAPID_PUBLIC, VAPID_PRIVATE, VAPID_SUBJECT). When they
// are missing, a key pair is generated once and kept in data/vapid.json so
// notifications work out of the box.

const fs = require("fs");
const path = require("path");
const webpush = require("web-push");
const { db } = require("./db");

let configured = null; // tri-state cache: null = unchecked
let keys = null;

function loadKeys() {
  if (process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE) {
    return { publicKey: process.env.VAPID_PUBLIC, privateKey: process.env.VAPID_PRIVATE };
  }
  if (process.env.HARAJ_DB_PATH) return null; // tests: never write key files
  const file = path.join(__dirname, "data", "vapid.json");
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    const k = webpush.generateVAPIDKeys();
    fs.writeFileSync(file, JSON.stringify(k, null, 2));
    console.log("[push] generated VAPID keys in data/vapid.json");
    return k;
  }
}

function isConfigured() {
  if (configured === null) {
    try { keys = loadKeys(); } catch (e) { console.warn("[push] key setup failed:", e.message); keys = null; }
    configured = Boolean(keys && keys.publicKey && keys.privateKey);
    if (configured) {
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || "mailto:admin@example.com", keys.publicKey, keys.privateKey);
    }
  }
  return configured;
}

function getPublicKey() {
  return isConfigured() ? keys.publicKey : null;
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

module.exports = { isConfigured, getPublicKey, saveSubscription, sendToAll, getSubscriptions };
