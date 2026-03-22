export const leads = [
  { id: 1, name: "Rahul Sharma", phone: "+91 98765 43210", email: "rahul@gmail.com", source: "WhatsApp", interest: "L-Shaped Sofa", budget: "₹45,000", status: "New", date: "2026-03-14", notes: "Looking for grey fabric sofa for living room", followUps: [
    { day: 1, message: "Hi Rahul, here are the L-shaped sofa options you requested. We have 12 designs in grey fabric starting from ₹38,000.", sent: true, date: "2026-03-14" },
  ]},
  { id: 2, name: "Priya Patel", phone: "+91 87654 32109", email: "priya.p@gmail.com", source: "Instagram", interest: "King Size Bed", budget: "₹60,000", status: "Contacted", date: "2026-03-13", notes: "Interested in wooden king bed with storage", followUps: [
    { day: 1, message: "Hi Priya, here are our best-selling king size beds with storage. Starting from ₹52,000.", sent: true, date: "2026-03-13" },
    { day: 3, message: "Just checking — would you like to schedule a showroom visit to see the beds in person?", sent: true, date: "2026-03-15" },
  ]},
  { id: 3, name: "Amit Kumar", phone: "+91 76543 21098", email: "amit.k@outlook.com", source: "Website", interest: "Dining Table Set", budget: "₹35,000", status: "Showroom Visit", date: "2026-03-12", notes: "6-seater marble top dining set", followUps: [
    { day: 1, message: "Hi Amit, here are our 6-seater dining table options with marble tops.", sent: true, date: "2026-03-12" },
    { day: 3, message: "Would you like to visit our showroom this weekend?", sent: true, date: "2026-03-14" },
    { day: 7, message: "Great news! Our marble dining sets have a 10% discount this week.", sent: true, date: "2026-03-19" },
  ]},
  { id: 4, name: "Sneha Reddy", phone: "+91 65432 10987", email: "sneha.r@yahoo.com", source: "Facebook", interest: "Wardrobe", budget: "₹55,000", status: "Quotation", date: "2026-03-11", notes: "3-door sliding wardrobe with mirror" },
  { id: 5, name: "Vikram Singh", phone: "+91 54321 09876", email: "vikram.s@gmail.com", source: "WhatsApp", interest: "Office Chair", budget: "₹15,000", status: "Won", date: "2026-03-10", notes: "Ergonomic office chair, black mesh" },
  { id: 6, name: "Meera Joshi", phone: "+91 43210 98765", email: "meera.j@gmail.com", source: "Instagram", interest: "Bookshelf", budget: "₹22,000", status: "New", date: "2026-03-14", notes: "Wall-mounted bookshelf, walnut finish" },
  { id: 7, name: "Rohan Gupta", phone: "+91 32109 87654", email: "rohan.g@gmail.com", source: "Website", interest: "Sofa Cum Bed", budget: "₹30,000", status: "Contacted", date: "2026-03-13", notes: "Compact sofa bed for guest room" },
  { id: 8, name: "Ananya Iyer", phone: "+91 21098 76543", email: "ananya.i@gmail.com", source: "WhatsApp", interest: "TV Unit", budget: "₹28,000", status: "New", date: "2026-03-14", notes: "Modern TV unit with LED panel backing" },
  { id: 9, name: "Karan Malhotra", phone: "+91 10987 65432", email: "karan.m@gmail.com", source: "Facebook", interest: "Recliner Sofa", budget: "₹70,000", status: "Showroom Visit", date: "2026-03-09", notes: "Premium leather recliner, brown" },
  { id: 10, name: "Divya Nair", phone: "+91 98712 34567", email: "divya.n@gmail.com", source: "Instagram", interest: "Dressing Table", budget: "₹18,000", status: "Contacted", date: "2026-03-12", notes: "Dressing table with LED mirror" },
  { id: 11, name: "Suresh Menon", phone: "+91 87612 34567", email: "suresh.m@gmail.com", source: "Website", interest: "Bunk Bed", budget: "₹40,000", status: "New", date: "2026-03-14", notes: "Bunk bed for kids room with study table" },
  { id: 12, name: "Pooja Agarwal", phone: "+91 76512 34567", email: "pooja.a@gmail.com", source: "WhatsApp", interest: "Center Table", budget: "₹12,000", status: "Won", date: "2026-03-08", notes: "Glass top center table, modern design" },
  { id: 13, name: "Rajesh Verma", phone: "+91 65412 34567", email: "rajesh.v@gmail.com", source: "Facebook", interest: "Modular Kitchen", budget: "₹2,50,000", status: "Quotation", date: "2026-03-07", notes: "Full modular kitchen, U-shaped, white glossy" },
  { id: 14, name: "Nisha Chauhan", phone: "+91 54312 34567", email: "nisha.c@gmail.com", source: "Instagram", interest: "Bean Bag", budget: "₹3,500", status: "Lost", date: "2026-03-06", notes: "Large bean bag, found cheaper elsewhere" },
  { id: 15, name: "Arjun Rao", phone: "+91 43212 34567", email: "arjun.r@gmail.com", source: "WhatsApp", interest: "Shoe Rack", budget: "₹8,000", status: "Contacted", date: "2026-03-11", notes: "Wooden shoe rack, 4 tier" },
  { id: 16, name: "Kavita Tiwari", phone: "+91 32112 34567", email: "kavita.t@gmail.com", source: "Website", interest: "Study Table", budget: "₹20,000", status: "New", date: "2026-03-14", notes: "Adjustable study desk with drawers" },
];

export const pipelineStages = ["New", "Contacted", "Showroom Visit", "Quotation", "Won", "Lost"];

export const sourceIcons = {
  WhatsApp: "MessageCircle",
  Instagram: "Instagram",
  Facebook: "Facebook",
  Website: "Globe",
};
