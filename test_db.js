const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function test() {
  try {
    const user = await prisma.user.findFirst();
    console.log("Success! user:", user ? user.email : "none");
  } catch(e) {
    console.error("Failed:", e);
  } finally {
    await prisma.$disconnect();
  }
}
test();
