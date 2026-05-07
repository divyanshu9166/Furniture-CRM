const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const prisma = new PrismaClient();
  const count = await prisma.customOrderInventory.count();
  console.log('CustomOrderInventory count:', count);
  
  const items = await prisma.customOrderInventory.findMany({
    include: { customOrder: true, productionOrder: true }
  });
  console.log(JSON.stringify(items, null, 2));
  
  const prodOrders = await prisma.productionOrder.findMany({
    where: { customOrderId: { not: null } }
  });
  console.log('\nProduction Orders with customOrderId:');
  console.log(JSON.stringify(prodOrders, null, 2));
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
