// frontend/src/api.js
// Client API layer communicating with merchant (port 3000) and agent (port 3001)

export const MERCHANT_URL = import.meta.env.VITE_MERCHANT_URL || 'http://localhost:3000';
export const AGENT_URL = import.meta.env.VITE_AGENT_URL || 'http://localhost:3001';

export async function fetchConfig() {
  const res = await fetch(`${MERCHANT_URL}/api/config`);
  if (!res.ok) throw new Error(`GET /api/config failed with status ${res.status}`);
  return res.json();
}

export async function fetchProducts() {
  const res = await fetch(`${MERCHANT_URL}/api/products`);
  if (!res.ok) throw new Error(`GET /api/products failed with status ${res.status}`);
  return res.json();
}

export async function fetchAuditTrail() {
  const res = await fetch(`${MERCHANT_URL}/api/audit-trail`);
  if (!res.ok) throw new Error(`GET /api/audit-trail failed with status ${res.status}`);
  return res.json();
}

export async function createSession(request) {
  const res = await fetch(`${AGENT_URL}/api/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `POST /api/sessions failed: ${res.status}`);
  }
  return res.json();
}

export async function submitApproval(sessionId, approved) {
  const res = await fetch(`${AGENT_URL}/api/sessions/${sessionId}/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approved: Boolean(approved) }),
  });
  if (!res.ok) {
    const errorData = await res.json().catch(() => ({}));
    throw new Error(errorData.error || `POST /approve failed: ${res.status}`);
  }
  return res.json();
}

// Bypasses the agent entirely and hits the merchant's hard budget wall directly
export async function triggerDirectBypass({ productId, agentReasoning }) {
  const res = await fetch(`${MERCHANT_URL}/api/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId, agentReasoning }),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

export function subscribeToSession(sessionId, onEvent, onError) {
  const es = new EventSource(`${AGENT_URL}/api/sessions/${sessionId}/events`);

  const eventTypes = [
    'tool_call',
    'tool_result',
    'awaiting_approval',
    'payment_progress',
    'agent_text',
    'run_complete',
    'run_error',
  ];

  eventTypes.forEach((type) => {
    es.addEventListener(type, (evt) => {
      try {
        const parsed = JSON.parse(evt.data);
        onEvent({ type, data: parsed });
      } catch (err) {
        console.error(`Failed to parse SSE event ${type}:`, err);
      }
    });
  });

  es.onmessage = (evt) => {
    try {
      const parsed = JSON.parse(evt.data);
      onEvent({ type: parsed.event || 'message', data: parsed });
    } catch (err) {
      console.error('Failed to parse generic SSE message:', err);
    }
  };

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return () => {
    es.close();
  };
}
