import { prisma } from './lib/db';

async function main() {
  const order = await prisma.productionOrder.findUnique({
    where: { displayId: 'PRD-0004' }
  });
  
  if (order && order.customOrderId) {
    await prisma.productionOrder.update({
      where: { id: order.id },
      data: { scrapQty: 0 }
    });
    
    await prisma.customOrderInventory.create({
      data: {
        customOrderId: order.customOrderId,
        productionOrderId: order.id,
        productId: order.finishedProductId,
        quantity: order.actualQty,
        status: 'READY',
        notes: `Finished from ${order.displayId}`,
        unitCost: order.costPerUnit,
        totalCost: order.costPerUnit * order.actualQty
      }
    });
    console.log('Fixed PRD-0004!');
  } else {
    console.log('PRD-0004 not found or has no customOrderId');
  }
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
