export const conversations = [
  {
    id: 1, customer: "Rahul Sharma", channel: "WhatsApp", status: "AI Handled", lastMessage: "Great, I'd like to visit this weekend!", unread: 0, date: "2026-03-14",
    messages: [
      { from: "customer", text: "Hi, I'm looking for an L-shaped sofa for my living room", time: "10:15 AM" },
      { from: "bot", text: "Hello Rahul! 👋 Welcome to our store. We have a great collection of L-shaped sofas.\n\nHere are our top picks:\n🛋️ Royal L-Shaped Sofa (₹45,000) — Grey fabric, foam cushioning\n🛋️ Tuscan Corner Sofa (₹52,000) — Velvet, emerald green\n\nWould you like to know more about any of these?", time: "10:15 AM" },
      { from: "customer", text: "The Royal one looks nice. What colors do you have?", time: "10:18 AM" },
      { from: "bot", text: "The Royal L-Shaped Sofa comes in:\n• Grey\n• Navy Blue\n• Beige\n• Charcoal\n\nAll are available in our showroom. Would you like to schedule a visit to see them in person? 🏪", time: "10:18 AM" },
      { from: "customer", text: "Great, I'd like to visit this weekend!", time: "10:22 AM" },
      { from: "bot", text: "Perfect! I can book you a showroom visit this weekend. Which works better for you?\n\n📅 Saturday, March 15 — 10 AM to 7 PM\n📅 Sunday, March 16 — 10 AM to 6 PM\n\nJust share your preferred date and time! 😊", time: "10:22 AM" },
    ]
  },
  {
    id: 2, customer: "Priya Patel", channel: "Instagram", status: "AI Handled", lastMessage: "Does it come with storage?", unread: 1, date: "2026-03-13",
    messages: [
      { from: "customer", text: "I saw the king size bed on your Instagram. What's the price?", time: "3:45 PM" },
      { from: "bot", text: "Hi Priya! 🌟 Thanks for reaching out about our king size beds!\n\nOur Milano King Bed is priced at ₹62,000. It features:\n✅ Sheesham wood construction\n✅ Hydraulic storage\n✅ Walnut finish\n\nWould you like more details?", time: "3:45 PM" },
      { from: "customer", text: "Does it come with storage?", time: "3:50 PM" },
      { from: "bot", text: "Yes! The Milano King Bed comes with full hydraulic storage underneath. You can store:\n🔹 Bedsheets & pillows\n🔹 Seasonal clothing\n🔹 Extra blankets\n\nThe hydraulic mechanism makes it super easy to lift. Would you like to schedule a showroom visit to test it out?", time: "3:50 PM" },
    ]
  },
  {
    id: 3, customer: "Amit Kumar", channel: "Website", status: "Needs Human", lastMessage: "I need a custom size table", unread: 2, date: "2026-03-14",
    messages: [
      { from: "customer", text: "Hi, do you make custom dining tables?", time: "9:30 AM" },
      { from: "bot", text: "Hello! Yes, we offer custom furniture! 🎨\n\nFor dining tables, we can customize:\n• Size (4, 6, 8, or custom seater)\n• Material (Marble, Teak, Sheesham, Glass)\n• Shape (Rectangle, Round, Oval)\n\nWhat are you looking for?", time: "9:30 AM" },
      { from: "customer", text: "I need a custom size table — 5ft x 3.5ft, marble top, 6 seater. Can you make it?", time: "9:35 AM" },
      { from: "bot", text: "That's a unique size! Let me connect you with our furniture design specialist who can help with exact measurements and pricing. 📐\n\n🔔 A team member will reach out within 30 minutes.\n\nIn the meantime, is there anything else I can help with?", time: "9:35 AM" },
      { from: "customer", text: "Also, what's the delivery time for custom furniture?", time: "9:38 AM" },
    ]
  },
  {
    id: 4, customer: "Meera Joshi", channel: "WhatsApp", status: "AI Handled", lastMessage: "Thanks!", unread: 0, date: "2026-03-13",
    messages: [
      { from: "customer", text: "How many days for delivery?", time: "11:00 AM" },
      { from: "bot", text: "Hi Meera! 🚚 Delivery timelines:\n\n📦 Ready stock items: 3–5 days (within city)\n📦 Inter-city delivery: 7–10 days\n📦 Custom furniture: 15–21 days\n\nWould you like to place an order?", time: "11:00 AM" },
      { from: "customer", text: "I want 2 wall bookshelves delivered to Pune", time: "11:05 AM" },
      { from: "bot", text: "Great choice! For 2 Woody Wall Bookshelves to Pune:\n\n📦 Price: ₹22,000 × 2 = ₹44,000\n🚚 Delivery: 7–8 working days\n💰 Shipping: ₹1,500\n📝 Total: ₹45,500\n\nShall I proceed with the order? You can pay via UPI, card, or EMI.", time: "11:05 AM" },
      { from: "customer", text: "Thanks!", time: "11:10 AM" },
    ]
  },
  {
    id: 5, customer: "Unknown Customer", channel: "Website", status: "AI Handled", lastMessage: "What's your warranty policy?", unread: 0, date: "2026-03-14",
    messages: [
      { from: "customer", text: "What's your warranty policy?", time: "2:00 PM" },
      { from: "bot", text: "Great question! Here's our warranty coverage 🛡️:\n\n🪑 Solid Wood Furniture: 5 years\n🛋️ Sofas & Upholstery: 3 years\n🚪 Engineered Wood: 1 year\n💺 Office Chairs: 2 years\n🍳 Modular Kitchen: 10 years\n\nAll warranties cover manufacturing defects. Would you like to know about any specific product?", time: "2:00 PM" },
    ]
  },
];

export const channelFilters = ["All", "WhatsApp", "Instagram", "Website"];
