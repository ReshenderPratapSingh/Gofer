require('dotenv').config();
const express = require('express');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// 1. THE WEBHOOK (Must be raw for HMAC verification)
// ==========================================
app.post('/webhook/razorpay', express.raw({ type: 'application/json' }), (req, res) => {
    // IMPORTANT: Use the Webhook Secret here, NOT the Key Secret
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET; 
    const signature = req.headers['x-razorpay-signature'];

    if (!signature) return res.status(400).send("No signature provided");

    const expectedSignature = crypto.createHmac('sha256', secret)
        .update(req.body) // Verifying against the raw buffer
        .digest('hex');

    if (expectedSignature === signature) {
        const event = JSON.parse(req.body);
        if (event.event === 'payment.captured') {
            console.log(`✅ [WEBHOOK FIRED] payment.captured verified for payment: ${event.payload.payment.entity.id}`);
        }
        res.status(200).json({ status: 'ok' });
    } else {
        console.error("❌ [WEBHOOK FIRED] Signature mismatch!");
        res.status(400).send("Invalid signature");
    }
});

// Parse JSON and URL-encoded bodies for standard routes moving forward
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Razorpay callback submits as urlencoded

// ==========================================
// 2. THE HEADLESS BRIDGE PAGE
// ==========================================
app.get('/checkout/:orderId', (req, res) => {
    const orderId = req.params.orderId;
    const amount = req.query.amount || 50000; 
    
    const html = `
    <!DOCTYPE html>
    <html>
    <body>
      <p>Initializing Razorpay...</p>
      <script src="https://checkout.razorpay.com/v1/checkout.js"></script>
      <script>
        const options = {
            "key": "${process.env.RAZORPAY_KEY_ID}",
            "amount": "${amount}",
            "currency": "INR",
            "name": "Meera's Store (Headless Bridge)",
            "order_id": "${orderId}",
            // ADD THIS PREFILL BLOCK:
            "prefill": {
                "contact": "9999999999",
                "email": "gofer@example.com"
            },
            // Razorpay will natively POST to this URL on success
            "callback_url": "http://localhost:${PORT}/api/payments/verify",
            "redirect": true
        };
        const rzp = new Razorpay(options);
        window.onload = function() {
            rzp.open();
        };
      </script>
    </body>
    </html>
    `;
    res.send(html);
});

// ==========================================
// 3. THE CALLBACK VERIFY STUB
// ==========================================
app.post('/api/payments/verify', (req, res) => {
    const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;
    
    const text = razorpay_order_id + "|" + razorpay_payment_id;
    // IMPORTANT: Use the Key Secret here, NOT the Webhook Secret
    const expectedSignature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(text)
        .digest('hex');

    if (expectedSignature === razorpay_signature) {
        console.log(`✅ [STUB VERIFY] Razorpay signature securely verified for Order: ${razorpay_order_id}`);
        res.send("<h2>Payment Verified successfully</h2><p>Puppeteer can close the browser now.</p>");
    } else {
        console.error("❌ [STUB VERIFY] Signature mismatch on capture attempt!");
        res.status(400).send("Signature mismatch");
    }
});

app.listen(PORT, () => {
    console.log(`Merchant server running on http://localhost:${PORT}`);
});