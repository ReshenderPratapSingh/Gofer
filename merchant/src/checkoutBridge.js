// merchant/src/checkoutBridge.js
//
// Phase 2 scaffold: proves a Razorpay test-mode payment can be captured
// with zero human interaction. Self-contained on purpose — doesn't depend
// on the rest of merchant/ yet. Wire it into the real app in Phase 3.
//
// Required in merchant/.env:
//   RAZORPAY_KEY_ID=rzp_test_xxx
//   RAZORPAY_KEY_SECRET=xxx
//   CHECKOUT_BRIDGE_PORT=4000   (optional, defaults to 4000)
//
// Run from inside merchant/:  node src/checkoutBridge.js

const path = require('path');
const express = require('express');
const crypto = require('crypto');
const Razorpay = require('razorpay');

// Resolve .env relative to THIS FILE's location, not the current working
// directory. This way it works identically whether you run
// `node src/checkoutBridge.js` from merchant/, or `node checkoutBridge.js`
// from inside src/, or from anywhere else. Assumes checkoutBridge.js lives
// at merchant/src/checkoutBridge.js and .env lives at merchant/.env — if
// you placed the file directly in merchant/ instead, change '..' to '.'.
const envPath = path.resolve(__dirname, '..', '.env');
const envResult = require('dotenv').config({ path: envPath });

if (envResult.error) {
  console.error(`[bridge] Could not read .env at ${envPath}:`, envResult.error.message);
} else {
  const loadedKeys = Object.keys(envResult.parsed || {});
  console.log(`[bridge] Loaded ${loadedKeys.length} var(s) from ${envPath}: ${loadedKeys.join(', ') || '(none)'}`);
}

const app = express();
app.use(express.urlencoded({ extended: true })); // Razorpay POSTs the callback as form data
app.use(express.json());

const PORT = process.env.CHECKOUT_BRIDGE_PORT || 4000;
const KEY_ID = process.env.RAZORPAY_KEY_ID;
const KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;

if (!KEY_ID || !KEY_SECRET) {
  console.error('Missing RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET in merchant/.env');
  process.exit(1);
}

const razorpay = new Razorpay({ key_id: KEY_ID, key_secret: KEY_SECRET });

// Fixed test amount for this proving-ground phase. Real dynamic pricing
// from the catalog comes in Phase 3.
const TEST_AMOUNT_PAISE = 50000; // ₹500

app.get('/checkout/test', async (req, res) => {
  try {
    const order = await razorpay.orders.create({
      amount: TEST_AMOUNT_PAISE,
      currency: 'INR',
      receipt: `gofer-test-${Date.now()}`,
    });

    console.log(`\n[bridge] Created Razorpay order ${order.id} for ₹${TEST_AMOUNT_PAISE / 100}`);
    res.send(renderCheckoutPage(order));
  } catch (err) {
    console.error('[bridge] Failed to create Razorpay order:', err);
    res.status(500).send('Failed to create order');
  }
});

function renderCheckoutPage(order) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Gofer Checkout Bridge</title></head>
<body>
  <h3>Completing test payment...</h3>
  <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
  <script>
    var options = {
      key: "${KEY_ID}",
      amount: "${order.amount}",
      currency: "${order.currency}",
      name: "Gofer Test Merchant",
      description: "Headless capture proof",
      order_id: "${order.id}",
      callback_url: "http://localhost:${PORT}/checkout/callback",
      redirect: true,
      // Restrict Checkout to a single card block so no method-selector
      // click is needed at all — the card form is the only thing that
      // renders. This is the important part: it removes an entire
      // fragile automation step instead of guessing its selector.
      config: {
        display: {
          blocks: {
            cardBlock: {
              name: "Pay via Card",
              instruments: [{ method: "card" }]
            }
          },
          sequence: ["block.cardBlock"],
          preferences: { show_default_blocks: false }
        }
      },
      prefill: {
        name: "Rohan Test",
        email: "rohan@example.com",
        contact: "9876543210"
      }
    };
    var rzp1 = new Razorpay(options);
    rzp1.open(); // opens immediately — no button click required
    rzp1.on('payment.failed', function (response) {
      console.error('Payment failed:', response.error);
    });
  </script>
</body>
</html>`;
}

// Razorpay POSTs here after a successful payment because of callback_url +
// redirect:true above. We independently recompute the signature — we never
// trust the client-side result on its own, per the actual security model.
app.post('/checkout/callback', (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  const expected = crypto
    .createHmac('sha256', KEY_SECRET)
    .update(`${razorpay_order_id}|${razorpay_payment_id}`)
    .digest('hex');

  const verified = expected === razorpay_signature;

  console.log(`\n[bridge] Callback received:`);
  console.log(`  order_id:   ${razorpay_order_id}`);
  console.log(`  payment_id: ${razorpay_payment_id}`);
  console.log(`  verified:   ${verified ? '✅ MATCH' : '❌ MISMATCH'}`);

  res.send(`<pre>${JSON.stringify({ razorpay_payment_id, razorpay_order_id, verified }, null, 2)}</pre>`);
});

app.listen(PORT, () => {
  console.log(`[bridge] Running at http://localhost:${PORT}/checkout/test`);
});