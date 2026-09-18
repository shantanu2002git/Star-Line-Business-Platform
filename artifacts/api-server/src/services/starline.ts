import { starlineData, type StarlineData, type StarlineRecord } from "../data/starline";

type CollectionName = keyof StarlineData;
type ListOptions = { search?: string; page?: number; pageSize?: number; status?: string; category?: string; featured?: boolean; visibility?: string };

const now = () => new Date().toISOString().slice(0, 10);

class StarlineService {
  constructor(private readonly data: StarlineData) {}

  list(name: CollectionName, options: ListOptions = {}) {
    let items = [...this.data[name]];
    const needle = options.search?.trim().toLowerCase();
    if (needle) items = items.filter((item) => JSON.stringify(item).toLowerCase().includes(needle));
    if (options.status) items = items.filter((item) => item.status === options.status);
    if (options.category) items = items.filter((item) => item.category === options.category);
    if (typeof options.featured === "boolean") items = items.filter((item) => item.featured === options.featured);
    if (options.visibility) items = items.filter((item) => item.visibility === options.visibility);
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const start = (page - 1) * pageSize;
    return { items: items.slice(start, start + pageSize), pagination: { page, pageSize, total: items.length, totalPages: Math.max(Math.ceil(items.length / pageSize), 1) } };
  }

  array(name: CollectionName) {
    return [...this.data[name]];
  }

  find(name: CollectionName, id: string) {
    return this.data[name].find((item) => item.id === id);
  }

  create(name: CollectionName, input: Record<string, unknown>) {
    const item: StarlineRecord = { ...input, id: `${String(name).slice(0, -1)}-${Date.now()}`, ...(name === "requests" ? { reference: `SL-${Math.floor(4000 + Math.random() * 900)}`, submittedAt: now(), status: input.status ?? "Submitted", documents: input.documents ?? [] } : {}), ...(name === "orders" ? { date: now(), status: input.status ?? "Pending" } : {}), ...(name === "invoices" ? { number: `SL-INV-${Math.floor(1000 + Math.random() * 8999)}`, issuedAt: now(), status: input.status ?? "Pending" } : {}), ...(name === "reviews" ? { date: now(), visibility: input.visibility ?? "Pending" } : {}), ...(name === "content" ? { updatedAt: now() } : {}) };
    this.data[name].unshift(item);
    return item;
  }

  update(name: CollectionName, id: string, input: Record<string, unknown>) {
    const index = this.data[name].findIndex((item) => item.id === id);
    if (index === -1) return undefined;
    this.data[name][index] = { ...this.data[name][index], ...input, id };
    return this.data[name][index];
  }

  remove(name: CollectionName, id: string) {
    const index = this.data[name].findIndex((item) => item.id === id);
    if (index === -1) return false;
    this.data[name].splice(index, 1);
    return true;
  }

  dashboard() {
    const requestCount = this.data.requests.length;
    const completed = this.data.requests.filter((item) => ["Completed", "Delivered"].includes(String(item.status))).length;
    const lowStock = this.data.inventory.filter((item) => item.status === "Low stock").length;
    const point = (label: string, value: number, color?: string) => ({ label, value, ...(color ? { color } : {}) });
    return {
      metrics: { revenue: 186420, orders: 184, customers: 96, products: 66, services: this.data.services.length, pendingRequests: requestCount - completed, completedRequests: completed, lowStock },
      revenueTrend: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((label, index) => point(label, [84200, 101500, 116400, 132800, 156200, 186420][index])),
      monthlyOrders: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((label, index) => point(label, [22, 31, 38, 42, 51, 60][index])),
      serviceRequests: [point("Submitted", 18, "amber"), point("In progress", 12, "blue"), point("Completed", 34, "green"), point("Delivered", 21, "violet")],
      productAvailability: [point("Healthy", 52, "green"), point("Low stock", 9, "amber"), point("Out of stock", 5, "red")],
      topProducts: this.data.products.slice(0, 4).map((item) => point(String(item.name), Number(item.reviews ?? 0) + 20)),
      customerGrowth: ["Apr", "May", "Jun", "Jul", "Aug", "Sep"].map((label, index) => point(label, [32, 41, 49, 58, 73, 96][index])),
      inventoryStatus: this.data.inventory.map((item) => point(String(item.product), Number(item.onHand ?? 0), item.status === "Low stock" ? "amber" : "green")),
      recentActivity: [
        { id: "activity-1", title: "New print request", detail: "SL-4401 from Aarav Mehta", time: "12 min ago", tone: "blue" },
        { id: "activity-2", title: "Order completed", detail: "ORD-2083 is ready for pickup", time: "48 min ago", tone: "green" },
        { id: "activity-3", title: "Stock running low", detail: "Logitech M185 Mouse · 7 left", time: "2 hr ago", tone: "amber" },
      ],
    };
  }
}

export const starlineService = new StarlineService(starlineData);