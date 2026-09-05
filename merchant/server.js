require('dotenv').config();
const express = require('express');
const crypto = require('crypto');
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');
const Razorpay = require('razorpay');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// The actual wall. Lives ONLY here — never accepted as a request parameter
// from the agent, per Phase 3 spec. Default matches the ₹9,000 example.
const MAX_BUDGET_PAISE = Number(process.env.MAX_BUDGET_PAISE || 900000);

const app = express();
const PORT = process.env.PORT || 3000;

if (!process.env.RAZORPAY_WEBHOOK_SECRET) {
  console.error('❌ RAZORPAY_WEBHOOK_SECRET is not set — webhook verification cannot work.');
}

// Constant-time comparison — signature checks should never use plain `===`.
function signaturesMatch(expectedHex, actualHex) {
  if (!actualHex) return false;
  const a = Buffer.from(expectedHex, 'utf8');
  const b = Buffer.from(actualHex, 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ==========================================
// 1. THE WEBHOOK (raw body, must come before express.json())
// ==========================================
app.post('/webhook/razorpay', express.raw({ type: 'application/json' }), async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];
  if (!signature) return res.status(400).send('No signature provided');

  const expected = crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (!signaturesMatch(expected, signature)) {
    console.error('❌ [WEBHOOK] Signature mismatch!');
    return res.status(400).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  if (event.event !== 'payment.captured') return res.status(200).json({ status: 'ignored' });

  const payment = event.payload.payment.entity;
  try {
    const order = await prisma.order.findFirst({ where: { razorpayOrderId: payment.order_id } });
    if (!order) {
      console.error(`❌ [WEBHOOK] payment.captured for unknown order ${payment.order_id}`);
      return res.status(200).json({ status: 'ok' }); // ack anyway — not Razorpay's fault
    }

    // Idempotent: if /verify already marked this PAID, don't duplicate the log.
    if (order.status === 'PAID') {
      console.log(`✅ [WEBHOOK] payment.captured for ${payment.id} — already PAID via /verify, no-op.`);
      return res.status(200).json({ status: 'ok' });
    }

    await prisma.$transaction([
      prisma.order.update({
        where: { id: order.id },
        data: { status: 'PAID', razorpayPaymentId: payment.id },
      }),
      prisma.auditLog.create({
        data: {
          orderId: order.id,
          action: 'PAYMENT_SUCCESS',
          reasoning: `Confirmed via Razorpay webhook (payment.captured) — payment ${payment.id} for order ${payment.order_id}. The client-side /verify redirect never reached us, so this is the order's only PAID confirmation.`,
          metadata: { source: 'webhook', paymentId: payment.id, orderId: payment.order_id },
        },
      }),
    ]);
    console.log(`✅ [WEBHOOK] payment.captured verified for payment: ${payment.id} — order ${order.id} marked PAID (webhook was the only path).`);
    res.status(200).json({ status: 'ok' });
  } catch (err) {
    console.error('❌ [WEBHOOK] Failed to process:', err.message);
    res.status(200).json({ status: 'ok' }); // still ack so Razorpay doesn't retry-storm us
  }
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================
// 2. GET /api/products — the machine-readable catalog
// ==========================================
app.get('/api/products', async (req, res) => {
  const products = await prisma.product.findMany({
    select: { id: true, name: true, description: true, priceInPaise: true, inStock: true },
    orderBy: { priceInPaise: 'asc' },
  });
  res.json(products);
});

// ==========================================
// 3. POST /api/orders — the hard fence
// ==========================================
app.post('/api/orders', async (req, res) => {
  const { productId, agentReasoning } = req.body;
  if (!productId || !agentReasoning) {
    return res.status(400).json({ error: 'productId and agentReasoning are required' });
  }

  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) return res.status(404).json({ error: 'product_not_found' });

  // THE WALL. This check is what actually stops an over-budget order —
  // whatever the agent's system prompt says, this is the real enforcement.
  if (product.priceInPaise > MAX_BUDGET_PAISE) {
    await prisma.auditLog.create({
      data: {
        orderId: null,
        action: 'REFUSAL',
        reasoning: `${agentReasoning} [Server-enforced refusal: ${product.name} costs ₹${product.priceInPaise / 100}, which exceeds the ₹${MAX_BUDGET_PAISE / 100} ceiling.]`,
        metadata: { productId, limitPaise: MAX_BUDGET_PAISE, requestedPaise: product.priceInPaise },
      },
    });
    return res.status(422).json({
      error: 'budget_exceeded',
      limitPaise: MAX_BUDGET_PAISE,
      requestedPaise: product.priceInPaise,
    });
  }

  try {
    const razorpayOrder = await razorpay.orders.create({
      amount: product.priceInPaise,
      currency: 'INR',
      receipt: `gofer-${Date.now()}`,
    });

    const order = await prisma.order.create({
      data: {
        productId: product.id,
        status: 'CREATED',
        amountInPaise: product.priceInPaise,
        razorpayOrderId: razorpayOrder.id,
      },
    });

    // Reasoning is stored EXACTLY as received — not summarized or rephrased.
    await prisma.auditLog.create({
      data: {
        orderId: order.id,
        action: 'PLACE_ORDER',
        reasoning: agentReasoning,
        metadata: { productId, priceInPaise: product.priceInPaise, razorpayOrderId: razorpayOrder.id },
      },
    });

    res.status(201).json({
      orderId: order.id,
      razorpayOrderId: razorpayOrder.id,
      amountInPaise: product.priceInPaise,
      checkoutUrl: `http://localhost:${PORT}/checkout/${order.id}`,
    });
  } catch (err) {
    console.error('❌ [ORDERS] Failed to create Razorpay order:', err.message);
    res.status(502).json({ error: 'razorpay_order_creation_failed' });
  }
});

// ==========================================
// 4. THE HEADLESS BRIDGE PAGE — now driven by a real DB order, not an ad-hoc one
// ==========================================
app.get('/checkout/:orderId', async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.orderId },
    include: { product: true },
  });
  if (!order) return res.status(404).send('Order not found');
  if (!order.razorpayOrderId) return res.status(409).send('Order has no Razorpay order attached');

  const html = `<!DOCTYPE html>
<html><body>
  <p>Completing test payment for ${order.product.name}...</p>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var options = {
      key: "${process.env.RAZORPAY_KEY_ID}",
      amount: "${order.amountInPaise}",
      currency: "INR",
      name: "Gofer / Meera's Store",
      description: ${JSON.stringify(order.product.name)},
      order_id: "${order.razorpayOrderId}",
      callback_url: "http://localhost:${PORT}/api/payments/verify",
      redirect: true,
      config: {
        display: {
          blocks: { cardBlock: { name: "Pay via Card", instruments: [{ method: "card" }] } },
          sequence: ["block.cardBlock"],
          preferences: { show_default_blocks: false }
        }
      },
      prefill: { name: "Rohan Test", email: "rohan@example.com" }
    };
    var rzp = new Razorpay(options);
    rzp.open();
    rzp.on('payment.failed', function (r) { console.error('Payment failed:', r.error); });
  </script>
</body></html>`;
  res.send(html);
});

