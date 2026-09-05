// agent/src/runner.js
//
// Shared Gofer agent orchestration loop.
// Can be run by the CLI (src/index.js) with readline adapters,
// or by the HTTP SSE service (src/server.js) with session/event adapters.

require('dotenv').config();
const { GoogleGenAI } = require('@google/genai');
const { toolDeclarations } = require('./tools');
const { handlers } = require('./handlers');

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

async function runGoferAgent({
  userRequest,
  onEvent = () => {},
  askApproval,
  onProgress = () => {},
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY is not set in agent/.env');
  }

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const modelName = process.env.GEMINI_MODEL || 'gemini-3.6-flash';

  const chat = ai.chats.create({
    model: modelName,
    config: {
      systemInstruction: SYSTEM_INSTRUCTION,
      tools: [{ functionDeclarations: toolDeclarations }],
    },
  });

  let response = await chat.sendMessage({ message: userRequest });
  let terminal = false;

  const context = {
    askApproval,
    onProgress,
  };

  while (!terminal) {
    const calls = response.functionCalls;

    if (!calls || calls.length === 0) {
      if (response.text) {
        onEvent('agent_text', { text: response.text });
      }
      break;
    }

    const functionResponseParts = [];

    for (const call of calls) {
      onEvent('tool_call', { name: call.name, args: call.args });

      let output;
      const handler = handlers[call.name];
      if (!handler) {
        output = { error: `No handler registered for tool "${call.name}"` };
      } else {
        try {
          output = await handler(call.args || {}, context);
        } catch (err) {
          output = { error: err.message };
        }
      }

      onEvent('tool_result', { name: call.name, output });

      functionResponseParts.push({
        functionResponse: { name: call.name, response: output },
      });

      if (call.name === 'abort_transaction') terminal = true;
      if (call.name === 'request_human_approval' && output.approved === false) terminal = true;
      if (call.name === 'complete_payment') terminal = true; // demo ends after payment attempt
    }

    if (terminal) break;

    response = await chat.sendMessage({ message: functionResponseParts });
  }

  onEvent('run_complete', {});
  return { completed: true };
}

module.exports = { runGoferAgent, SYSTEM_INSTRUCTION };
