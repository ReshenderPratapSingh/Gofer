require('dotenv').config();
const { Pool } = require('pg');
const { PrismaPg } = require('@prisma/adapter-pg');
const { PrismaClient } = require('@prisma/client');

const connectionString = process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("Seeding Meera's Furniture Store...");

  await prisma.product.deleteMany(); // Reset catalog to avoid duplicates

  const products = await prisma.product.createMany({
    data: [
      // Comfortably Under Budget (₹9,000 limit)
      { name: "Basic Polypropylene Study Chair", description: "Simple, armless study chair.", priceInPaise: 250000 },  // ₹2,500
      { name: "Fabric Desk Chair", description: "Padded fabric chair with wheels.", priceInPaise: 450000 },          // ₹4,500
      { name: "Mesh Task Chair", description: "Breathable mesh back with standard lumbar support.", priceInPaise: 680000 }, // ₹6,800
      { name: "Minimalist Wood Stool", description: "Backless wooden stool.", priceInPaise: 150000 },                // ₹1,500
      
      // Right at the Edge (₹8,900 - ₹9,000)
      { name: "ErgoPro High-Back Study Chair", description: "High-back chair with neck rest.", priceInPaise: 890000 }, // ₹8,900
      { name: "Premium Velvet Office Chair", description: "Stylish velvet upholstery.", priceInPaise: 899000 },        // ₹8,990

      // Clearly Over Budget (To test the wall/stumble)
      { name: "Executive Leather Recliner", description: "Plush leather executive chair.", priceInPaise: 1450000 },    // ₹14,500
      { name: "Zero-Gravity Gaming Chair", description: "Immersive seating with built-in massage.", priceInPaise: 3200000 }, // ₹32,000
      { name: "Herman Miller Aeron (Refurbished)", description: "The gold standard.", priceInPaise: 4500000 }          // ₹45,000
    ]
  });

  console.log(`✅ Successfully seeded ${products.count} chair-adjacent products.`);
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