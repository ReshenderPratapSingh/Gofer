// agent/src/index.js
//
// The CLI entrypoint: takes a natural-language request, uses runGoferAgent
// with standard CLI logging and readline human approval.
// Usage: node src/index.js "your request"

require('dotenv').config();
const { runGoferAgent } = require('./runner');

if (!process.env.GEMINI_API_KEY) {
  console.error('❌ GEMINI_API_KEY is not set in agent/.env');
  process.exit(1);
}

async function main() {
  const userRequest = process.argv.slice(2).join(' ') || 'Get me a study chair under ₹9,000, delivered this week.';

  console.log(`\n🧑 Rohan: "${userRequest}"`);

  await runGoferAgent({
    userRequest,
    onEvent: (type, data) => {
      if (type === 'tool_call') {
        console.log(`\n🔧 Gofer calls ${data.name}(${JSON.stringify(data.args)})`);
      } else if (type === 'tool_result') {
        console.log(`   → ${JSON.stringify(data.output)}`);
      } else if (type === 'agent_text') {
        console.log(`\n🤖 Gofer: ${data.text}`);
      } else if (type === 'run_complete') {
        console.log('\n✅ Run complete.\n');
      }
    },
  });
}

main().catch((err) => {
  console.error('\n❌ Fatal error:', err);
  process.exit(1);
});
