import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET() {
  const prodOrders = await prisma.productionOrder.findMany({
    where: { status: 'COMPLETED' },
    select: { id: true, displayId: true, customOrderId: true }
  });
  
  const customInventory = await prisma.customOrderInventory.findMany({
    include: { customOrder: true, productionOrder: true }
  });

  return NextResponse.json({ prodOrders, customInventory });
}
