// agent/src/server.js
//
// Phase 6: Agent as a Service
// HTTP + Server-Sent Events server wrapping Gofer's reasoning engine.

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const { runGoferAgent } = require('./runner');

const app = express();
const PORT = process.env.PORT || 3001;

// Permissive CORS for local dev (will be tightened for deployed frontend in Phase 8)
app.use(cors());
app.use(express.json());

// In-memory session store: Map<sessionId, Session>
// Session: {
//   id: string,
//   request: string,
//   status: 'running' | 'completed' | 'failed',
//   events: Array<{ type: string, payload: any, timestamp: string }>,
//   clients: Set<express.Response>,
//   pendingApproval: { resolve: Function, reject: Function, details: any } | null,
//   createdAt: Date
// }
const sessions = new Map();

function emitSessionEvent(session, type, data = {}) {
  console.log(`[session ${session.id}] event: ${type}`, JSON.stringify(data));
  const payload = { event: type, ...data };
  const eventItem = { type, payload, timestamp: new Date().toISOString() };
  session.events.push(eventItem);

  const sseChunk = `event: ${type}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of session.clients) {
    try {
      client.write(sseChunk);
    } catch (err) {
      console.error(`[session ${session.id}] Error writing to client:`, err.message);
    }
  }
}

// ==========================================
// 1. POST /api/sessions — Start a new Gofer run
// ==========================================
app.post('/api/sessions', (req, res) => {
  const { request } = req.body || {};
  if (!request || typeof request !== 'string' || !request.trim()) {
    return res.status(400).json({ error: 'request string is required' });
  }

  const sessionId = crypto.randomUUID();
  const session = {
    id: sessionId,
    request: request.trim(),
    status: 'running',
    events: [],
    clients: new Set(),
    pendingApproval: null,
    createdAt: new Date(),
  };

  sessions.set(sessionId, session);

  // Run the agent asynchronously in background — do NOT block HTTP response
  (async () => {
    try {
      await runGoferAgent({
        userRequest: session.request,
        onEvent: (type, data) => {
          emitSessionEvent(session, type, data);
        },
        askApproval: ({ itemName, amountPaise, agentReasoning }) => {
          // Emit awaiting_approval event to all SSE clients
          emitSessionEvent(session, 'awaiting_approval', {
            itemName,
            amountPaise,
            agentReasoning,
          });

          // Block on Promise until POST /api/sessions/:id/approve is called
          return new Promise((resolve, reject) => {
            session.pendingApproval = {
              resolve,
              reject,
              details: { itemName, amountPaise, agentReasoning },
            };
          });
        },
        onProgress: (line) => {
          emitSessionEvent(session, 'payment_progress', { line });
        },
      });
      session.status = 'completed';
    } catch (err) {
      console.error(`[session ${sessionId}] Agent error:`, err);
      session.status = 'failed';
      emitSessionEvent(session, 'run_error', { error: err.message });
      emitSessionEvent(session, 'run_complete', {});
    }
  })();

  return res.status(201).json({ sessionId });
});

// ==========================================
// 2. GET /api/sessions/:id/events — SSE Stream
// ==========================================
app.get('/api/sessions/:id/events', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  if (typeof res.flushHeaders === 'function') {
    res.flushHeaders();
  }

  // Replay all buffered events in order so early events aren't missed
  for (const ev of session.events) {
    res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev.payload)}\n\n`);
  }

  session.clients.add(res);

  // Keepalive comment ping every 20s to prevent proxy/reverse-proxy timeouts
  const keepAliveInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch (_) {
      // Handled in close
    }
  }, 20000);

  req.on('close', () => {
    clearInterval(keepAliveInterval);
    session.clients.delete(res);
  });
});

// ==========================================
// 3. POST /api/sessions/:id/approve — Human Gate
// ==========================================
app.post('/api/sessions/:id/approve', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  if (!session.pendingApproval) {
    return res.status(400).json({ error: 'no_pending_approval' });
  }

  const { approved } = req.body || {};
  if (typeof approved !== 'boolean') {
    return res.status(400).json({ error: 'approved boolean is required' });
  }

  const { resolve } = session.pendingApproval;
  session.pendingApproval = null;
  resolve(approved);

  return res.json({ ok: true, approved });
});

// ==========================================
// 4. GET /api/sessions/:id — Status inspection
// ==========================================
app.get('/api/sessions/:id', (req, res) => {
  const session = sessions.get(req.params.id);
  if (!session) {
    return res.status(404).json({ error: 'session_not_found' });
  }

  return res.json({
    id: session.id,
    request: session.request,
    status: session.status,
    eventCount: session.events.length,
    hasPendingApproval: Boolean(session.pendingApproval),
    pendingApprovalDetails: session.pendingApproval?.details || null,
    createdAt: session.createdAt,
  });
});

// ==========================================
// Server Listen
// ==========================================
const server = app.listen(PORT, () => {
  console.log(`\n🚀 Gofer Agent Service running on http://localhost:${PORT}`);
  console.log(`   - POST /api/sessions`);
  console.log(`   - GET  /api/sessions/:id/events`);
  console.log(`   - POST /api/sessions/:id/approve\n`);
});

module.exports = { app, server, sessions };
