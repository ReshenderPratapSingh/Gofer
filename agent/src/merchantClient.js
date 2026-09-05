// agent/src/merchantClient.js
//
// Thin HTTP wrapper over merchant/server.js. Nothing here imports merchant
// code directly — the two services only ever talk over HTTP, per the
// project's architecture (any AI buyer should be able to shop through this
// same public API, not just Gofer).

const MERCHANT_BASE_URL = process.env.MERCHANT_BASE_URL || 'http://localhost:3000';

async function getProducts() {
  const res = await fetch(`${MERCHANT_BASE_URL}/api/products`);
  if (!res.ok) throw new Error(`GET /api/products failed: ${res.status}`);
  return res.json();
}

async function createOrder({ productId, agentReasoning }) {
  const res = await fetch(`${MERCHANT_BASE_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, agentReasoning }),
  });
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

// Centralizes AuditLog writes for events that aren't tied to a
// money-moving route (SEARCH, APPROVAL_REQUESTED/GRANTED/DENIED) — the
// merchant's DB is the single source of truth for the audit trail, so the
// agent never writes to Postgres directly.
async function logAudit({ orderId, action, reasoning, metadata }) {
  try {
    const res = await fetch(`${MERCHANT_BASE_URL}/api/audit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderId: orderId || null, action, reasoning, metadata }),
    });
    if (!res.ok) console.error(`[audit] merchant rejected the log write: ${res.status}`);
  } catch (err) {
    console.error('[audit] failed to reach merchant:', err.message);
  }
}

module.exports = { getProducts, createOrder, logAudit, MERCHANT_BASE_URL };
