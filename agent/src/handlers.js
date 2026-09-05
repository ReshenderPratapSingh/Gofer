// agent/src/handlers.js
//
// The actual JS functions behind each tool Gemini can call. Each returns a
// plain object that gets fed back to Gemini as the function's response.

const readline = require('readline');
const { spawn } = require('child_process');
const path = require('path');
const { getProducts, createOrder, logAudit, MERCHANT_BASE_URL } = require('./merchantClient');

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase());
    });
  });
}

async function searchProducts({ query }) {
  const all = await getProducts();
  const matches = query
    ? all.filter(
        (p) =>
          p.name.toLowerCase().includes(query.toLowerCase()) ||
          (p.description || '').toLowerCase().includes(query.toLowerCase())
      )
    : all;

  // Deterministic, code-generated reasoning — not model-supplied — since
  // search_products itself takes no reasoning param per spec.
  await logAudit({
    action: 'SEARCH',
    reasoning: query
      ? `Searched catalog for "${query}" — found ${matches.length} matching product(s).`
      : `Fetched full catalog — ${matches.length} product(s) available.`,
    metadata: { query: query || null, resultCount: matches.length },
  });

  return { products: matches };
}

async function placeOrder({ productId, agentReasoning }) {
  const { ok, status, data } = await createOrder({ productId, agentReasoning });
  if (!ok) {
    // The merchant already wrote its own REFUSAL audit row for a budget
    // rejection — nothing more for the agent to log here.
    return { success: false, status, ...data };
  }
  return { success: true, ...data };
}

async function requestHumanApproval({ itemName, amountPaise, agentReasoning }) {
  await logAudit({
    action: 'APPROVAL_REQUESTED',
    reasoning: agentReasoning,
    metadata: { itemName, amountPaise },
  });

  const rupees = (amountPaise / 100).toLocaleString('en-IN');
  const answer = await ask(`\nGofer wants to buy ${itemName} for ₹${rupees}. Approve? (y/n) `);
  const approved = answer === 'y' || answer === 'yes';

  await logAudit({
    action: approved ? 'APPROVAL_GRANTED' : 'APPROVAL_DENIED',
    reasoning: approved
      ? `Rohan approved the ₹${rupees} purchase of ${itemName}.`
      : `Rohan declined the ₹${rupees} purchase of ${itemName}.`,
    metadata: { itemName, amountPaise },
  });

  return { approved };
}

async function completePayment({ orderId }) {
  const checkoutUrl = `${MERCHANT_BASE_URL}/checkout/${orderId}`;
  const scriptPath = path.resolve(__dirname, '..', '..', 'automation', 'headlessCheckout.js');

  console.log(`\n💳 Handing off to Phase 2's automation for ${checkoutUrl} ...\n`);

  return new Promise((resolve) => {
    const child = spawn('node', [scriptPath], {
      cwd: path.dirname(scriptPath),
      env: { ...process.env, BRIDGE_URL: checkoutUrl },
      stdio: 'inherit', // let the live automation log print to this same terminal
    });
    child.on('exit', (code) => {
      resolve({ completed: code === 0, exitCode: code });
    });
    child.on('error', (err) => {
      resolve({ completed: false, error: err.message });
    });
  });
}

async function abortTransaction({ reason }) {
  console.log(`\n🛑 Gofer is aborting: ${reason}`);
  return { aborted: true, reason };
}

const handlers = {
  search_products: searchProducts,
  place_order: placeOrder,
  request_human_approval: requestHumanApproval,
  complete_payment: completePayment,
  abort_transaction: abortTransaction,
};

module.exports = { handlers };
