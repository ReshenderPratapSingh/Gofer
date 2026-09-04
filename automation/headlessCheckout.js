// automation/headlessCheckout.js
//
// Phase 2: drives the real Razorpay Checkout (via merchant/src/checkoutBridge.js)
// end-to-end with zero human interaction, using a real Razorpay test card.
//
// Prereqs:
//   1. merchant/src/checkoutBridge.js running in another terminal
//   2. Inside automation/:  npm install puppeteer
//      (plain `puppeteer`, not `puppeteer-core` — puppeteer bundles Chromium
//      so you don't have to manage an executablePath yourself. If your
//      package.json currently has puppeteer-core, swap it.)
//
// Run: node headlessCheckout.js

const puppeteer = require('puppeteer');
const fs = require('fs');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:4000/checkout/test';
const TEST_CARD_NUMBER = '4111111111111111';
const TEST_CARD_EXPIRY = '12/30';
const TEST_CARD_CVV = '123';
const TEST_CARD_NAME = 'Rohan Test';

// Razorpay doesn't publish a stable DOM for automation, so these are
// best-informed candidates, not guarantees. The script tries each in turn
// and, if none hit, dumps the real markup to a file instead of failing
// blind — so a miss costs you one run, not another blind guess.
const NUMBER_SELECTORS = ['input[name="card[number]"]', 'input#card_number', 'input[placeholder*="Card Number" i]', 'input[autocomplete="cc-number"]'];
const EXPIRY_SELECTORS = ['input[name="card[expiry]"]', 'input#card_expiry', 'input[placeholder*="Expiry" i]', 'input[autocomplete="cc-exp"]'];
const CVV_SELECTORS = ['input[name="card[cvv]"]', 'input#card_cvv', 'input[placeholder*="CVV" i]', 'input[autocomplete="cc-csc"]'];
const NAME_SELECTORS = ['input[name="card[name]"]', 'input#card_name', 'input[placeholder*="Name on Card" i]', 'input[autocomplete="cc-name"]'];
const PAY_BUTTON_SELECTORS = ['button[type="submit"]', 'button.razorpay-payment-button', '#footer button'];

async function findFirstMatch(frame, selectors, timeoutMs = 3000) {
  for (const sel of selectors) {
    try {
      const el = await frame.waitForSelector(sel, { timeout: timeoutMs });
      if (el) return { el, sel };
    } catch (_) {
      // try next candidate
    }
  }
  return null;
}

async function waitForRazorpayFrame(page, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const frame = page.frames().find(f =>
      f.url().includes('api.razorpay.com') || f.url().includes('checkout.razorpay.com')
    );
    if (frame) return frame;
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
}

async function debugDump(page, frame, label) {
  try {
    await page.screenshot({ path: `debug-${label}.png`, fullPage: true });
    if (frame) {
      const html = await frame.content();
      fs.writeFileSync(`debug-${label}-frame.html`, html);
      console.log(`\n🔎 Saved debug-${label}.png and debug-${label}-frame.html — open the html and search for "input" to find the real field names/ids.`);
    } else {
      console.log(`\n🔎 Saved debug-${label}.png`);
    }
  } catch (e) {
    console.log('Could not save debug artifacts:', e.message);
  }
}

async function run() {
  console.log('1. Launching browser (headless mode off for debugging)...');
  const browser = await puppeteer.launch({
    headless: false, // flip to true once this is reliable
    args: ['--disable-blink-features=AutomationControlled'],
  });
  const page = await browser.newPage();
  await page.evaluateOnNewDocument(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  try {
    console.log('2. Navigating to bridge page...');
    await page.goto(BRIDGE_URL, { waitUntil: 'networkidle0' });

    console.log('3. Waiting for Razorpay iframe...');
    const frame = await waitForRazorpayFrame(page);
    if (!frame) {
      await debugDump(page, null, 'no-iframe');
      throw new Error('Razorpay iframe never attached — the modal likely never opened. Check the bridge page for a Razorpay init error (open BRIDGE_URL in a real browser tab to see it).');
    }
    console.log(`   Found iframe: ${frame.url()}`);

    console.log('4. Filling card details...');
    const number = await findFirstMatch(frame, NUMBER_SELECTORS);
    if (!number) { await debugDump(page, frame, 'number-field'); throw new Error('Could not find card number field — see debug-number-field-frame.html'); }
    await number.el.type(TEST_CARD_NUMBER, { delay: 50 });

    const expiry = await findFirstMatch(frame, EXPIRY_SELECTORS);
    if (!expiry) { await debugDump(page, frame, 'expiry-field'); throw new Error('Could not find expiry field — see debug-expiry-field-frame.html'); }
    await expiry.el.type(TEST_CARD_EXPIRY, { delay: 50 });

    const cvv = await findFirstMatch(frame, CVV_SELECTORS);
    if (!cvv) { await debugDump(page, frame, 'cvv-field'); throw new Error('Could not find CVV field — see debug-cvv-field-frame.html'); }
    await cvv.el.type(TEST_CARD_CVV, { delay: 50 });

    const name = await findFirstMatch(frame, NAME_SELECTORS, 2000);
    if (name) await name.el.type(TEST_CARD_NAME, { delay: 50 }); // optional on some forms, don't fail if absent

    console.log('5. Submitting payment...');
    const payButton = await findFirstMatch(frame, PAY_BUTTON_SELECTORS);
    if (!payButton) { await debugDump(page, frame, 'pay-button'); throw new Error('Could not find the pay/submit button — see debug-pay-button-frame.html'); }

    await Promise.all([
      page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 }),
      payButton.el.click(),
    ]);

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText);
    console.log('\n6. Landed on callback page:', finalUrl);
    console.log(bodyText);

    if (bodyText.includes('"verified": true')) {
      console.log('\n✅ Headless capture verified end-to-end.');
    } else {
      console.log('\n⚠️  Reached the callback page but verification did not read true — check the bridge server logs.');
    }
  } catch (err) {
    console.error('\n❌ Headless execution failed:', err.message);
  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await new Promise(r => setTimeout(r, 5000));
    await browser.close();
  }
}

run();