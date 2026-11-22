// These are section-access defaults, not permission to perform privileged actions.
// Settings is intentionally outside the editable list.
export const sections = {
  dashboard: { path: "/", label: "Dashboard", staff: true, manager: true },
  "staff-portal": { path: "/staff-portal", label: "Staff Portal", staff: true, manager: true },
  walkins: { path: "/walkins", label: "Walk-ins", staff: true, manager: true },
  leads: { path: "/leads", label: "Leads", staff: true, manager: true },
  "follow-ups": { path: "/follow-ups", label: "Follow-ups", staff: false, manager: true },
  "indiamart-leads": { path: "/indiamart-leads", label: "IndiaMART Leads", staff: false, manager: true },
  staff: { path: "/staff", label: "Staff & Attendance", staff: false, manager: true },
  appointments: { path: "/appointments", label: "Appointments", staff: true, manager: true },
  inventory: { path: "/inventory", label: "Inventory", staff: true, manager: true },
  orders: { path: "/orders", label: "Orders", staff: true, manager: true },
  quotations: { path: "/quotations", label: "Quotations", staff: true, manager: true },
  billing: { path: "/billing", label: "Billing & POS", staff: false, manager: true },
  purchases: { path: "/purchases", label: "Purchases", staff: false, manager: true },
  godowns: { path: "/godowns", label: "Godowns", staff: true, manager: true },
  "custom-orders": { path: "/custom-orders", label: "Custom Orders", staff: true, manager: true },
  manufacturing: { path: "/manufacturing", label: "Manufacturing", staff: true, manager: true },
  drafts: { path: "/drafts", label: "Drafts", staff: false, manager: true },
  marketing: { path: "/marketing", label: "Marketing Hub", staff: false, manager: true },
  "email-marketing": { path: "/email-marketing", label: "Email Marketing", staff: false, manager: true },
  "whatsapp-marketing": { path: "/whatsapp-marketing", label: "WhatsApp Marketing", staff: false, manager: true },
  "social-inbox": { path: "/social-inbox", label: "Instagram & FB Inbox", staff: false, manager: true },
  calls: { path: "/calls", label: "Call Center", staff: true, manager: true },
  gst: { path: "/gst", label: "GST Compliance", staff: false, manager: true },
  expenses: { path: "/expenses", label: "Expenses", staff: true, manager: true },
  payments: { path: "/payments", label: "Daily Payments", staff: true, manager: true },
  payroll: { path: "/payroll", label: "Payroll", staff: false, manager: false },
  financials: { path: "/financials", label: "Financials", staff: false, manager: false },
  reviews: { path: "/reviews", label: "Reviews", staff: true, manager: true },
  recommend: { path: "/recommend", label: "Recommendations", staff: true, manager: true },
} as const;

export type Section = keyof typeof sections;
export type SectionOverrides = Partial<Record<Section, boolean>>;

export function isSection(value: string): value is Section {
  return Object.prototype.hasOwnProperty.call(sections, value);
}

export function allowedSections(role: string, overrides: SectionOverrides = {}) {
  return (Object.keys(sections) as Section[]).filter(key => {
    if (role === "ADMIN") return true;
    if (role !== "MANAGER" && role !== "STAFF") return false;
    return overrides[key] ?? sections[key][role === "STAFF" ? "staff" : "manager"];
  });
}

export function sectionForPath(path: string): Section | undefined {
  if (path === "/") return "dashboard";
  const root = path.split("/")[1];
  if (root === "broadcasts" || root === "automations") return "whatsapp-marketing";
  if (["instagram-inbox", "facebook-inbox", "conversations"].includes(root)) return "social-inbox";
  return isSection(root) && root !== "dashboard" ? root : undefined;
}

export function sectionForApi(path: string): Section | undefined {
  if (path === "/api/auth/ws-token") return "whatsapp-marketing";
  if (/^\/api\/(whatsapp|automations)(\/|$)/.test(path)) return "whatsapp-marketing";
  if (/^\/api\/social(\/|$)/.test(path)) return "social-inbox";
  if (/^\/api\/calls(\/|$)/.test(path)) return "calls";
  if (/^\/api\/quotations(\/|$)/.test(path)) return "quotations";
  if (/^\/api\/recommend(\/|$)/.test(path)) return "recommend";
  if (/^\/(?:api\/)?uploads\/receipts(?:\/|$)/.test(path)) return "payments";
  return undefined;
}
