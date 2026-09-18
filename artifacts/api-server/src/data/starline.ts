export type StarlineRecord = {
  id: string;
  [key: string]: unknown;
};

export type StarlineData = {
  products: StarlineRecord[];
  categories: StarlineRecord[];
  services: StarlineRecord[];
  customers: StarlineRecord[];
  orders: StarlineRecord[];
  requests: StarlineRecord[];
  reviews: StarlineRecord[];
  inventory: StarlineRecord[];
  invoices: StarlineRecord[];
  banners: StarlineRecord[];
  offers: StarlineRecord[];
  content: StarlineRecord[];
};

export const starlineData: StarlineData = {
  products: [
    {
      id: "prod-101",
      name: "HP DeskJet 2331",
      category: "Printers",
      price: 6499,
      stock: 12,
      rating: 4.8,
      reviews: 34,
      image: "printer",
      featured: true,
      description: "Compact all-in-one printer for home and small-office work.",
    },
    {
      id: "prod-102",
      name: "Braided Type-C Cable",
      category: "Mobile Accessories",
      price: 399,
      stock: 48,
      rating: 4.6,
      reviews: 86,
      image: "cable",
      featured: true,
      description: "Durable fast-charge cable with reinforced connectors.",
    },
    {
      id: "prod-103",
      name: "Logitech M185 Mouse",
      category: "Computer Accessories",
      price: 799,
      stock: 7,
      rating: 4.5,
      reviews: 21,
      image: "mouse",
      featured: false,
      description: "Reliable wireless mouse for study, work, and travel.",
    },
    {
      id: "prod-104",
      name: "A4 Premium Paper · 500 sheets",
      category: "Printing Supplies",
      price: 349,
      stock: 82,
      rating: 4.9,
      reviews: 59,
      image: "paper",
      featured: false,
      description: "Bright 75 GSM paper for everyday prints and documents.",
    },
  ],
  categories: [
    { id: "cat-1", name: "Printers", slug: "printers", productCount: 12 },
    { id: "cat-2", name: "Mobile Accessories", slug: "mobile-accessories", productCount: 28 },
    { id: "cat-3", name: "Computer Accessories", slug: "computer-accessories", productCount: 17 },
    { id: "cat-4", name: "Printing Supplies", slug: "printing-supplies", productCount: 9 },
  ],
  services: [
    {
      id: "svc-1",
      name: "Color Printing",
      description: "Sharp, color-accurate prints for documents, projects, and presentations.",
      startingPrice: 8,
      turnaround: "Same day",
      icon: "print",
      active: true,
    },
    {
      id: "svc-2",
      name: "Xerox & Scanning",
      description: "Fast black-and-white copies, scans, and document sets.",
      startingPrice: 2,
      turnaround: "Within 2 hours",
      icon: "copy",
      active: true,
    },
    {
      id: "svc-3",
      name: "Online Services",
      description: "Form filling, ticket booking, applications, and digital assistance.",
      startingPrice: 49,
      turnaround: "Same day",
      icon: "globe",
      active: true,
    },
    {
      id: "svc-4",
      name: "Custom Design",
      description: "Invitations, posters, cards, menus, and social creatives made for you.",
      startingPrice: 499,
      turnaround: "2–3 days",
      icon: "sparkles",
      active: true,
    },
  ],
  customers: [
    { id: "cus-1", name: "Aarav Mehta", email: "aarav@example.com", phone: "+91 98765 43021", orders: 8, joinedAt: "2026-08-12", status: "Active" },
    { id: "cus-2", name: "Nisha Kapoor", email: "nisha@example.com", phone: "+91 98123 77410", orders: 5, joinedAt: "2026-08-24", status: "Active" },
    { id: "cus-3", name: "Rohan Shah", email: "rohan@example.com", phone: "+91 98220 11884", orders: 3, joinedAt: "2026-09-02", status: "Active" },
    { id: "cus-4", name: "Meera Iyer", email: "meera@example.com", phone: "+91 98900 44218", orders: 11, joinedAt: "2026-07-18", status: "Active" },
  ],
  orders: [
    { id: "ORD-2084", customer: "Aarav Mehta", items: "HP DeskJet 2331 × 1", total: 6499, status: "Processing", date: "2026-09-17", payment: "Paid" },
    { id: "ORD-2083", customer: "Meera Iyer", items: "A4 Premium Paper × 4", total: 1396, status: "Completed", date: "2026-09-16", payment: "Paid" },
    { id: "ORD-2082", customer: "Nisha Kapoor", items: "Braided Type-C Cable × 2", total: 798, status: "Ready", date: "2026-09-15", payment: "Paid" },
    { id: "ORD-2081", customer: "Rohan Shah", items: "Logitech M185 Mouse × 1", total: 799, status: "Completed", date: "2026-09-14", payment: "Paid" },
  ],
  requests: [
    {
      id: "req-4401",
      reference: "SL-4401",
      customer: "Aarav Mehta",
      service: "Color Printing",
      status: "In Progress",
      submittedAt: "2026-09-17",
      dueDate: "2026-09-18",
      documents: [{ name: "college-presentation.pdf", type: "PDF", size: "2.4 MB", url: "#" }],
      notes: "Please print double-sided, color.",
      amount: 144,
    },
    {
      id: "req-4400",
      reference: "SL-4400",
      customer: "Nisha Kapoor",
      service: "Custom Design",
      status: "Waiting for Customer",
      submittedAt: "2026-09-16",
      dueDate: "2026-09-20",
      documents: [{ name: "wedding-card-reference.jpg", type: "JPG", size: "1.1 MB", url: "#" }],
      notes: "Need confirmation on the final color direction.",
      amount: 899,
    },
    {
      id: "req-4396",
      reference: "SL-4396",
      customer: "Meera Iyer",
      service: "Xerox & Scanning",
      status: "Completed",
      submittedAt: "2026-09-14",
      dueDate: "2026-09-14",
      documents: [{ name: "property-documents.png", type: "PNG", size: "4.8 MB", url: "#" }],
      notes: "Scan as one PDF.",
      amount: 180,
    },
  ],
  reviews: [
    { id: "rev-1", product: "Braided Type-C Cable", customer: "Nisha Kapoor", rating: 5, comment: "Feels sturdy and charges quickly. Great value.", date: "2026-09-12", visibility: "Published" },
    { id: "rev-2", product: "A4 Premium Paper · 500 sheets", customer: "Meera Iyer", rating: 5, comment: "Clean prints and the pack arrived perfectly.", date: "2026-09-10", visibility: "Published" },
    { id: "rev-3", product: "Logitech M185 Mouse", customer: "Rohan Shah", rating: 3, comment: "Works well, but I expected a quieter click.", date: "2026-09-08", visibility: "Pending" },
  ],
  inventory: [
    { id: "inv-1", product: "HP DeskJet 2331", sku: "HP-2331", onHand: 12, reserved: 2, reorderPoint: 8, status: "Healthy" },
    { id: "inv-2", product: "Braided Type-C Cable", sku: "ACC-TC-01", onHand: 48, reserved: 6, reorderPoint: 20, status: "Healthy" },
    { id: "inv-3", product: "Logitech M185 Mouse", sku: "LOG-M185", onHand: 7, reserved: 2, reorderPoint: 10, status: "Low stock" },
    { id: "inv-4", product: "A4 Premium Paper · 500 sheets", sku: "PAPER-A4-75", onHand: 82, reserved: 18, reorderPoint: 30, status: "Healthy" },
  ],
  invoices: [
    { id: "inv-1001", number: "SL-INV-1001", customer: "Aarav Mehta", orderId: "ORD-2084", amount: 6499, status: "Paid", issuedAt: "2026-09-17", dueAt: "2026-09-17" },
    { id: "inv-1000", number: "SL-INV-1000", customer: "Meera Iyer", orderId: "ORD-2083", amount: 1396, status: "Paid", issuedAt: "2026-09-16", dueAt: "2026-09-16" },
  ],
  banners: [
    { id: "ban-1", title: "Print better. Get it done.", subtitle: "Same-day printing and document services, without the back-and-forth.", cta: "Start a request", accent: "coral", active: true },
    { id: "ban-2", title: "Accessories that keep up.", subtitle: "Chargers, cables, and essentials chosen for everyday reliability.", cta: "Shop accessories", accent: "blue", active: true },
  ],
  offers: [
    { id: "off-1", code: "FIRSTPRINT", title: "10% off your first print request", discount: "10% off", expiresAt: "2026-10-31", active: true },
    { id: "off-2", code: "ACCESSORY25", title: "Save on your second accessory", discount: "₹100 off", expiresAt: "2026-09-30", active: true },
  ],
  content: [
    { id: "content-1", key: "about", title: "About Star Line", body: "A dependable local partner for printing, digital help, and everyday tech essentials.", published: true, updatedAt: "2026-09-14" },
    { id: "content-2", key: "hours", title: "Business hours", body: "Monday–Saturday, 9:00 AM–8:00 PM. Sunday, 10:00 AM–4:00 PM.", published: true, updatedAt: "2026-09-10" },
  ],
};