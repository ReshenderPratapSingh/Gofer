// merchant/scripts/printAuditTrail.js
//
// Phase 5: prints the full AuditLog table, chronologically, joined with
// Order + Product where present — formatted to be read aloud to judges.
// Run from merchant/:  node scripts/printAuditTrail.js

require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const ACTION_WIDTH = 18; // longest action name is APPROVAL_REQUESTED (19) — close enough for alignment

async function main() {
  const logs = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'asc' },
    include: { order: { include: { product: true } } },
  });

  if (logs.length === 0) {
    console.log('No AuditLog entries yet — run Gofer at least once first.');
    return;
  }

  console.log('\n===== Gofer Audit Trail =====\n');

  for (const log of logs) {
    const time = log.createdAt.toLocaleTimeString('en-IN', { hour12: false });
    const action = log.action.padEnd(ACTION_WIDTH, ' ');

    let context = '';
    if (log.order?.product) {
      const rupees = (log.order.amountInPaise / 100).toLocaleString('en-IN');
      context = ` [${log.order.product.name}, ₹${rupees}, order ${log.order.status}]`;
    }

    console.log(`[${time}] ${action} — "${log.reasoning}"${context}`);
  }

  console.log(`\n===== ${logs.length} entries, ${new Set(logs.map((l) => l.orderId).filter(Boolean)).size} order(s) =====\n`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });