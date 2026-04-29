import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import pg from 'pg'
import bcrypt from 'bcryptjs'

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool as any)
const prisma = new PrismaClient({ adapter })

async function main() {
  console.log('🌱 Seeding database...\n')

  // ─── STORE SETTINGS ─────────────────────────────────
  console.log('  → Store settings')
  await prisma.storeSettings.upsert({
    where: { id: 1 },
    update: {},
    create: {
      id: 1,
      storeName: 'Furniture Store',
      phone: '+91 98765 43210',
      email: 'info@furniturecrm.com',
      address: 'MG Road, Koramangala, Bangalore - 560034',
      gstNumber: '29ABCDE1234F1Z5',
      gstRate: 18.0,
      currency: 'INR',
    },
  })

  // ─── CATEGORIES & WAREHOUSES ────────────────────────
  console.log('  → Categories & warehouses')
  const categoryNames = ['Sofas', 'Beds', 'Dining', 'Storage', 'Chairs', 'Living Room', 'Bedroom', 'Kitchen']
  const categories: Record<string, any> = {}
  for (const name of categoryNames) {
    categories[name] = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name },
    })
  }

  const warehouseNames = ['Main Store', 'Warehouse B']
  const warehouses: Record<string, any> = {}
  for (const name of warehouseNames) {
    warehouses[name] = await prisma.warehouse.upsert({
      where: { name },
      update: {},
      create: { name, address: name === 'Main Store' ? 'MG Road, Koramangala' : 'Electronic City, Phase 2' },
    })
  }

  // ─── PRODUCTS ───────────────────────────────────────
  console.log('  → Products')
  const productsData = [
    { sku: 'SOF-001', name: 'Royal L-Shaped Sofa', category: 'Sofas', price: 45000, stock: 8, sold: 34, reorderLevel: 5, image: '🛋️', material: 'Fabric', color: 'Grey', description: 'Premium L-shaped sofa with foam cushioning', warehouse: 'Main Store', lastRestocked: '2026-03-10' },
    { sku: 'BED-001', name: 'Milano King Bed', category: 'Beds', price: 62000, stock: 5, sold: 28, reorderLevel: 3, image: '🛏️', material: 'Sheesham Wood', color: 'Walnut', description: 'King size bed with hydraulic storage', warehouse: 'Main Store', lastRestocked: '2026-03-08' },
    { sku: 'DIN-001', name: 'Marble Dynasty Dining Set', category: 'Dining', price: 38000, stock: 3, sold: 22, reorderLevel: 3, image: '🪑', material: 'Marble + Metal', color: 'White', description: '6-seater dining table with marble top', warehouse: 'Warehouse B', lastRestocked: '2026-03-05' },
    { sku: 'SOF-003', name: 'Executive Recliner Pro', category: 'Sofas', price: 72000, stock: 2, sold: 15, reorderLevel: 3, image: '💺', material: 'Leather', color: 'Brown', description: 'Premium leather recliner with USB charging', warehouse: 'Main Store', lastRestocked: '2026-02-28' },
    { sku: 'STO-001', name: 'SlideMax 3-Door Wardrobe', category: 'Storage', price: 55000, stock: 6, sold: 19, reorderLevel: 4, image: '🚪', material: 'Engineered Wood', color: 'White', description: '3-door sliding wardrobe with full mirror', warehouse: 'Warehouse B', lastRestocked: '2026-03-12' },
    { sku: 'CHR-001', name: 'ErgoMesh Office Chair', category: 'Chairs', price: 14500, stock: 15, sold: 45, reorderLevel: 8, image: '🪑', material: 'Mesh + Metal', color: 'Black', description: 'Ergonomic office chair with lumbar support', warehouse: 'Main Store', lastRestocked: '2026-03-15' },
    { sku: 'STO-002', name: 'Woody Wall Bookshelf', category: 'Storage', price: 22000, stock: 10, sold: 18, reorderLevel: 5, image: '📚', material: 'Sheesham Wood', color: 'Honey', description: 'Wall-mounted bookshelf, 5 tiers', warehouse: 'Warehouse B', lastRestocked: '2026-03-14' },
    { sku: 'SOF-002', name: 'ComfyFold Sofa Bed', category: 'Sofas', price: 32000, stock: 4, sold: 21, reorderLevel: 4, image: '🛋️', material: 'Fabric + Metal', color: 'Navy Blue', description: 'Convertible sofa cum bed, 3-seater', warehouse: 'Main Store', lastRestocked: '2026-03-06' },
    { sku: 'LIV-001', name: 'Crystal TV Unit', category: 'Living Room', price: 28000, stock: 7, sold: 26, reorderLevel: 4, image: '📺', material: 'Engineered Wood', color: 'Walnut', description: 'TV unit with LED backlight panel', warehouse: 'Main Store', lastRestocked: '2026-03-11' },
    { sku: 'BDR-001', name: 'GlowUp Dressing Table', category: 'Bedroom', price: 18500, stock: 9, sold: 31, reorderLevel: 5, image: '💄', material: 'MDF + Mirror', color: 'White', description: 'Dressing table with LED vanity mirror', warehouse: 'Main Store', lastRestocked: '2026-03-13' },
    { sku: 'BED-002', name: 'Adventure Bunk Bed', category: 'Beds', price: 42000, stock: 3, sold: 12, reorderLevel: 3, image: '🛏️', material: 'Metal + Wood', color: 'Blue', description: 'Bunk bed with built-in study table', warehouse: 'Warehouse B', lastRestocked: '2026-03-01' },
    { sku: 'LIV-002', name: 'Zenith Center Table', category: 'Living Room', price: 12500, stock: 12, sold: 38, reorderLevel: 5, image: '☕', material: 'Glass + Metal', color: 'Clear', description: 'Tempered glass center table, modern design', warehouse: 'Main Store', lastRestocked: '2026-03-15' },
    { sku: 'DIN-002', name: 'Heritage 8-Seater Dining', category: 'Dining', price: 85000, stock: 1, sold: 8, reorderLevel: 2, image: '🪑', material: 'Teak Wood', color: 'Dark Brown', description: '8-seater premium teak dining set', warehouse: 'Warehouse B', lastRestocked: '2026-02-20' },
    { sku: 'LIV-003', name: 'CloudNine Bean Bag XXL', category: 'Living Room', price: 3800, stock: 20, sold: 52, reorderLevel: 10, image: '🫘', material: 'Leatherette', color: 'Tan', description: 'XXL bean bag with refillable beans', warehouse: 'Main Store', lastRestocked: '2026-03-18' },
    { sku: 'STO-003', name: 'SoleKeeper Shoe Rack', category: 'Storage', price: 8500, stock: 14, sold: 29, reorderLevel: 6, image: '👟', material: 'Bamboo', color: 'Natural', description: '4-tier bamboo shoe organizer', warehouse: 'Main Store', lastRestocked: '2026-03-16' },
    { sku: 'BDR-002', name: 'FocusDesk Study Table', category: 'Bedroom', price: 21000, stock: 8, sold: 24, reorderLevel: 5, image: '📖', material: 'Engineered Wood', color: 'Oak', description: 'Height-adjustable desk with 3 drawers', warehouse: 'Main Store', lastRestocked: '2026-03-12' },
    { sku: 'SOF-004', name: 'Tuscan 3-Seater Sofa', category: 'Sofas', price: 38000, stock: 6, sold: 30, reorderLevel: 4, image: '🛋️', material: 'Velvet', color: 'Emerald Green', description: 'Premium velvet sofa, tufted design', warehouse: 'Main Store', lastRestocked: '2026-03-09' },
    { sku: 'BED-004', name: 'NightOwl Bedside Table', category: 'Bedroom', price: 7500, stock: 18, sold: 41, reorderLevel: 8, image: '🛏️', material: 'Pine Wood', color: 'White', description: '2-drawer bedside table, minimalist', warehouse: 'Main Store', lastRestocked: '2026-03-17' },
    { sku: 'KIT-001', name: 'ModuLux Kitchen Cabinet', category: 'Kitchen', price: 250000, stock: 0, sold: 5, reorderLevel: 1, image: '🍳', material: 'Marine Plywood', color: 'White Glossy', description: 'Full modular U-shaped kitchen', warehouse: 'Warehouse B', lastRestocked: '2026-02-15' },
    { sku: 'CHR-002', name: 'CozyNest Accent Chair', category: 'Chairs', price: 16000, stock: 11, sold: 20, reorderLevel: 5, image: '💺', material: 'Fabric + Wood', color: 'Mustard Yellow', description: 'Accent chair with wooden legs', warehouse: 'Main Store', lastRestocked: '2026-03-14' },
  ]

  const products: Record<string, any> = {}
  for (const p of productsData) {
    const product = await prisma.product.upsert({
      where: { sku: p.sku },
      update: {},
      create: {
        sku: p.sku, name: p.name, categoryId: categories[p.category].id, price: p.price,
        stock: p.stock, sold: p.sold, reorderLevel: p.reorderLevel, image: p.image,
        material: p.material, color: p.color, description: p.description,
        warehouseId: warehouses[p.warehouse].id, lastRestocked: new Date(p.lastRestocked),
      },
    })
    products[p.sku] = product
    products[p.name] = product
  }

  // ─── STAFF ──────────────────────────────────────────
  console.log('  → Staff')
  const staffData = [
    { name: 'Ravi Kumar', role: 'Senior Sales Executive', phone: '+91 98765 00001', email: 'ravi.k@furniturecrm.com', status: 'Active', joinDate: '2024-06-15', avatar: 'RK', stats: { leadsAssigned: 45, conversions: 32, revenue: 1450000, avgResponseTime: '8 min', todaySales: 2, todayRevenue: 59500, rating: 4.8, conversionRate: 71 }, target: { monthly: 500000, achieved: 385000 }, commission: { rate: 5, earned: 72500, pending: 19250 } },
    { name: 'Pooja Sharma', role: 'Sales Executive', phone: '+91 98765 00002', email: 'pooja.s@furniturecrm.com', status: 'Active', joinDate: '2024-09-01', avatar: 'PS', stats: { leadsAssigned: 38, conversions: 24, revenue: 980000, avgResponseTime: '12 min', todaySales: 1, todayRevenue: 62000, rating: 4.5, conversionRate: 63 }, target: { monthly: 400000, achieved: 298000 }, commission: { rate: 4, earned: 39200, pending: 11920 } },
    { name: 'Amit Patel', role: 'Sales Executive', phone: '+91 98765 00003', email: 'amit.p@furniturecrm.com', status: 'Active', joinDate: '2025-01-10', avatar: 'AP', stats: { leadsAssigned: 30, conversions: 18, revenue: 720000, avgResponseTime: '15 min', todaySales: 0, todayRevenue: 0, rating: 4.2, conversionRate: 60 }, target: { monthly: 350000, achieved: 210000 }, commission: { rate: 4, earned: 28800, pending: 8400 } },
    { name: 'Deepa Nair', role: 'Design Consultant', phone: '+91 98765 00004', email: 'deepa.n@furniturecrm.com', status: 'Active', joinDate: '2024-11-20', avatar: 'DN', stats: { leadsAssigned: 22, conversions: 15, revenue: 1120000, avgResponseTime: '10 min', todaySales: 0, todayRevenue: 0, rating: 4.9, conversionRate: 68 }, target: { monthly: 600000, achieved: 420000 }, commission: { rate: 6, earned: 67200, pending: 25200 } },
    { name: 'Sunil Reddy', role: 'Warehouse Manager', phone: '+91 98765 00005', email: 'sunil.r@furniturecrm.com', status: 'Active', joinDate: '2024-03-01', avatar: 'SR', stats: { leadsAssigned: 0, conversions: 0, revenue: 0, avgResponseTime: '-', todaySales: 0, todayRevenue: 0, rating: 4.6, conversionRate: 0 }, target: { monthly: 0, achieved: 0 }, commission: { rate: 0, earned: 0, pending: 0 } },
    { name: 'Meena Iyer', role: 'Junior Sales Executive', phone: '+91 98765 00006', email: 'meena.i@furniturecrm.com', status: 'Off Duty', joinDate: '2025-08-15', avatar: 'MI', stats: { leadsAssigned: 15, conversions: 8, revenue: 340000, avgResponseTime: '18 min', todaySales: 0, todayRevenue: 0, rating: 3.9, conversionRate: 53 }, target: { monthly: 200000, achieved: 98000 }, commission: { rate: 3, earned: 10200, pending: 2940 } },
  ]

  const staffMap: Record<string, any> = {}
  for (const s of staffData) {
    const staff = await prisma.staff.upsert({
      where: { email: s.email },
      update: {},
      create: {
        name: s.name, role: s.role, phone: s.phone, email: s.email, status: s.status,
        joinDate: new Date(s.joinDate), avatar: s.avatar, stats: s.stats, target: s.target, commission: s.commission,
      },
    })
    staffMap[s.name] = staff
  }

  // Staff attendance (all 6 staff, 7 days each)
  console.log('  → Staff attendance')
  const attendanceData: { staffName: string; date: string; clockIn: string | null; clockOut: string | null; hours: number | null; status: string }[] = [
    { staffName: 'Ravi Kumar', date: '2026-03-21', clockIn: '09:02', clockOut: null, hours: null, status: 'Present' },
    { staffName: 'Ravi Kumar', date: '2026-03-20', clockIn: '08:55', clockOut: '18:10', hours: 9.25, status: 'Present' },
    { staffName: 'Ravi Kumar', date: '2026-03-19', clockIn: '09:10', clockOut: '18:30', hours: 9.33, status: 'Present' },
    { staffName: 'Ravi Kumar', date: '2026-03-18', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present' },
    { staffName: 'Ravi Kumar', date: '2026-03-17', clockIn: null, clockOut: null, hours: 0, status: 'Absent' },
    { staffName: 'Ravi Kumar', date: '2026-03-16', clockIn: '09:05', clockOut: '14:00', hours: 4.92, status: 'Half Day' },
    { staffName: 'Ravi Kumar', date: '2026-03-15', clockIn: '08:50', clockOut: '18:20', hours: 9.5, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-21', clockIn: '09:15', clockOut: null, hours: null, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-20', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-19', clockIn: '09:05', clockOut: '18:15', hours: 9.17, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-18', clockIn: '09:20', clockOut: '18:00', hours: 8.67, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-17', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present' },
    { staffName: 'Pooja Sharma', date: '2026-03-16', clockIn: null, clockOut: null, hours: 0, status: 'Absent' },
    { staffName: 'Pooja Sharma', date: '2026-03-15', clockIn: '09:10', clockOut: '18:30', hours: 9.33, status: 'Present' },
    { staffName: 'Amit Patel', date: '2026-03-21', clockIn: '09:30', clockOut: null, hours: null, status: 'Present' },
    { staffName: 'Amit Patel', date: '2026-03-20', clockIn: '09:00', clockOut: '18:15', hours: 9.25, status: 'Present' },
    { staffName: 'Amit Patel', date: '2026-03-19', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present' },
    { staffName: 'Amit Patel', date: '2026-03-18', clockIn: null, clockOut: null, hours: 0, status: 'Absent' },
    { staffName: 'Amit Patel', date: '2026-03-17', clockIn: '09:15', clockOut: '18:00', hours: 8.75, status: 'Present' },
    { staffName: 'Deepa Nair', date: '2026-03-21', clockIn: '09:00', clockOut: null, hours: null, status: 'Present' },
    { staffName: 'Deepa Nair', date: '2026-03-20', clockIn: '08:45', clockOut: '18:30', hours: 9.75, status: 'Present' },
    { staffName: 'Deepa Nair', date: '2026-03-19', clockIn: '09:00', clockOut: '18:00', hours: 9.0, status: 'Present' },
    { staffName: 'Deepa Nair', date: '2026-03-18', clockIn: '09:00', clockOut: '19:00', hours: 10.0, status: 'Present' },
    { staffName: 'Deepa Nair', date: '2026-03-17', clockIn: '09:15', clockOut: '18:15', hours: 9.0, status: 'Present' },
    { staffName: 'Sunil Reddy', date: '2026-03-21', clockIn: '08:30', clockOut: null, hours: null, status: 'Present' },
    { staffName: 'Sunil Reddy', date: '2026-03-20', clockIn: '08:30', clockOut: '17:30', hours: 9.0, status: 'Present' },
    { staffName: 'Sunil Reddy', date: '2026-03-19', clockIn: '08:30', clockOut: '17:30', hours: 9.0, status: 'Present' },
    { staffName: 'Meena Iyer', date: '2026-03-21', clockIn: null, clockOut: null, hours: 0, status: 'Off Duty' },
    { staffName: 'Meena Iyer', date: '2026-03-20', clockIn: null, clockOut: null, hours: 0, status: 'Off Duty' },
    { staffName: 'Meena Iyer', date: '2026-03-19', clockIn: '09:30', clockOut: '18:00', hours: 8.5, status: 'Present' },
  ]

  for (const a of attendanceData) {
    const staffId = staffMap[a.staffName].id
    const date = new Date(a.date)
    await prisma.attendance.upsert({
      where: { staffId_date: { staffId, date } },
      update: {},
      create: { staffId, date, clockIn: a.clockIn, clockOut: a.clockOut, hours: a.hours, status: a.status },
    })
  }

  // ─── 5 CONTACTS ─────────────────────────────────────
  console.log('  → Contacts (5 customers)')
  const contactsData = [
    { name: 'Rahul Sharma', phone: '+91 98765 43210', email: 'rahul@gmail.com' },
    { name: 'Amit Kumar', phone: '+91 76543 21098', email: 'amit.k@outlook.com' },
    { name: 'Sneha Reddy', phone: '+91 65432 10987', email: 'sneha.r@yahoo.com' },
    { name: 'Vikram Singh', phone: '+91 54321 09876', email: 'vikram.s@gmail.com' },
    { name: 'Rajesh Verma', phone: '+91 65412 34567', email: 'rajesh.v@gmail.com' },
  ]

  const contacts: Record<string, any> = {}
  for (const c of contactsData) {
    const contact = await prisma.contact.upsert({
      where: { phone: c.phone },
      update: {},
      create: { name: c.name, phone: c.phone, email: c.email },
    })
    contacts[c.name] = contact
  }

  // ─── LEADS ──────────────────────────────────────────
  console.log('  → Leads')
  const leadsData = [
    { name: 'Rahul Sharma', source: 'WhatsApp', interest: 'L-Shaped Sofa', budget: '₹45,000', status: 'NEW' as const, date: '2026-03-14', notes: 'Looking for grey fabric sofa for living room', followUps: [{ day: 1, message: 'Hi Rahul, here are the L-shaped sofa options you requested.', sent: true, date: '2026-03-14' }] },
    { name: 'Amit Kumar', source: 'Website', interest: 'Dining Table Set', budget: '₹35,000', status: 'SHOWROOM_VISIT' as const, date: '2026-03-12', notes: '6-seater marble top dining set', followUps: [{ day: 1, message: 'Hi Amit, here are our 6-seater dining table options.', sent: true, date: '2026-03-12' }, { day: 3, message: 'Would you like to visit our showroom?', sent: true, date: '2026-03-14' }] },
    { name: 'Sneha Reddy', source: 'Facebook', interest: 'Wardrobe', budget: '₹55,000', status: 'QUOTATION' as const, date: '2026-03-11', notes: '3-door sliding wardrobe with mirror' },
    { name: 'Vikram Singh', source: 'WhatsApp', interest: 'Office Chair', budget: '₹15,000', status: 'WON' as const, date: '2026-03-10', notes: 'Ergonomic office chair, black mesh' },
    { name: 'Rajesh Verma', source: 'Facebook', interest: 'Modular Kitchen', budget: '₹2,50,000', status: 'QUOTATION' as const, date: '2026-03-07', notes: 'Full modular kitchen, U-shaped, white glossy' },
  ]

  for (const l of leadsData) {
    const contact = contacts[l.name]
    const lead = await prisma.lead.create({
      data: {
        contactId: contact.id, assignedToId: staffMap['Ravi Kumar'].id,
        source: l.source, interest: l.interest, budget: l.budget,
        status: l.status, date: new Date(l.date), notes: l.notes,
      },
    })
    if ((l as any).followUps) {
      for (const fu of (l as any).followUps) {
        await prisma.followUp.create({
          data: { leadId: lead.id, day: fu.day, message: fu.message, sent: fu.sent, date: new Date(fu.date) },
        })
      }
    }
  }

  // ─── ORDERS ─────────────────────────────────────────
  console.log('  → Orders')
  const ordersData = [
    { id: 'ORD-001', customer: 'Vikram Singh', product: 'ErgoMesh Office Chair', quantity: 1, amount: 14500, status: 'DELIVERED' as const, date: '2026-03-10', deliveryDate: '2026-03-13', payment: 'PAID' as const, source: 'STORE' as const },
    { id: 'ORD-002', customer: 'Amit Kumar', product: 'Marble Dynasty Dining Set', quantity: 1, amount: 38000, status: 'SHIPPED' as const, date: '2026-03-14', deliveryDate: '2026-03-17', payment: 'PAID' as const, source: 'STORE' as const },
    { id: 'ORD-003', customer: 'Sneha Reddy', product: 'SlideMax 3-Door Wardrobe', quantity: 1, amount: 55000, status: 'PROCESSING' as const, date: '2026-03-14', deliveryDate: null, payment: 'PENDING' as const, source: 'STORE' as const },
    { id: 'ORD-004', customer: 'Rahul Sharma', product: 'Royal L-Shaped Sofa', quantity: 1, amount: 45000, status: 'PROCESSING' as const, date: '2026-03-14', deliveryDate: null, payment: 'PENDING' as const, source: 'STORE' as const },
    { id: 'ORD-005', customer: 'Rajesh Verma', product: 'ModuLux Kitchen Cabinet', quantity: 1, amount: 250000, status: 'CONFIRMED' as const, date: '2026-03-14', deliveryDate: null, payment: 'PARTIAL' as const, source: 'STORE' as const },
  ]

  for (const o of ordersData) {
    const contact = contacts[o.customer]
    const product = products[o.product]
    await prisma.order.create({
      data: {
        displayId: o.id, contactId: contact.id, productId: product.id,
        quantity: o.quantity, amount: o.amount, status: o.status,
        date: new Date(o.date), deliveryDate: o.deliveryDate ? new Date(o.deliveryDate) : null,
        payment: o.payment, source: o.source,
      },
    })
  }

  // ─── APPOINTMENTS ───────────────────────────────────
  console.log('  → Appointments')
  const appointmentsData = [
    { customer: 'Rahul Sharma', date: '2026-03-15', time: '11:00 AM', purpose: 'Sofa Collection Viewing', status: 'Scheduled', notes: 'Interested in L-shaped sofas' },
    { customer: 'Amit Kumar', date: '2026-03-14', time: '10:00 AM', purpose: 'Dining Table Measurement', status: 'Completed', notes: 'Selected marble top 6-seater' },
    { customer: 'Sneha Reddy', date: '2026-03-16', time: '11:30 AM', purpose: 'Wardrobe Design Discussion', status: 'Scheduled', notes: 'Sliding door with mirror' },
    { customer: 'Rajesh Verma', date: '2026-03-17', time: '10:30 AM', purpose: 'Kitchen Design Consultation', status: 'Scheduled', notes: 'Full modular kitchen' },
    { customer: 'Vikram Singh', date: '2026-03-12', time: '2:00 PM', purpose: 'Office Chair Pickup', status: 'Completed', notes: 'Order delivered' },
  ]

  for (const a of appointmentsData) {
    const contact = contacts[a.customer]
    await prisma.appointment.create({
      data: { contactId: contact.id, date: new Date(a.date), time: a.time, purpose: a.purpose, status: a.status, notes: a.notes },
    })
  }

  // ─── INVOICES ───────────────────────────────────────
  console.log('  → Invoices')
  const invoicesData = [
    { id: 'INV-0001', customer: 'Rahul Sharma', items: [{ name: 'Royal L-Shaped Sofa', sku: 'SOF-001', qty: 1, price: 45000 }], subtotal: 45000, discount: 2000, discountType: 'flat', gst: 7740, total: 50740, paymentMethod: 'UPI', paymentStatus: 'PAID' as const, date: '2026-03-21', time: '11:02 AM', salesperson: 'Ravi Kumar', notes: 'Walk-in customer. Grey color selected.' },
    { id: 'INV-0002', customer: 'Vikram Singh', items: [{ name: 'ErgoMesh Office Chair', sku: 'CHR-001', qty: 1, price: 14500 }], subtotal: 14500, discount: 0, discountType: 'none', gst: 2610, total: 17110, paymentMethod: 'Card', paymentStatus: 'PAID' as const, date: '2026-03-21', time: '12:55 PM', salesperson: 'Ravi Kumar', notes: 'Office chair for home office.' },
    { id: 'INV-0003', customer: 'Amit Kumar', items: [{ name: 'Marble Dynasty Dining Set', sku: 'DIN-001', qty: 1, price: 38000 }], subtotal: 38000, discount: 3000, discountType: 'flat', gst: 6300, total: 41300, paymentMethod: 'EMI', paymentStatus: 'PARTIAL' as const, date: '2026-03-20', time: '3:30 PM', salesperson: 'Amit Patel', notes: '6-month EMI via HDFC.' },
    { id: 'INV-0004', customer: 'Rajesh Verma', items: [{ name: 'ModuLux Kitchen Cabinet', sku: 'KIT-001', qty: 1, price: 250000 }], subtotal: 250000, discount: 15000, discountType: 'flat', gst: 42300, total: 277300, paymentMethod: 'Bank Transfer', paymentStatus: 'PARTIAL' as const, date: '2026-03-18', time: '2:30 PM', salesperson: 'Deepa Nair', notes: '50% advance paid. Balance on installation.' },
    { id: 'INV-0005', customer: 'Sneha Reddy', items: [{ name: 'SlideMax 3-Door Wardrobe', sku: 'STO-001', qty: 1, price: 55000 }], subtotal: 55000, discount: 5000, discountType: 'flat', gst: 9000, total: 59000, paymentMethod: 'UPI', paymentStatus: 'PENDING' as const, date: '2026-03-19', time: '4:10 PM', salesperson: 'Pooja Sharma', notes: 'Custom measurements pending.' },
  ]

  for (const inv of invoicesData) {
    const contact = contacts[inv.customer]
    const salesperson = staffMap[inv.salesperson]
    await prisma.invoice.create({
      data: {
        displayId: inv.id, contactId: contact.id, subtotal: inv.subtotal,
        discount: inv.discount, discountType: inv.discountType, gst: inv.gst,
        total: inv.total, paymentMethod: inv.paymentMethod, paymentStatus: inv.paymentStatus,
        date: new Date(inv.date), time: inv.time, salespersonId: salesperson?.id, notes: inv.notes,
        items: { create: inv.items.map(item => ({ productId: products[item.sku].id, name: item.name, sku: item.sku, quantity: item.qty, price: item.price })) },
      },
    })
  }

  // ─── CUSTOM ORDERS ──────────────────────────────────
  console.log('  → Custom orders')
  const customOrdersData = [
    { id: 'CUS-001', customer: 'Rajesh Verma', phone: '+91 65412 34567', address: 'B-204, Sunshine Apartments, Baner, Pune', type: 'Modular Kitchen', status: 'IN_PRODUCTION' as const, assignedStaff: 'Deepa Nair', date: '2026-03-14', estimatedDelivery: '2026-04-05', measurements: { length: '12 ft', width: '8 ft', height: '9 ft' }, photos: ['kitchen_current.jpg'], materials: 'Marine Plywood + Acrylic Finish', color: 'White Glossy + Grey Countertop', quotedPrice: 250000, advancePaid: 125000, productionNotes: 'Cutting phase complete.', timeline: [{ date: '2026-03-14', event: 'Order placed', status: 'done' }, { date: '2026-03-15', event: 'Site measurement visit', status: 'done' }, { date: '2026-03-16', event: 'Design finalized', status: 'done' }, { date: '2026-03-20', event: 'Production started', status: 'done' }, { date: '2026-03-28', event: 'Quality check', status: 'pending' }, { date: '2026-04-05', event: 'Final handover', status: 'pending' }] },
    { id: 'CUS-002', customer: 'Amit Kumar', phone: '+91 76543 21098', address: 'A-12, Diamond Heights, Koregaon Park, Pune', type: 'Custom Dining Table', status: 'DESIGN_PHASE' as const, assignedStaff: 'Amit Patel', date: '2026-03-21', estimatedDelivery: '2026-04-12', measurements: { length: '5 ft', width: '3.5 ft', height: '2.5 ft' }, photos: ['dining_reference.jpg'], materials: 'Italian Marble + Stainless Steel', color: 'White Marble + Silver Base', quotedPrice: 95000, advancePaid: 30000, productionNotes: 'Marble sample approved.', timeline: [{ date: '2026-03-21', event: 'Order placed', status: 'done' }, { date: '2026-03-22', event: 'Material selection', status: 'done' }, { date: '2026-03-24', event: 'Design finalization', status: 'pending' }, { date: '2026-04-12', event: 'Delivery & setup', status: 'pending' }] },
    { id: 'CUS-003', customer: 'Sneha Reddy', phone: '+91 65432 10987', address: 'Flat 501, Skyline Residency, Madhapur, Hyderabad', type: 'Custom Wardrobe', status: 'DELIVERED' as const, assignedStaff: 'Deepa Nair', date: '2026-03-05', estimatedDelivery: '2026-03-18', measurements: { length: '10 ft', width: '2.5 ft', height: '8 ft' }, photos: ['wardrobe_before.jpg', 'wardrobe_after.jpg'], materials: 'Engineered Wood + Mirror', color: 'White + Mirror', quotedPrice: 55000, advancePaid: 55000, productionNotes: 'Installed successfully.', timeline: [{ date: '2026-03-05', event: 'Order placed', status: 'done' }, { date: '2026-03-06', event: 'Site measurement', status: 'done' }, { date: '2026-03-09', event: 'Production started', status: 'done' }, { date: '2026-03-17', event: 'Installation', status: 'done' }, { date: '2026-03-18', event: 'Handover complete', status: 'done' }] },
  ]

  for (const co of customOrdersData) {
    const contact = contacts[co.customer]
    const assignedStaff = staffMap[co.assignedStaff]
    await prisma.customOrder.create({
      data: {
        displayId: co.id, contactId: contact.id, phone: co.phone, address: co.address,
        type: co.type, status: co.status, assignedStaffId: assignedStaff?.id,
        date: new Date(co.date), estimatedDelivery: co.estimatedDelivery ? new Date(co.estimatedDelivery) : null,
        measurements: co.measurements, photos: co.photos, materials: co.materials,
        color: co.color, quotedPrice: co.quotedPrice, advancePaid: co.advancePaid,
        productionNotes: co.productionNotes,
        timeline: { create: co.timeline.map(t => ({ date: new Date(t.date), event: t.event, status: t.status })) },
      },
    })
  }

  // ─── WALK-INS ───────────────────────────────────────
  console.log('  → Walk-ins')
  const walkinsData = [
    { name: 'Rahul Sharma', requirement: 'L-Shaped Sofa', assignedTo: 'Ravi Kumar', date: '2026-03-21', time: '10:15 AM', status: 'CONVERTED' as const, budget: '₹40,000-50,000', notes: 'Selected Royal L-Shaped Sofa in Grey.', source: 'Walk-in', visitDuration: '45 min' },
    { name: 'Amit Kumar', requirement: 'Dining Table', assignedTo: 'Amit Patel', date: '2026-03-21', time: '11:45 AM', status: 'INTERESTED' as const, budget: '₹30,000-40,000', notes: 'Looking for 6-seater marble dining set.', source: 'Walk-in', visitDuration: '20 min' },
    { name: 'Sneha Reddy', requirement: 'Wardrobe', assignedTo: 'Deepa Nair', date: '2026-03-21', time: '2:00 PM', status: 'FOLLOW_UP' as const, budget: '₹50,000-60,000', notes: 'Wants sliding wardrobe with mirror.', source: 'Walk-in', visitDuration: '40 min' },
    { name: 'Vikram Singh', requirement: 'Office Chair', assignedTo: 'Ravi Kumar', date: '2026-03-20', time: '10:30 AM', status: 'CONVERTED' as const, budget: '₹10,000-15,000', notes: 'Purchased ErgoMesh Office Chair.', source: 'Walk-in', visitDuration: '25 min' },
    { name: 'Rajesh Verma', requirement: 'Modular Kitchen', assignedTo: 'Deepa Nair', date: '2026-03-20', time: '1:00 PM', status: 'FOLLOW_UP' as const, budget: '₹2,00,000+', notes: 'Full modular kitchen consultation.', source: 'Walk-in', visitDuration: '60 min' },
  ]

  for (const w of walkinsData) {
    const contact = contacts[w.name]
    const assigned = staffMap[w.assignedTo]
    await prisma.walkin.create({
      data: {
        contactId: contact.id, requirement: w.requirement, assignedToId: assigned?.id,
        date: new Date(w.date), time: w.time, status: w.status,
        budget: w.budget, notes: w.notes, source: w.source, visitDuration: w.visitDuration,
      },
    })
  }

  // ─── CALL LOGS ──────────────────────────────────────
  console.log('  → Call logs')
  const callsData = [
    { customer: 'Rahul Sharma', phone: '+91 98765 43210', direction: 'OUTBOUND' as const, status: 'COMPLETED' as const, duration: '4:32', durationSec: 272, date: '2026-03-21', time: '10:15 AM', purpose: 'Follow-up on sofa inquiry', outcome: 'Appointment Booked', notes: 'Customer interested in Royal L-Shaped Sofa.', recording: true },
    { customer: 'Amit Kumar', phone: '+91 76543 21098', direction: 'INBOUND' as const, status: 'COMPLETED' as const, duration: '8:45', durationSec: 525, date: '2026-03-21', time: '12:00 PM', purpose: 'Custom dining table discussion', outcome: 'Transferred to Human', notes: 'Needs custom marble table. Transferred to design team.', recording: true },
    { customer: 'Sneha Reddy', phone: '+91 65432 10987', direction: 'OUTBOUND' as const, status: 'COMPLETED' as const, duration: '3:15', durationSec: 195, date: '2026-03-21', time: '2:00 PM', purpose: 'Appointment reminder', outcome: 'Confirmed', notes: 'Confirmed wardrobe consultation.', recording: true },
    { customer: 'Vikram Singh', phone: '+91 54321 09876', direction: 'INBOUND' as const, status: 'COMPLETED' as const, duration: '3:55', durationSec: 235, date: '2026-03-19', time: '1:00 PM', purpose: 'Warranty query', outcome: 'Resolved', notes: 'Confirmed 2-year warranty on office chair.', recording: true },
    { customer: 'Rajesh Verma', phone: '+91 65412 34567', direction: 'INBOUND' as const, status: 'COMPLETED' as const, duration: '11:25', durationSec: 685, date: '2026-03-18', time: '10:00 AM', purpose: 'Modular kitchen consultation', outcome: 'Appointment Booked', notes: 'Booked in-home measurement visit.', recording: true },
  ]

  const callLogIds: Record<number, number> = {}
  let callIdx = 0
  for (const c of callsData) {
    callIdx++
    const contact = contacts[c.customer]
    const callLog = await prisma.callLog.create({
      data: {
        contactId: contact?.id, customerName: c.customer, phone: c.phone,
        direction: c.direction, status: c.status, duration: c.duration,
        durationSec: c.durationSec, agent: 'AI Agent', date: new Date(c.date),
        time: c.time, purpose: c.purpose, outcome: c.outcome, notes: c.notes, recording: c.recording,
      },
    })
    callLogIds[callIdx] = callLog.id
  }

  // Call transcripts
  console.log('  → Call transcripts')
  await prisma.callTranscript.create({
    data: {
      callLogId: callLogIds[1],
      summary: 'Follow-up call about L-shaped sofa. Customer confirmed interest. Appointment booked.',
      sentiment: 'Positive',
      messages: [
        { from: 'agent', text: 'Hello, am I speaking with Rahul Sharma?', time: '0:00' },
        { from: 'customer', text: 'Yes, speaking.', time: '0:03' },
        { from: 'agent', text: 'Hi Rahul! You had inquired about our L-shaped sofa collection. Still interested?', time: '0:05' },
        { from: 'customer', text: 'Yes! I like the Royal L-Shaped Sofa in Grey. Can I visit?', time: '0:18' },
        { from: 'agent', text: 'Booked your showroom visit for March 22nd at 11 AM.', time: '0:52' },
        { from: 'customer', text: 'That sounds great, thank you!', time: '1:25' },
      ],
    },
  })

  // ─── CONVERSATIONS ──────────────────────────────────
  console.log('  → Conversations')
  const conversationsData = [
    { customer: 'Rahul Sharma', channel: 'WhatsApp', status: 'AI_HANDLED' as const, lastMessage: "Great, I'd like to visit this weekend!", unread: 0, date: '2026-03-14', messages: [{ from: 'customer', text: "I'm looking for an L-shaped sofa", time: '10:15 AM' }, { from: 'bot', text: 'We have Royal L-Shaped Sofa (₹45,000) in Grey, Navy Blue, Beige, Charcoal.', time: '10:15 AM' }, { from: 'customer', text: "Great, I'd like to visit this weekend!", time: '10:22 AM' }] },
    { customer: 'Amit Kumar', channel: 'Website', status: 'NEEDS_HUMAN' as const, lastMessage: 'I need a custom size table', unread: 2, date: '2026-03-14', messages: [{ from: 'customer', text: 'Do you make custom dining tables?', time: '9:30 AM' }, { from: 'bot', text: 'Yes! We can customize size, material, and shape.', time: '9:30 AM' }, { from: 'customer', text: 'I need 5ft x 3.5ft, marble top. Can you make it?', time: '9:35 AM' }, { from: 'bot', text: 'Let me connect you with our design specialist.', time: '9:35 AM' }] },
    { customer: 'Sneha Reddy', channel: 'WhatsApp', status: 'AI_HANDLED' as const, lastMessage: 'Thanks for the wardrobe options!', unread: 0, date: '2026-03-13', messages: [{ from: 'customer', text: 'What sliding wardrobe options do you have?', time: '3:00 PM' }, { from: 'bot', text: 'SlideMax 3-Door Wardrobe (₹55,000) with full mirror. Custom sizes available.', time: '3:00 PM' }, { from: 'customer', text: 'Thanks for the wardrobe options!', time: '3:10 PM' }] },
    { customer: 'Vikram Singh', channel: 'WhatsApp', status: 'RESOLVED' as const, lastMessage: 'Chair delivered, thank you!', unread: 0, date: '2026-03-12', messages: [{ from: 'customer', text: 'When will my office chair be delivered?', time: '11:00 AM' }, { from: 'bot', text: 'Your ErgoMesh Office Chair is out for delivery today!', time: '11:00 AM' }, { from: 'customer', text: 'Chair delivered, thank you!', time: '4:00 PM' }] },
    { customer: 'Rajesh Verma', channel: 'Website', status: 'NEEDS_HUMAN' as const, lastMessage: 'Need to discuss kitchen layout', unread: 1, date: '2026-03-14', messages: [{ from: 'customer', text: 'I want a full modular kitchen', time: '10:00 AM' }, { from: 'bot', text: 'We offer ModuLux Kitchen Cabinets starting at ₹2,50,000.', time: '10:00 AM' }, { from: 'customer', text: 'Need to discuss kitchen layout', time: '10:05 AM' }] },
  ]

  for (const conv of conversationsData) {
    const contact = contacts[conv.customer]
    await prisma.conversation.create({
      data: {
        contactId: contact.id, customerName: conv.customer, channel: conv.channel,
        status: conv.status, lastMessage: conv.lastMessage, unread: conv.unread,
        date: new Date(conv.date), messages: conv.messages,
      },
    })
  }

  // ─── REVIEWS ────────────────────────────────────────
  console.log('  → Reviews')
  const reviewsData = [
    { customer: 'Vikram Singh', rating: 5, text: 'Excellent office chair! Very comfortable for long work hours.', date: '2026-03-13', product: 'ErgoMesh Office Chair', platform: 'Google', replied: true },
    { customer: 'Amit Kumar', rating: 4, text: 'Good quality dining set. Marble top is premium. Delivery was smooth.', date: '2026-03-11', product: 'Marble Dynasty Dining Set', platform: 'Google', replied: true },
    { customer: 'Sneha Reddy', rating: 5, text: 'Love the wardrobe! Mirror quality is great. Installation team was professional.', date: '2026-03-10', product: 'SlideMax 3-Door Wardrobe', platform: 'Google', replied: false },
    { customer: 'Rahul Sharma', rating: 4, text: 'Sofa quality is good. Color was exactly as expected. Slight delivery delay.', date: '2026-03-07', product: 'Royal L-Shaped Sofa', platform: 'Google', replied: true },
    { customer: 'Rajesh Verma', rating: 5, text: 'Best furniture store! Design consultation for kitchen was amazing.', date: '2026-03-05', product: 'ModuLux Kitchen Cabinet', platform: 'Google', replied: true },
  ]

  for (const r of reviewsData) {
    const contact = contacts[r.customer]
    await prisma.review.create({
      data: {
        contactId: contact.id, customerName: r.customer, rating: r.rating,
        text: r.text, date: new Date(r.date), product: r.product,
        platform: r.platform, replied: r.replied,
      },
    })
  }

  // ─── CAMPAIGNS ──────────────────────────────────────
  console.log('  → Campaigns')
  const campaignsData = [
    { name: 'Holi Mega Sale', channel: 'WhatsApp', status: 'SENT' as const, scheduledDate: '2026-03-10', audience: 2450, sent: 2380, opened: 1850, clicked: 620, template: 'Holi Special! Get up to 40% off on sofas, beds & dining sets.' },
    { name: 'New Summer Collection', channel: 'Email', status: 'SCHEDULED' as const, scheduledDate: '2026-03-20', audience: 5200, sent: 0, opened: 0, clicked: 0, template: 'Fresh Summer Furniture Collection is Here!' },
    { name: 'Clearance Sale', channel: 'WhatsApp', status: 'DRAFT' as const, scheduledDate: null, audience: 3100, sent: 0, opened: 0, clicked: 0, template: 'CLEARANCE SALE — Up to 60% OFF!' },
    { name: 'Customer Appreciation', channel: 'Email', status: 'SENT' as const, scheduledDate: '2026-02-14', audience: 1850, sent: 1820, opened: 1240, clicked: 380, template: 'Exclusive 15% discount for valued customers.' },
    { name: 'Weekend Flash Sale', channel: 'SMS', status: 'SCHEDULED' as const, scheduledDate: '2026-03-21', audience: 3800, sent: 0, opened: 0, clicked: 0, template: 'FLASH SALE! Flat 25% off on all sofas & recliners.' },
  ]

  for (const c of campaignsData) {
    await prisma.campaign.create({
      data: {
        name: c.name, channel: c.channel, status: c.status,
        scheduledDate: c.scheduledDate ? new Date(c.scheduledDate) : null,
        audience: c.audience, sent: c.sent, opened: c.opened, clicked: c.clicked, template: c.template,
      },
    })
  }

  // ─── MARKETPLACE CHANNELS ───────────────────────────
  console.log('  → Marketplace channels')
  for (const ch of [
    { slug: 'amazon', name: 'Amazon', logo: 'A', color: '#FF9900', connected: true, lastSync: '2026-03-21T09:30:00', sellerId: 'A3XXXXXX7KP' },
    { slug: 'flipkart', name: 'Flipkart', logo: 'F', color: '#2874F0', connected: true, lastSync: '2026-03-21T09:15:00', sellerId: 'FKXXXXXXXXX' },
    { slug: 'shopify', name: 'Shopify', logo: 'S', color: '#96BF48', connected: true, lastSync: '2026-03-21T08:45:00', sellerId: 'furniturecrmstore' },
  ]) {
    await prisma.marketplaceChannel.upsert({
      where: { slug: ch.slug }, update: {},
      create: { slug: ch.slug, name: ch.name, logo: ch.logo, color: ch.color, connected: ch.connected, lastSync: new Date(ch.lastSync), sellerId: ch.sellerId },
    })
  }

  // ─── STORE CAMPAIGNS (QR Codes) ─────────────────────
  console.log('  → Store campaigns')
  for (const sc of [
    { name: 'Spring Sale QR', type: 'QR Code', location: 'Main Entrance', scans: 142, leads: 38, status: 'Active', purpose: null },
    { name: 'Feedback QR', type: 'QR Code', location: 'Billing Counter', scans: 89, leads: 0, status: 'Active', purpose: 'Feedback' },
    { name: 'WhatsApp Chat QR', type: 'QR Code', location: 'Product Display Area', scans: 215, leads: 67, status: 'Active', purpose: null },
  ]) {
    await prisma.storeCampaign.create({ data: sc })
  }

  // ─── DEFAULT ADMIN USER ─────────────────────────────
  console.log('  → Admin user')
  const hashedPassword = await bcrypt.hash('admin123', 12)
  await prisma.user.upsert({
    where: { email: 'admin@furniturecrm.com' },
    update: {},
    create: { email: 'admin@furniturecrm.com', name: 'Admin', hashedPassword, role: 'ADMIN' },
  })

  // Staff user accounts
  for (const s of staffData) {
    const staff = staffMap[s.name]
    const staffPassword = await bcrypt.hash('staff123', 12)
    await prisma.user.upsert({
      where: { email: s.email },
      update: {},
      create: { email: s.email, name: s.name, hashedPassword: staffPassword, role: 'STAFF', staffId: staff.id },
    })
  }

  console.log('\n✅ Seed complete!')
  console.log('   Admin login: admin@furniturecrm.com / admin123')
  console.log('   Staff login: [staff email] / staff123')
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
