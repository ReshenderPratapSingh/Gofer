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
const path = require('path');

const BRIDGE_URL = process.env.BRIDGE_URL || 'http://localhost:4000/checkout/test';
const TEST_CARD_NUMBER = '5267318187975449';
const TEST_CARD_EXPIRY = '12/30';
const TEST_CARD_CVV = '123';
const TEST_CARD_NAME = 'Rohan Test';

// Razorpay doesn't publish a stable DOM for automation, so these are
// best-informed candidates, not guarantees. The script tries each in turn
// and, if none hit, dumps the real markup to a file instead of failing
// blind — so a miss costs you one run, not another blind guess.
const NUMBER_SELECTORS = ['input[name="card[number]"]', 'input#card_number', 'input[placeholder*="Card Number" i]', 'input[autocomplete="cc-number"]'];
const EXPIRY_SELECTORS = ['input[name="card[expiry]"]', 'input#card_expiry', 'input[placeholder*="MM" i]', 'input[placeholder*="Expiry" i]', 'input[autocomplete="cc-exp"]'];
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
    const dir = path.join(__dirname, 'debug');
    fs.mkdirSync(dir, { recursive: true });
    // This dynamically targets automation/debug/ relative to this script
    const screenshotPath = path.join(__dirname, 'debug', `debug-${label}.png`);
    const htmlPath = path.join(__dirname, 'debug', `debug-${label}-frame.html`);

    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    if (frame) {
      const html = await frame.content();
      fs.writeFileSync(htmlPath, html);
      console.log(`\n🔎 Saved debug-${label}.png and debug-${label}-frame.html to automation/debug/`);
    } else {
      console.log(`\n🔎 Saved debug-${label}.png to automation/debug/`);
    }
  } catch (e) {
    console.log('Could not save debug artifacts:', e.message);
  }
}

async function clickButtonByText(frame, text) {
  const buttons = await frame.$$('button');
  for (const btn of buttons) {
    const info = await frame.evaluate(el => {
      const rect = el.getBoundingClientRect();
      return { text: el.textContent.trim(), visible: rect.width > 0 && rect.height > 0 && !el.disabled };
    }, btn);
    if (info.text === text && info.visible) {
      try {
        await btn.click();
      } catch (e) {
        // Puppeteer's clickable-point check can be too strict for a button
        // mid-transition; fall back to a raw in-page DOM click.
        await btn.evaluate(node => node.click());
      }
      return true;
    }
  }
  return false;
}

async function findFieldInAnyFrame(page, selector, timeoutMs = 10000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    for (const f of page.frames()) {
      const el = await f.$(selector).catch(() => null);
      if (el) return { frame: f, el };
    }
    await new Promise(r => setTimeout(r, 300));
  }
  return null;
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
    
    console.log('3b. Handling contact-details screen (if shown)...');
    const contactInput = await frame.$('input[name="contact"]');
    if (contactInput) {
      await contactInput.click({ clickCount: 3 }); // clear any stale value first
      await contactInput.type('9876543211', { delay: 50 });
    
      const clicked = await clickButtonByText(frame, 'Continue');
      if (!clicked) {
        await debugDump(page, frame, 'no-continue-button');
        throw new Error('Contact form appeared but no Continue button was found — see debug-no-continue-button-frame.html');
      }
    
      await new Promise(r => setTimeout(r, 1500)); // let the SPA transition screens
    
      // Best-effort, UNVERIFIED: some flows add a mobile-OTP step after Continue.
      // Test mode usually doesn't send a real SMS and often accepts any code —
      // but I haven't seen this fire, so if it blocks you, send me the dump.
      const otpInput = await frame.$('input[name="otp"], input[data-testid="otp"]');
      if (otpInput) {
        await otpInput.type('0000', { delay: 50 });
        await ((await clickButtonByText(frame, 'Continue')) || (await clickButtonByText(frame, 'Verify')));
        await new Promise(r => setTimeout(r, 1500));
      }
    } else {
      console.log('   No contact-details screen shown — continuing.');
    }

    console.log('3c. Selecting the Cards payment option...');
    try {
      await frame.waitForSelector('::-p-text(Cards)', { timeout: 8000 });
      await frame.click('::-p-text(Cards)');
      await new Promise(r => setTimeout(r, 1000));
    } catch (e) {
      console.log('   No separate "Cards" option screen shown — continuing directly.');
    }

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
    if (name) {
      await name.el.click({ clickCount: 3 }); // select existing value first
      await name.el.type(TEST_CARD_NAME, { delay: 50 });
    }

    console.log('5. Submitting payment...');
    const submitted = (await clickButtonByText(frame, 'Continue')) || (await clickButtonByText(frame, 'Pay'));
    if (!submitted) {
      await debugDump(page, frame, 'pay-button');
      throw new Error('Could not find the Continue/Pay button — see debug-pay-button-frame.html');
    }

    // Submitting the card does NOT navigate the top-level page yet — Razorpay
    // shows a "Save card?" interstitial and/or an OTP (simulated bank auth)
    // screen first. The real callback_url redirect only happens after those.
    await new Promise(r => setTimeout(r, 1500));

    console.log('5b. Handling "Save card?" prompts (if shown)...');
    const declinedSave1 = await clickButtonByText(frame, 'No, thanks');
    if (declinedSave1) await new Promise(r => setTimeout(r, 1000));
    
    const declinedSave2 = await clickButtonByText(frame, 'Maybe later');
    if (declinedSave2) await new Promise(r => setTimeout(r, 1000));

    console.log('5c. Handling OTP screen (if shown)...');
    const otpMatch = await findFieldInAnyFrame(page, 'input[placeholder*="OTP" i]', 10000);
    if (otpMatch) {
      await otpMatch.el.type('123456', { delay: 50 }); // test mode: content isn't validated, any value completes the flow
      const otpSubmitted =
        (await clickButtonByText(otpMatch.frame, 'Continue')) ||
        (await clickButtonByText(otpMatch.frame, 'Submit')) ||
        (await clickButtonByText(otpMatch.frame, 'Verify'));
      if (!otpSubmitted) {
        await debugDump(page, otpMatch.frame, 'otp-submit-button');
        throw new Error('OTP field appeared but no submit button was found — see debug-otp-submit-button-frame.html');
      }
      await new Promise(r => setTimeout(r, 1500));
    } else {
      console.log('   No OTP screen shown — continuing.');
    }
    
    console.log('6. Waiting for callback_url navigation...');
    const startNav = Date.now();
    let navigated = false;
    while (Date.now() - startNav < 30000) {
      if (page.url().includes('/api/payments/verify')) {
        navigated = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 500));
    }

    if (!navigated) {
      try {
        await page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 5000 });
      } catch (_) {
        // Handled below by checking URL and bodyText
      }
    }

    const finalUrl = page.url();
    const bodyText = await page.evaluate(() => document.body.innerText).catch(() => '');
    console.log('\n7. Landed on callback page:', finalUrl);
    console.log(bodyText);

    if (bodyText.includes('Payment Verified successfully')) {
      console.log('\n✅ Headless capture verified end-to-end.');
    } else {
      console.log('\n⚠️  Reached the callback page but verification did not read true — check the bridge server logs.');
      process.exitCode = 1;
    }

  } catch (err) {
    console.error('\n❌ Headless execution failed:', err.message);
    process.exitCode = 1;
  } finally {
    console.log('\nClosing browser in 5 seconds...');
    await new Promise((r) => setTimeout(r, 5000));
    await browser.close();
    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  }
}

run();