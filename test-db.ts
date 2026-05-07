import { prisma } from './lib/db';

async function main() {
  const dsCount = await prisma.customOrder.count({ where: { status: 'DESIGN_PHASE' as any } });
  if (dsCount > 0) {
    await prisma.customOrder.updateMany({
      where: { status: 'DESIGN_PHASE' as any },
      data: { status: 'MEASUREMENT_SCHEDULED' as any }
    });
    console.log(`Migrated ${dsCount} orders from DESIGN_PHASE to MEASUREMENT_SCHEDULED`);
  }
  
  const inCount = await prisma.customOrder.count({ where: { status: 'INSTALLATION' as any } });
  if (inCount > 0) {
    await prisma.customOrder.updateMany({
      where: { status: 'INSTALLATION' as any },
      data: { status: 'QUALITY_CHECK' as any }
    });
    console.log(`Migrated ${inCount} orders from INSTALLATION to QUALITY_CHECK`);
  }
  
  console.log('Migration complete');
  await prisma.$disconnect();
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
