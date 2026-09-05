// agent/src/tools.js
//
// Gemini function-calling declarations for Gofer's five tools.
// CRITICAL (per spec): every tool that takes a reasoning/reason argument
// marks it `required` in the schema itself — not just described in prose —
// so Gemini literally cannot make the call without supplying one.
// No tool here has a parameter that could override the merchant's budget
// ceiling; that value lives only in merchant/.env.

const { Type } = require('@google/genai');

const toolDeclarations = [
  {
    name: 'search_products',
    description: "Fetches Meera's product catalog from the merchant API, optionally filtered by a keyword.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        query: {
          type: SchemaType.STRING,
          description: 'Optional keyword to filter products by name/description (e.g. "chair").',
        },
      },
      required: [],
    },
  },
  {
    name: 'place_order',
    description:
      'Creates a real order for one product via the merchant API. Only call this AFTER request_human_approval has returned approved: true for this exact item.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        productId: { type: SchemaType.STRING, description: 'The id of the product to order.' },
        agentReasoning: {
          type: SchemaType.STRING,
          description: 'Plain-language explanation of why THIS product was chosen over alternatives. Never a placeholder.',
        },
      },
      required: ['productId', 'agentReasoning'],
    },
  },
  {
    name: 'request_human_approval',
    description:
      'Pauses and asks Rohan to explicitly approve a specific purchase before any money moves. Must be called before every place_order, regardless of amount.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        itemName: { type: SchemaType.STRING, description: 'Human-readable name of the item.' },
        amountPaise: { type: SchemaType.NUMBER, description: 'Price in paise (not rupees).' },
        agentReasoning: {
          type: SchemaType.STRING,
          description: 'Why you are asking approval for this specific item at this price.',
        },
      },
      required: ['itemName', 'amountPaise', 'agentReasoning'],
    },
  },
  {
    name: 'complete_payment',
    description:
      "Drives Meera's real checkout to completion for an already-created order, headlessly. Only call this after place_order has succeeded.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        orderId: { type: SchemaType.STRING, description: 'The orderId returned by place_order.' },
      },
      required: ['orderId'],
    },
  },
  {
    name: 'abort_transaction',
    description:
      'Ends the shopping session with no further tool calls. Use this when nothing in-budget matches, or when Rohan declines approval.',
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        reason: { type: SchemaType.STRING, description: 'Plain-language reason the transaction is being aborted.' },
      },
      required: ['reason'],
    },
  },
];

module.exports = { toolDeclarations };
