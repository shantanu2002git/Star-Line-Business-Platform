import { starlineData, type StarlineData, type StarlineRecord, type CartItem, type Order, type WishlistItem } from "../data/starline";

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

  // ---- Cart ----
  getCart() {
    return [...this.data.cart];
  }

  addToCart(productId: string, quantity = 1) {
    const product = this.find("products", productId) as Record<string, unknown> | undefined;
    if (!product) return { error: "Product not found" };
    const maxStock = Number(product.stock ?? 0);
    const price = Number(product.price ?? 0);
    const originalPrice = Number(product.originalPrice ?? price);
    const existing = this.data.cart.find((item) => item.id === productId);
    if (existing) {
      const nextQty = Math.min(existing.quantity + quantity, maxStock);
      existing.quantity = nextQty;
      return existing;
    }
    const item = {
      id: `cart-${Date.now()}`,
      productId,
      name: String(product.name ?? "Product"),
      image: String(product.image ?? ""),
      price,
      originalPrice,
      quantity: Math.min(quantity, maxStock),
      maxStock,
      addedAt: now(),
    };
    this.data.cart.push(item);
    return item;
  }

  updateCartQuantity(itemId: string, quantity: number) {
    const item = this.data.cart.find((entry) => entry.id === itemId);
    if (!item) return { error: "Cart item not found" };
    item.quantity = Math.max(1, Math.min(quantity, item.maxStock));
    return item;
  }

  removeCartItem(itemId: string) {
    const index = this.data.cart.findIndex((entry) => entry.id === itemId);
    if (index === -1) return false;
    this.data.cart.splice(index, 1);
    return true;
  }

  clearCart() {
    this.data.cart = [];
  }

  // ---- Wishlist ----
  getWishlist() {
    return [...this.data.wishlist];
  }

  addToWishlist(productId: string) {
    const product = this.find("products", productId) as Record<string, unknown> | undefined;
    if (!product) return { error: "Product not found" };
    const existing = this.data.wishlist.find((item) => item.id === productId);
    if (existing) return existing;
    const item = {
      id: `wish-${Date.now()}`,
      productId,
      name: String(product.name ?? "Product"),
      image: String(product.image ?? ""),
      price: Number(product.price ?? 0),
      addedAt: now(),
    };
    this.data.wishlist.push(item);
    return item;
  }

  removeFromWishlist(itemId: string) {
    const index = this.data.wishlist.findIndex((entry) => entry.id === itemId);
    if (index === -1) return false;
    this.data.wishlist.splice(index, 1);
    return true;
  }

  // ---- Cart price breakdown ----
  cartBreakdown(couponCode?: string | null) {
    const items = this.data.cart;
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalOriginal = items.reduce((sum, item) => sum + item.originalPrice * item.quantity, 0);
    const discount = totalOriginal - subtotal;
    const couponDiscount = couponCode ? this.couponValue(couponCode, subtotal) : 0;
    const platformDiscount = subtotal > 2000 ? Math.round(subtotal * 0.05) : 0;
    const deliveryCharge = subtotal >= 500 ? 0 : 49;
    const packagingCharge = 0;
    const taxable = subtotal - couponDiscount - platformDiscount;
    const tax = Math.round(taxable * 0.05);
    const total = subtotal - couponDiscount - platformDiscount + deliveryCharge + packagingCharge + tax;
    return {
      items: items.map((item) => ({
        ...item,
        itemTotal: item.price * item.quantity,
        itemOriginalTotal: item.originalPrice * item.quantity,
      })),
      subtotal,
      totalOriginal,
      discount,
      couponDiscount,
      couponCode: couponCode ?? null,
      platformDiscount,
      deliveryCharge,
      packagingCharge,
      tax,
      total,
      saved: totalOriginal - total,
    };
  }

  couponValue(code: string, subtotal: number) {
    const normalized = code.trim().toUpperCase();
    if (normalized === "FIRSTPRINT") return Math.round(subtotal * 0.1);
    if (normalized === "ACCESSORY25") return 100;
    return 0;
  }

  // ---- Checkout / Orders ----
  checkout(input: { customer: string; email: string; phone: string; address: string; city: string; state: string; pincode: string; paymentMethod: string; couponCode?: string | null }) {
    if (this.data.cart.length === 0) return { error: "Cart is empty" };
    const breakdown = this.cartBreakdown(input.couponCode ?? null);
    const items: OrderItem[] = this.data.cart.map((item) => ({
      id: `oi-${Date.now()}-${item.id}`,
      name: item.name,
      image: item.image,
      price: item.price,
      originalPrice: item.originalPrice,
      quantity: item.quantity,
      total: item.price * item.quantity,
    }));
    const order: Order = {
      id: `ord-${Date.now()}`,
      number: `SL-${Math.floor(10000 + Math.random() * 90000)}`,
      customer: input.customer,
      email: input.email,
      phone: input.phone,
      address: input.address,
      city: input.city,
      state: input.state,
      pincode: input.pincode,
      items,
      subtotal: breakdown.subtotal,
      discount: breakdown.discount + breakdown.couponDiscount + breakdown.platformDiscount,
      couponCode: input.couponCode ?? null,
      platformDiscount: breakdown.platformDiscount,
      deliveryCharge: breakdown.deliveryCharge,
      packagingCharge: breakdown.packagingCharge,
      tax: breakdown.tax,
      total: breakdown.total,
      status: "Confirmed",
      paymentMethod: input.paymentMethod,
      paymentStatus: "Paid",
      createdAt: now(),
      estimatedDelivery: this.addDays(now(), 5),
    };
    this.data.orders.unshift(order);
    this.data.cart = [];
    return order;
  }

  getOrder(id: string) {
    return (this.data.orders as unknown[]).find((order) => (order as { id: string }).id === id) as Order | undefined;
  }

  listOrders(customer?: string) {
    return this.data.orders.filter((order) => !customer || order.customer.toLowerCase() === customer.toLowerCase());
  }

  private addDays(dateStr: string, days: number) {
    const date = new Date(dateStr);
    date.setDate(date.getDate() + days);
    return date.toISOString().slice(0, 10);
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