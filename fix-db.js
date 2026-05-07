const { PrismaClient } = require('@prisma/client');
require('dotenv').config({ path: '.env.local' });

async function main() {
  const prisma = new PrismaClient();
  
  // Find PRD-0004
  const order = await prisma.productionOrder.findUnique({
    where: { displayId: 'PRD-0004' }
  });
  
  if (order && order.customOrderId) {
    // Update order scrapQty to 0
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { scrapQty: 0 }
    });
    
    // Create CustomOrderInventory
    await prisma.customOrderInventory.create({
      data: {
        customOrderId: order.customOrderId,
        productionOrderId: order.id,
        productId: order.finishedProductId,
        quantity: order.actualQty, // which is 1
        status: 'READY',
        notes: `Finished from ${order.displayId}`,
        unitCost: order.costPerUnit,
        totalCost: order.costPerUnit * order.actualQty
      }
    });
    
    console.log('Fixed PRD-0004 and created CustomOrderInventory');
  }
  
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