// ==========================================
// 5. POST /api/payments/verify — promoted from stub to real
// ==========================================
app.post('/api/payments/verify', async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');
  const verified = signaturesMatch(expected, razorpay_signature);

  const order = await prisma.order.findFirst({ where: { razorpayOrderId: razorpay_order_id } });

  if (verified && order) {
    // Idempotent the other direction: if the webhook already got here first, don't duplicate.
    if (order.status !== 'PAID') {
      await prisma.$transaction([
        prisma.order.update({
          where: { id: order.id },
          data: { status: 'PAID', razorpayPaymentId: razorpay_payment_id },
        }),
        prisma.auditLog.create({
          data: {
            orderId: order.id,
            action: 'PAYMENT_SUCCESS',
            reasoning: `Signature independently verified against key_secret for payment ${razorpay_payment_id}.`,
            metadata: { source: 'verify_callback', paymentId: razorpay_payment_id },
          },
        }),
      ]);
    }
    console.log(`✅ [VERIFY] Signature verified for order ${razorpay_order_id}`);
    return res.send('<h2>Payment Verified successfully</h2>');
  }

  if (order) {
    await prisma.auditLog.create({
      data: {
        orderId: order.id,
        action: 'PAYMENT_FAILED',
        reasoning: `Signature mismatch on capture attempt for order ${razorpay_order_id} — payment NOT marked PAID.`,
        metadata: { source: 'verify_callback' },
      },
    });
  }
  console.error(`❌ [VERIFY] Signature mismatch for order ${razorpay_order_id}`);
  res.status(400).send('Signature mismatch');
});

app.listen(PORT, () => {
    console.log(`Merchant server running on http://localhost:${PORT}`);
    console.log(`Budget wall: MAX_BUDGET_PAISE=${MAX_BUDGET_PAISE} (₹${MAX_BUDGET_PAISE / 100})`);
  });
  
  // Keep-alive: guarantees the event loop never empties, so the server stays up.
  setInterval(() => {}, 1 << 30);