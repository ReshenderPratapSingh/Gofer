const puppeteer = require('puppeteer');

async function automateCheckout() {
    // ⚠️ PASTE THE ORDER ID YOU GENERATED EARLIER HERE
    const orderId = "order_TXgMsiA7hnF3hE";
    const amount = 50000; 

    console.log("1. Launching browser (Headless mode off for debugging)...");
    const browser = await puppeteer.launch({ headless: false, defaultViewport: null });
    const page = await browser.newPage();

    try {
        console.log("2. Navigating to bridge page...");
        await page.goto(`http://localhost:3000/checkout/${orderId}?amount=${amount}`, { waitUntil: 'networkidle0' });

        console.log("3. Waiting for Razorpay iframe...");
        // Wait for the iframe DOM element to exist
        await page.waitForFunction(() => document.querySelectorAll('iframe').length > 0);
        
        // Give the iframe a moment to render its internal content
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Grab the correct frame context
        const frame = page.frames().find(f => f.url().includes('checkout.razorpay.com') || f.url().includes('api.razorpay.com'));
        if (!frame) throw new Error("Could not find Razorpay iframe context");

        console.log("4. Selecting 'Card' payment method...");
        await frame.waitForSelector('button[method="card"]', { visible: true });
        await frame.click('button[method="card"]');

        console.log("5. Filling test card details...");
        await frame.waitForSelector('#card_number', { visible: true });
        await frame.type('#card_number', '4111111111111111', { delay: 20 });
        await frame.type('#card_expiry', '1229', { delay: 20 });
        await frame.type('#card_name', 'Gofer AI', { delay: 20 });
        await frame.type('#card_cvv', '123', { delay: 20 });

        console.log("6. Submitting payment...");
        await frame.waitForSelector('#footer-cta', { visible: true });
        await frame.click('#footer-cta');

        console.log("7. Waiting for mock bank authentication...");
        // Razorpay test cards sometimes trigger a mock bank success screen
        try {
            await page.waitForSelector('button.success', { visible: true, timeout: 10000 });
            await page.click('button.success');
            console.log("   Clicked mock bank success button.");
        } catch (e) {
            console.log("   No mock bank manual intervention required, continuing...");
        }

        console.log("8. Waiting for callback_url navigation...");
        // This confirms Razorpay successfully POSTed back to our /api/payments/verify stub
        await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
        
        console.log(`🎉 SUCCESS! Reached callback URL: ${page.url()}`);
        
    } catch (error) {
        console.error("❌ Headless execution failed:", error);
    } finally {
        console.log("Closing browser in 5 seconds...");
        setTimeout(() => browser.close(), 5000);
    }
}

automateCheckout();