# Phase 5 — Test Checklist

Run from `merchant/` unless noted. `server.js` must be running (nodemon recommended).

## 1. Happy path — ✅ already run tonight
`node ../agent/src/index.js "get me a study chair under ₹9,000, delivered this week"`, answer `y`.
- [ ] `pay_...` shows **Captured** in Razorpay dashboard
- [ ] `Order.status = PAID`
- [ ] `AuditLog` chain: `SEARCH → PLACE_ORDER → APPROVAL_REQUESTED → APPROVAL_GRANTED → PAYMENT_SUCCESS`, real reasoning on every row (not placeholders)

## 2. The wall (bounded) — agent side already run ✅, one more check needed
Agent side (done): `node ../agent/src/index.js "get me the Zero-Gravity Gaming Chair"` → `abort_transaction` called, `place_order` never appears.

**Still needed — bypass the agent entirely:**
```bash
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -d '{"productId":"cmtlvjlfh0007kn3irrmgihke","agentReasoning":"direct bypass test — proving the wall holds without the agent"}'
```
- [ ] Response is `422 { "error": "budget_exceeded", ... }`
- [ ] New `AuditLog` row: `REFUSAL`, `orderId: null`
- [ ] No new `Order` row, no new Razorpay order created

This is the one that actually proves the wall doesn't depend on the agent behaving — a request that never touched `agent/` gets rejected identically.

## 3. The door, declined — ✅ already run tonight
`node ../agent/src/index.js "get me a study chair under ₹9,000, delivered this week"`, answer `n`.
- [ ] No `Order` row created for this attempt
- [ ] `AuditLog`: `APPROVAL_REQUESTED → APPROVAL_DENIED`, no `PLACE_ORDER` row after it
- [ ] Agent printed `✅ Run complete.` cleanly — no crash, no re-prompt

## 4. The door, approved — ✅ already run tonight
Same as #1 (they're the same run).

## 5. The readout
```bash
node scripts/printAuditTrail.js
```
- [ ] Every row has real, specific reasoning text — no `"N/A"` or `"testing"` placeholders
- [ ] Chronological order is correct across all four scenarios' worth of rows
- [ ] Legible enough to read aloud without extra explanation

---

**Still open:** only item 2's bypass curl. Run that, re-run the printout script, and Phase 5 — and the whole build — is done.
