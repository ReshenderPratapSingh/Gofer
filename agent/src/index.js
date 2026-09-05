// agent/src/index.js
//
// The core orchestration loop: takes a natural-language request, sends it
// to Gemini with Gofer's tools, dispatches whichever tool Gemini calls,
// feeds the result back, and repeats until a terminal state is reached
// (paid, aborted, or approval denied). Every step prints to the console —
// this doubles as the live demo output.

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { toolDeclarations } = require('./tools');
const { handlers } = require('./handlers');

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in agent/.env');
  process.exit(1);
}


const BUDGET_PAISE_FOR_PROMPT = Number(process.env.BUDGET_PAISE_FOR_PROMPT || 900000);
const BUDGET_RUPEES_FOR_PROMPT = (BUDGET_PAISE_FOR_PROMPT / 100).toLocaleString('en-IN');

const SYSTEM_INSTRUCTION = `You are Gofer, an autonomous AI shopping agent acting on behalf of Rohan. Rohan gives you a natural-language purchase request (e.g. "get me a study chair under ₹9,000, delivered this week"). Find the best matching product in Meera's catalog and buy it — autonomously, but never carelessly.

Budget context: Rohan's request implies a spending ceiling of roughly ₹${BUDGET_RUPEES_FOR_PROMPT}. Treat this as informational context for your own reasoning, not something you enforce yourself — the merchant's server independently rejects any order over its own actual configured ceiling regardless of what you decide here. Still, avoid attempting a purchase you already know is over budget; every place_order call that gets rejected wastes a turn.

Decision policy — follow this exactly, every time:
1. Call search_products to see what's actually available.
2. If the best matching product is clearly priced above what Rohan asked for, call abort_transaction directly. Do NOT call place_order "just to check" — the merchant will reject it, and that's a wasted turn, not new information.
3. If the best matching product is within budget, you MUST call request_human_approval BEFORE calling place_order — every single time, no matter how small or obviously affordable the amount is. This is never optional.
4. Only call place_order if request_human_approval returned approved: true. If it returned approved: false, do not retry and do not ask again — call abort_transaction noting Rohan declined, and stop.
5. After place_order succeeds, call complete_payment with the returned orderId to actually pay.
6. Every reasoning/reason argument you supply must be a genuine, specific, plain-English explanation of your actual reasoning — never a placeholder like "N/A" or "testing."

No tool available to you can change the merchant's spending ceiling. Do not attempt to invent such a parameter.`;
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

async function runTool(name, args) {
  const handler = handlers[name];
  if (!handler) throw new Error(`No handler registered for tool "${name}"`);
  return handler(args || {});
}

async function main() {
  const userRequest = process.argv.slice(2).join(' ') || 'Get me a study chair under ₹9,000, delivered this week.';

  console.log(`\n🧑 Rohan: "${userRequest}"`);

  const chat = ai.chats.create({
    model: process.env.GEMINI_MODEL || 'gemini-3.6-flash',
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: toolDeclarations }],
    },
  });

  let response = await chat.sendMessage({ message: userRequest });

  let terminal = false;

  while (!terminal) {
    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      if (response.text) console.log(`\n🤖 Gofer: ${response.text}`);
      break;
    }

    const functionResponseParts = [];

    for (const call of calls) {
      console.log(`\n🔧 Gofer calls ${call.name}(${JSON.stringify(call.args)})`);
      let output;
      try {
        output = await runTool(call.name, call.args);
      } catch (err) {
        console.error(`   ❌ Tool threw: ${err.message}`);
        output = { error: err.message };
      }
      console.log(`   → ${JSON.stringify(output)}`);

      functionResponseParts.push({
        functionResponse: { name: call.name, response: output },
      });

      if (call.name === 'abort_transaction') terminal = true;
      if (call.name === 'request_human_approval' && output.approved === false) terminal = true;
      if (call.name === 'complete_payment') terminal = true; // demo ends after the payment attempt either way
    }

    if (terminal) break;

    response = await chat.sendMessage({ message: functionResponseParts });
  }

  console.log('\n✅ Run complete.\n');
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
