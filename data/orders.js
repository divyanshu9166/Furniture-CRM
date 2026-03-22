export const orders = [
  { id: "ORD-001", customer: "Vikram Singh", product: "ErgoMesh Office Chair", quantity: 1, amount: 14500, status: "Delivered", date: "2026-03-10", deliveryDate: "2026-03-13", payment: "Paid", source: "Store" },
  { id: "ORD-002", customer: "Pooja Agarwal", product: "Zenith Center Table", quantity: 1, amount: 12500, status: "Delivered", date: "2026-03-08", deliveryDate: "2026-03-11", payment: "Paid", source: "Store" },
  { id: "ORD-003", customer: "Amit Kumar", product: "Marble Dynasty Dining Set", quantity: 1, amount: 38000, status: "Shipped", date: "2026-03-14", deliveryDate: "2026-03-17", payment: "Paid", source: "Store" },
  { id: "ORD-004", customer: "Karan Malhotra", product: "Executive Recliner Pro", quantity: 1, amount: 72000, status: "Processing", date: "2026-03-14", deliveryDate: null, payment: "Partial", source: "Store" },
  { id: "ORD-005", customer: "Sneha Reddy", product: "SlideMax 3-Door Wardrobe", quantity: 1, amount: 55000, status: "Processing", date: "2026-03-14", deliveryDate: null, payment: "Pending", source: "Store" },
  { id: "ORD-006", customer: "Divya Nair", product: "GlowUp Dressing Table", quantity: 1, amount: 18500, status: "Shipped", date: "2026-03-13", deliveryDate: "2026-03-16", payment: "Paid", source: "Store" },
  { id: "ORD-007", customer: "Rahul Sharma", product: "Royal L-Shaped Sofa", quantity: 1, amount: 45000, status: "Processing", date: "2026-03-14", deliveryDate: null, payment: "Pending", source: "Store" },
  { id: "ORD-008", customer: "Priya Patel", product: "Milano King Bed", quantity: 1, amount: 62000, status: "Confirmed", date: "2026-03-14", deliveryDate: null, payment: "Partial", source: "Store" },
  { id: "ORD-009", customer: "Rajesh Verma", product: "ModuLux Kitchen Cabinet", quantity: 1, amount: 250000, status: "Confirmed", date: "2026-03-14", deliveryDate: null, payment: "Partial", source: "Store" },
  { id: "ORD-010", customer: "Suresh Menon", product: "Adventure Bunk Bed", quantity: 1, amount: 42000, status: "Processing", date: "2026-03-14", deliveryDate: null, payment: "Pending", source: "Store" },
  { id: "ORD-011", customer: "Meera Joshi", product: "Woody Wall Bookshelf", quantity: 2, amount: 44000, status: "Delivered", date: "2026-03-06", deliveryDate: "2026-03-09", payment: "Paid", source: "Store" },
  { id: "ORD-012", customer: "Arjun Rao", product: "SoleKeeper Shoe Rack", quantity: 1, amount: 8500, status: "Shipped", date: "2026-03-12", deliveryDate: "2026-03-15", payment: "Paid", source: "Store" },

  // Amazon orders
  { id: "AMZ-78432", customer: "Deepak Jain", product: "ErgoMesh Office Chair", quantity: 2, amount: 28400, status: "Shipped", date: "2026-03-19", deliveryDate: "2026-03-22", payment: "Paid", source: "Amazon" },
  { id: "AMZ-78501", customer: "Sunita Rao", product: "Woody Wall Bookshelf", quantity: 1, amount: 22000, status: "Delivered", date: "2026-03-12", deliveryDate: "2026-03-16", payment: "Paid", source: "Amazon" },
  { id: "AMZ-78563", customer: "Manish Gupta", product: "SoleKeeper Shoe Rack", quantity: 3, amount: 24900, status: "Processing", date: "2026-03-20", deliveryDate: null, payment: "Paid", source: "Amazon" },
  { id: "AMZ-78610", customer: "Rekha Bhat", product: "Zenith Center Table", quantity: 1, amount: 12500, status: "Confirmed", date: "2026-03-21", deliveryDate: null, payment: "Paid", source: "Amazon" },
  { id: "AMZ-78655", customer: "Nikhil Sharma", product: "Adventure Bunk Bed", quantity: 1, amount: 42000, status: "Processing", date: "2026-03-20", deliveryDate: null, payment: "Paid", source: "Amazon" },

  // Flipkart orders
  { id: "FK-991204", customer: "Ananya Singh", product: "GlowUp Dressing Table", quantity: 1, amount: 18500, status: "Shipped", date: "2026-03-18", deliveryDate: "2026-03-22", payment: "Paid", source: "Flipkart" },
  { id: "FK-991238", customer: "Rohit Verma", product: "Executive Recliner Pro", quantity: 1, amount: 72000, status: "Delivered", date: "2026-03-10", deliveryDate: "2026-03-15", payment: "Paid", source: "Flipkart" },
  { id: "FK-991290", customer: "Pallavi Deshmukh", product: "Milano King Bed", quantity: 1, amount: 62000, status: "Processing", date: "2026-03-19", deliveryDate: null, payment: "Paid", source: "Flipkart" },
  { id: "FK-991315", customer: "Gaurav Tiwari", product: "Royal L-Shaped Sofa", quantity: 1, amount: 45000, status: "Confirmed", date: "2026-03-21", deliveryDate: null, payment: "Paid", source: "Flipkart" },

  // Shopify orders
  { id: "SHP-10421", customer: "Isha Malhotra", product: "SlideMax 3-Door Wardrobe", quantity: 1, amount: 55000, status: "Processing", date: "2026-03-20", deliveryDate: null, payment: "Paid", source: "Shopify" },
  { id: "SHP-10435", customer: "Vivek Nair", product: "Marble Dynasty Dining Set", quantity: 1, amount: 38000, status: "Shipped", date: "2026-03-17", deliveryDate: "2026-03-21", payment: "Paid", source: "Shopify" },
  { id: "SHP-10448", customer: "Kavya Reddy", product: "ModuLux Kitchen Cabinet", quantity: 1, amount: 250000, status: "Confirmed", date: "2026-03-21", deliveryDate: null, payment: "Partial", source: "Shopify" },
  { id: "SHP-10460", customer: "Tanvi Joshi", product: "ErgoMesh Office Chair", quantity: 1, amount: 14500, status: "Delivered", date: "2026-03-11", deliveryDate: "2026-03-14", payment: "Paid", source: "Shopify" },
];

export const orderStatuses = ["All", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled"];

export const orderSources = ["All", "Store", "Amazon", "Flipkart", "Shopify"];

export const marketplaceChannels = [
  {
    id: "amazon",
    name: "Amazon",
    logo: "A",
    color: "#FF9900",
    connected: true,
    lastSync: "2026-03-21 09:30 AM",
    sellerId: "A3XXXXXX7KP",
    totalOrders: 5,
    pendingOrders: 3,
    revenue: 129800,
  },
  {
    id: "flipkart",
    name: "Flipkart",
    logo: "F",
    color: "#2874F0",
    connected: true,
    lastSync: "2026-03-21 09:15 AM",
    sellerId: "FKXXXXXXXXX",
    totalOrders: 4,
    pendingOrders: 2,
    revenue: 197500,
  },
  {
    id: "shopify",
    name: "Shopify",
    logo: "S",
    color: "#96BF48",
    connected: true,
    lastSync: "2026-03-21 08:45 AM",
    sellerId: "furniturecrmstore",
    totalOrders: 4,
    pendingOrders: 2,
    revenue: 357500,
  },
];

