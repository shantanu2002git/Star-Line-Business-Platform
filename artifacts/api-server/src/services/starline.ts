import {
  collections,
  mongoose,
  type BusinessRecord,
  type CollectionName,
} from "@workspace/db";
import { Types, type ClientSession, type Model } from "mongoose";
import type { CartItem, Notification, Order, StarlineRecord } from "../data/starline";

type ListOptions = {
  search?: string;
  page?: number;
  pageSize?: number;
  status?: string;
  category?: string;
  featured?: boolean;
  visibility?: string;
};

type CartInput = {
  customer: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  pincode: string;
  paymentMethod: string;
  couponCode?: string | null;
};

type OrderLine = CartItem & {
  itemTotal: number;
  itemOriginalTotal: number;
};

const searchableFields: Record<CollectionName, string[]> = {
  products: ["name", "category", "brand", "sku", "description"],
  categories: ["name", "slug"],
  services: ["name", "description"],
  customers: ["name", "email", "phone"],
  orders: ["number", "customer", "email", "status"],
  requests: ["reference", "customer", "service", "status"],
  reviews: ["product", "customer", "comment"],
  inventory: ["product", "sku", "status"],
  invoices: ["number", "customer", "status"],
  banners: ["title", "subtitle"],
  offers: ["code", "title"],
  content: ["key", "title", "body"],
  cart: ["name"],
  wishlist: ["name"],
  notifications: ["customer", "title", "message", "type"],
};

const ownerCollections = new Set<CollectionName>([
  "customers",
  "orders",
  "requests",
  "reviews",
  "invoices",
  "cart",
  "wishlist",
  "notifications",
]);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPlainRecord(value: unknown): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    "toObject" in value &&
    typeof value.toObject === "function"
  ) {
    return value.toObject() as Record<string, unknown>;
  }
  return value as Record<string, unknown>;
}

function serializeNested(value: unknown): unknown {
  if (value instanceof Types.ObjectId) return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(serializeNested);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        serializeNested(child),
      ]),
    );
  }
  return value;
}

function serialize(value: unknown): StarlineRecord {
  const source = toPlainRecord(value);
  const id = source._id;
  if (!(id instanceof Types.ObjectId)) {
    throw new Error("MongoDB returned a document without an ObjectId.");
  }

  const { _id: _ignoredId, __v: _ignoredVersion, sessionId: _ignoredSession, ...publicFields } =
    source;
  return {
    ...serializeNested(publicFields) as Record<string, unknown>,
    id: id.toString(),
  };
}

function cleanInput(input: Record<string, unknown>): Record<string, unknown> {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ApiError("A JSON object is required.", 400);
  }

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      key.startsWith("$") ||
      key === "__proto__" ||
      key === "constructor" ||
      key === "prototype"
    ) {
      throw new ApiError(`Invalid field "${key}".`, 400);
    }
    if (
      ["_id", "id", "__v", "sessionId", "createdAt", "updatedAt"].includes(key)
    ) {
      continue;
    }
    result[key] = value;
  }
  return result;
}

function validateProductImage(value: unknown): void {
  if (typeof value !== "string" || !value.startsWith("data:")) return;

  const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match || Buffer.from(match[2]!, "base64").toString("base64") !== match[2]) {
    throw new ApiError("Product image must be a valid JPEG, PNG, WebP, or GIF.", 400);
  }
  if (Buffer.byteLength(match[2]!, "base64") > 3 * 1024 * 1024) {
    throw new ApiError("Product image must be 3 MB or smaller.", 400);
  }
}

function modelFor(name: CollectionName): Model<BusinessRecord> {
  return collections[name];
}

function objectId(value: string | undefined): Types.ObjectId | undefined {
  return value && Types.ObjectId.isValid(value)
    ? new Types.ObjectId(value)
    : undefined;
}

function systemNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
  return value;
}

function statusForStock(onHand: number, reorderPoint: number): string {
  if (onHand <= 0) return "Out of stock";
  return onHand <= reorderPoint ? "Low stock" : "Healthy";
}

function dateValue(record: Record<string, unknown>, ...keys: string[]): Date {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" || value instanceof Date) {
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) return date;
    }
  }
  return new Date(0);
}

function relativeTime(date: Date): string {
  const minutes = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return `${Math.floor(hours / 24)} days ago`;
}

class StarlineService {
  async list(
    name: CollectionName,
    options: ListOptions = {},
    sessionId?: string,
  ) {
    const page = Math.max(options.page ?? 1, 1);
    const pageSize = Math.min(Math.max(options.pageSize ?? 20, 1), 100);
    const filter: Record<string, unknown> = {};
    if (options.status) filter.status = options.status;
    if (options.category) filter.category = options.category;
    if (typeof options.featured === "boolean") filter.featured = options.featured;
    if (options.visibility) filter.visibility = options.visibility;
    if (sessionId && ownerCollections.has(name)) filter.sessionId = sessionId;

    const needle = options.search?.trim();
    if (needle) {
      const regex = new RegExp(escapeRegex(needle), "i");
      filter.$or = searchableFields[name].map((field) => ({ [field]: regex }));
    }

    const collection = modelFor(name);
    const [documents, total] = await Promise.all([
      collection
        .find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .exec(),
      collection.countDocuments(filter).exec(),
    ]);

    return {
      items: documents.map(serialize),
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      },
    };
  }

  async array(name: CollectionName, sessionId?: string) {
    const filter =
      sessionId && ownerCollections.has(name) ? { sessionId } : {};
    const documents = await modelFor(name)
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .exec();
    return documents.map(serialize);
  }

  async find(name: CollectionName, id: string) {
    if (!objectId(id)) return undefined;
    const document = await modelFor(name).findById(id).exec();
    return document ? serialize(document) : undefined;
  }

  async create(
    name: CollectionName,
    input: Record<string, unknown>,
    sessionId?: string,
  ) {
    const values = cleanInput(input);
    if (name === "products") validateProductImage(values.image);
    const id = new Types.ObjectId();
    const now = new Date().toISOString();

    if (ownerCollections.has(name) && sessionId) values.sessionId = sessionId;
    if (
      (name === "customers" || name === "requests") &&
      typeof values.email === "string"
    ) {
      const email = values.email.trim().toLowerCase();
      if (email) values.email = email;
      else delete values.email;
    }
    if (name === "requests") {
      values.reference = `SL-${id.toString().slice(-8).toUpperCase()}`;
      values.submittedAt ??= now;
      values.status ??= "Submitted";
      values.documents ??= [];
    } else if (name === "orders") {
      values.number ??= `SL-${id.toString().slice(-8).toUpperCase()}`;
      values.date ??= now.slice(0, 10);
      values.createdAt ??= now;
      values.status ??= "Pending";
      values.paymentStatus ??= "Pending";
    } else if (name === "invoices") {
      values.number ??= `SL-INV-${id.toString().slice(-8).toUpperCase()}`;
      values.issuedAt ??= now.slice(0, 10);
      values.status ??= "Pending";
    } else if (name === "reviews") {
      values.date ??= now.slice(0, 10);
      values.visibility ??= "Pending";
    } else if (name === "customers") {
      values.joinedAt ??= now;
      if (typeof values.email === "string") values.email = values.email.trim().toLowerCase();
    } else if (name === "products" && values.originalPrice === undefined) {
      values.originalPrice = values.price;
    }

    if (name === "products" && typeof values.category === "string") {
      const category = await this.findReference(
        "categories",
        values.category,
        ["name", "slug"],
      );
      if (category) values.categoryId = category._id;
    }

    if (name === "requests") {
      const service = await this.findReference(
        "services",
        String(values.service ?? ""),
        ["name"],
      );
      if (service) values.serviceId = service._id;
      const customer = await this.findOrCreateCustomer(values, sessionId);
      if (customer) values.customerId = customer._id;
    }
    if (name === "reviews") {
      const product = await this.findReference(
        "products",
        String(values.product ?? ""),
        ["name", "sku"],
      );
      const customer = await this.findReference(
        "customers",
        String(values.customer ?? ""),
        ["name", "email"],
      );
      if (product) values.productId = product._id;
      if (customer) values.customerId = customer._id;
    }
    if (name === "inventory") {
      const product = await this.findReference(
        "products",
        String(values.product ?? ""),
        ["name", "sku"],
      );
      if (product) values.productId = product._id;
    }

    const document = await modelFor(name).create({ ...values, _id: id });

    if (name === "inventory") {
      await this.syncInventoryToProduct(serialize(document));
    }
    if (name === "products" && values.categoryId instanceof Types.ObjectId) {
      await collections.categories
        .updateOne({ _id: values.categoryId }, { $inc: { productCount: 1 } })
        .exec();
    }
    if (name === "products") {
      await this.syncProductStock(
        id,
        String(values.name ?? ""),
        values.sku,
        Number(document.get("stock") ?? 0),
      );
    }
    if (name === "reviews" && values.productId instanceof Types.ObjectId) {
      await this.syncProductReviews(values.productId);
    }

    return serialize(document);
  }

  async update(name: CollectionName, id: string, input: Record<string, unknown>) {
    if (!objectId(id)) return undefined;
    const values = cleanInput(input);
    if (name === "products") validateProductImage(values.image);
    const unsetFields: Record<string, ""> = {};
    if (
      (name === "customers" || name === "requests") &&
      typeof values.email === "string"
    ) {
      const email = values.email.trim().toLowerCase();
      if (email) values.email = email;
      else {
        delete values.email;
        unsetFields.email = "";
      }
    }
    if (name === "products" && typeof values.category === "string") {
      const category = await this.findReference(
        "categories",
        values.category,
        ["name", "slug"],
      );
      if (category) values.categoryId = category._id;
      else {
        delete values.categoryId;
        unsetFields.categoryId = "";
      }
    }
    if (name === "reviews") {
      if (typeof values.product === "string") {
        const product = await this.findReference(
          "products",
          values.product,
          ["name", "sku"],
        );
        if (product) values.productId = product._id;
        else {
          delete values.productId;
          unsetFields.productId = "";
        }
      }
      if (typeof values.customer === "string") {
        const customer = await this.findReference(
          "customers",
          values.customer,
          ["name", "email"],
        );
        if (customer) values.customerId = customer._id;
        else {
          delete values.customerId;
          unsetFields.customerId = "";
        }
      }
    }
    const previous =
      name === "products" || name === "reviews"
        ? await modelFor(name).findById(id).exec()
        : undefined;

    const update: Record<string, unknown> = { $set: values };
    if (Object.keys(unsetFields).length) update.$unset = unsetFields;
    const updated = await modelFor(name)
      .findByIdAndUpdate(id, update, { new: true, runValidators: true })
      .exec();
    if (!updated) return undefined;

    if (name === "products" && typeof values.stock === "number") {
      const productId = objectId(String(updated._id));
      if (!productId) {
        throw new Error("Updated product has an invalid MongoDB ObjectId.");
      }
      await this.syncProductStock(
        productId,
        String(updated.get("name") ?? ""),
        updated.get("sku"),
        values.stock,
      );
    } else if (name === "inventory") {
      await this.syncInventoryToProduct(serialize(updated));
    }
    if (name === "products" && previous) {
      const previousCategory = previous.get("categoryId");
      const nextCategory = updated.get("categoryId");
      if (
        previousCategory instanceof Types.ObjectId &&
        (!(nextCategory instanceof Types.ObjectId) ||
          !previousCategory.equals(nextCategory))
      ) {
        await collections.categories
          .updateOne({ _id: previousCategory }, { $inc: { productCount: -1 } })
          .exec();
      }
      if (
        nextCategory instanceof Types.ObjectId &&
        !(previousCategory instanceof Types.ObjectId &&
          previousCategory.equals(nextCategory))
      ) {
        await collections.categories
          .updateOne({ _id: nextCategory }, { $inc: { productCount: 1 } })
          .exec();
      }
    }
    if (name === "reviews" && previous) {
      const previousProduct = previous.get("productId");
      const updatedProduct = updated.get("productId");
      if (previousProduct instanceof Types.ObjectId) {
        await this.syncProductReviews(previousProduct);
      }
      if (
        updatedProduct instanceof Types.ObjectId &&
        !(previousProduct instanceof Types.ObjectId &&
          previousProduct.equals(updatedProduct))
      ) {
        await this.syncProductReviews(updatedProduct);
      }
    }
    return serialize(updated);
  }

  async updateOrder(id: string, input: Record<string, unknown>) {
    if (!objectId(id)) return undefined;
    const previousDocument = await collections.orders.findById(id).exec();
    if (!previousDocument) return undefined;
    const previous = serialize(previousDocument);
    const ownerSession = String(previousDocument.get("sessionId") ?? "");
    const updated = await this.update("orders", id, input);
    if (
      updated &&
      typeof input.status === "string" &&
      input.status !== previous.status
    ) {
      await this.addNotification(
        ownerSession,
        String(previous.customer ?? ""),
        {
          orderId: id,
          title: `Order ${input.status}`,
          message: `Your order ${String(previous.number ?? "")} is now ${input.status.toLowerCase()}.`,
          type: "order-status",
        },
      );
    }
    return updated;
  }

  async updateRequest(id: string, input: Record<string, unknown>) {
    if (!objectId(id)) return undefined;
    const previousDocument = await collections.requests.findById(id).exec();
    if (!previousDocument) return undefined;
    const previous = serialize(previousDocument);
    const ownerSession = String(previousDocument.get("sessionId") ?? "");
    const updated = await this.update("requests", id, input);
    if (
      updated &&
      typeof input.status === "string" &&
      input.status !== previous.status
    ) {
      await this.addNotification(
        ownerSession,
        String(previous.customer ?? ""),
        {
          title: "Request status updated",
          message: `${String(previous.service ?? "Your request")} is now ${input.status.toLowerCase()}.`,
          type: "request-status",
        },
      );
    }
    return updated;
  }

  async addNotification(
    sessionId: string,
    customer: string,
    input: {
      title: string;
      message: string;
      type: string;
      orderId?: string;
    },
  ): Promise<StarlineRecord | undefined> {
    if (!sessionId) return undefined;
    const values: Record<string, unknown> = {
      sessionId,
      customer,
      title: input.title,
      message: input.message,
      type: input.type,
      read: false,
    };
    const orderId = objectId(input.orderId);
    if (orderId) values.orderId = orderId;
    return serialize(await collections.notifications.create(values));
  }

  async listNotifications(sessionId: string, customer?: string) {
    const filter: Record<string, unknown> = { sessionId };
    if (customer) filter.customer = customer;
    return (await collections.notifications
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .exec()).map(serialize);
  }

  async markNotificationRead(id: string, sessionId: string) {
    if (!objectId(id)) return undefined;
    const item = await collections.notifications
      .findOneAndUpdate(
        { _id: id, sessionId },
        { $set: { read: true } },
        { new: true, runValidators: true },
      )
      .exec();
    return item ? serialize(item) : undefined;
  }

  async listOrders(customer?: string, sessionId?: string) {
    const filter: Record<string, unknown> = {};
    if (customer) filter.customer = customer;
    if (sessionId) filter.sessionId = sessionId;
    return (await collections.orders
      .find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .exec()).map(serialize);
  }

  async remove(name: CollectionName, id: string) {
    if (!objectId(id)) return false;
    const existing = await modelFor(name).findById(id).exec();
    if (!existing) return false;
    const removed = await modelFor(name).findByIdAndDelete(id).exec();
    if (!removed) return false;

    if (name === "products") {
      const categoryId = existing.get("categoryId");
      if (categoryId instanceof Types.ObjectId) {
        await collections.categories
          .updateOne({ _id: categoryId }, { $inc: { productCount: -1 } })
          .exec();
      }
    }
    if (name === "reviews") {
      const productId = existing.get("productId");
      if (productId instanceof Types.ObjectId) {
        await this.syncProductReviews(productId);
      }
    }
    if (name === "inventory") {
      const productId = existing.get("productId");
      if (productId instanceof Types.ObjectId) {
        await collections.products
          .updateOne({ _id: productId }, { $set: { stock: 0 } })
          .exec();
      }
    }
    const references: Partial<Record<CollectionName, Record<string, unknown>>> = {
      categories: { categoryId: removed._id },
      services: { serviceId: removed._id },
      products: { productId: removed._id },
      customers: { customerId: removed._id },
      orders: { orderId: removed._id },
    };
    const refFilter = references[name];
    if (refFilter) {
      if (name === "products") {
        await Promise.all([
          collections.cart.deleteMany(refFilter).exec(),
          collections.wishlist.deleteMany(refFilter).exec(),
          collections.inventory.deleteMany(refFilter).exec(),
          collections.reviews.updateMany(refFilter, { $unset: { productId: 1 } }).exec(),
        ]);
      } else if (name === "categories") {
        await collections.products
          .updateMany(refFilter, { $unset: { categoryId: 1 } })
          .exec();
      } else if (name === "services") {
        await collections.requests
          .updateMany(refFilter, { $unset: { serviceId: 1 } })
          .exec();
      } else if (name === "customers") {
        await Promise.all([
          collections.orders.updateMany(refFilter, { $unset: { customerId: 1 } }).exec(),
          collections.requests.updateMany(refFilter, { $unset: { customerId: 1 } }).exec(),
          collections.reviews.updateMany(refFilter, { $unset: { customerId: 1 } }).exec(),
          collections.invoices.updateMany(refFilter, { $unset: { customerId: 1 } }).exec(),
        ]);
      } else if (name === "orders") {
        await collections.invoices
          .updateMany(refFilter, { $unset: { orderId: 1 } })
          .exec();
      }
    }
    return true;
  }

  async getCart(sessionId: string): Promise<CartItem[]> {
    const items = await collections.cart
      .find({ sessionId })
      .sort({ createdAt: 1, _id: 1 })
      .exec();
    return items.map(serialize) as unknown as CartItem[];
  }

  async addToCart(sessionId: string, productId: string, quantity = 1) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError("Quantity must be a positive whole number.", 400);
    }
    if (!objectId(productId)) throw new ApiError("Product not found.", 404);
    const product = await collections.products.findById(productId).exec();
    if (!product) throw new ApiError("Product not found.", 404);
    const stock = Number(product.get("stock") ?? 0);
    const existing = await collections.cart
      .findOne({ sessionId, productId: product._id })
      .exec();
    const nextQuantity = Number(existing?.get("quantity") ?? 0) + quantity;
    if (nextQuantity > stock) {
      throw new ApiError("Requested quantity exceeds available stock.", 409);
    }

    const item = await collections.cart.findOneAndUpdate(
      { sessionId, productId: product._id },
      {
        $set: {
          name: product.get("name"),
          image: product.get("image") ?? "",
          price: product.get("price"),
          originalPrice: product.get("originalPrice") ?? product.get("price"),
          maxStock: stock,
          quantity: nextQuantity,
        },
        $setOnInsert: { addedAt: new Date().toISOString() },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();
    return serialize(item);
  }

  async updateCartQuantity(sessionId: string, itemId: string, quantity: number) {
    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new ApiError("Quantity must be a positive whole number.", 400);
    }
    if (!objectId(itemId)) throw new ApiError("Cart item not found.", 404);
    const item = await collections.cart.findOne({ _id: itemId, sessionId }).exec();
    if (!item) throw new ApiError("Cart item not found.", 404);
    const product = await collections.products.findById(item.get("productId")).exec();
    if (!product) throw new ApiError("Product no longer exists.", 409);
    const stock = Number(product.get("stock") ?? 0);
    if (quantity > stock) {
      throw new ApiError("Requested quantity exceeds available stock.", 409);
    }
    item.set({
      quantity,
      maxStock: stock,
      name: product.get("name"),
      image: product.get("image") ?? "",
      price: product.get("price"),
      originalPrice: product.get("originalPrice") ?? product.get("price"),
    });
    await item.save();
    return serialize(item);
  }

  async removeCartItem(sessionId: string, itemId: string) {
    if (!objectId(itemId)) return false;
    const result = await collections.cart
      .deleteOne({ _id: itemId, sessionId })
      .exec();
    return result.deletedCount > 0;
  }

  async clearCart(sessionId: string) {
    await collections.cart.deleteMany({ sessionId }).exec();
  }

  async getWishlist(sessionId: string): Promise<StarlineRecord[]> {
    const items = await collections.wishlist
      .find({ sessionId })
      .sort({ createdAt: -1, _id: -1 })
      .exec();
    return items.map(serialize);
  }

  async addToWishlist(sessionId: string, productId: string) {
    if (!objectId(productId)) throw new ApiError("Product not found.", 404);
    const product = await collections.products.findById(productId).exec();
    if (!product) throw new ApiError("Product not found.", 404);
    const item = await collections.wishlist.findOneAndUpdate(
      { sessionId, productId: product._id },
      {
        $setOnInsert: {
          name: product.get("name"),
          image: product.get("image") ?? "",
          price: product.get("price"),
          addedAt: new Date().toISOString(),
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();
    return serialize(item);
  }

  async removeFromWishlist(sessionId: string, itemId: string) {
    if (!objectId(itemId)) return false;
    const result = await collections.wishlist
      .deleteOne({ _id: itemId, sessionId })
      .exec();
    return result.deletedCount > 0;
  }

  async cartBreakdown(sessionId: string, couponCode?: string | null) {
    const cart = await collections.cart.find({ sessionId }).exec();
    const items: OrderLine[] = [];
    for (const item of cart) {
      const product = await collections.products.findById(item.get("productId")).exec();
      if (!product) continue;
      const price = Number(product.get("price") ?? 0);
      const originalPrice = Number(product.get("originalPrice") ?? price);
      const quantity = Number(item.get("quantity") ?? 0);
      items.push({
        ...serialize(item) as unknown as CartItem,
        name: String(product.get("name") ?? ""),
        image: String(product.get("image") ?? ""),
        price,
        originalPrice,
        maxStock: Number(product.get("stock") ?? 0),
        itemTotal: price * quantity,
        itemOriginalTotal: originalPrice * quantity,
      });
    }
    return this.calculateBreakdown(items, couponCode);
  }

  private async calculateBreakdown(
    items: Array<CartItem | OrderLine>,
    couponCode?: string | null,
    session?: ClientSession,
  ) {
    const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const totalOriginal = items.reduce(
      (sum, item) => sum + item.originalPrice * item.quantity,
      0,
    );
    const discount = totalOriginal - subtotal;
    let couponDiscount = 0;
    if (couponCode) {
      const offer = await collections.offers
        .findOne({
          code: couponCode.trim().toUpperCase(),
          active: true,
          $or: [{ expiresAt: { $exists: false } }, { expiresAt: "" }, { expiresAt: { $gte: new Date().toISOString().slice(0, 10) } }],
        })
        .session(session ?? null)
        .exec();
      if (!offer) throw new ApiError("This offer is invalid, inactive, or expired.", 400);
      let discountType = offer.get("discountType");
      let value = Number(offer.get("discountValue") ?? 0);
      if (!discountType) {
        const match = String(offer.get("discount") ?? "").match(/(\d+(?:\.\d+)?)\s*(%|percent|off)/i);
        if (match) {
          value = Number(match[1]);
          discountType = match[2] === "%" || /percent/i.test(match[2] ?? "")
            ? "percentage"
            : "fixed";
        }
      }
      if (!Number.isFinite(value) || value < 0) {
        throw new ApiError("This offer has an invalid discount value.", 400);
      }
      couponDiscount =
        discountType === "percentage"
          ? Math.round((subtotal * Math.min(value, 100)) / 100)
          : value;
      couponDiscount = Math.min(Math.max(couponDiscount, 0), subtotal);
    }

    const platformRate = systemNumber("PLATFORM_DISCOUNT_RATE", 0);
    const platformThreshold = systemNumber("PLATFORM_DISCOUNT_THRESHOLD", 0);
    const platformDiscount =
      subtotal > platformThreshold && platformRate > 0
        ? Math.round(subtotal * Math.min(platformRate, 1))
        : 0;
    const freeDeliveryThreshold = systemNumber("FREE_DELIVERY_THRESHOLD", 0);
    const deliveryCharge =
      subtotal >= freeDeliveryThreshold
        ? 0
        : systemNumber("DELIVERY_CHARGE", 0);
    const packagingCharge = systemNumber("PACKAGING_CHARGE", 0);
    const taxRate = systemNumber("TAX_RATE", 0);
    if (taxRate > 1) throw new Error("TAX_RATE must not exceed 1.");
    const taxable = Math.max(0, subtotal - couponDiscount - platformDiscount);
    const tax = Math.round(taxable * taxRate);
    const total =
      taxable + deliveryCharge + packagingCharge + tax;

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

  async checkout(sessionId: string, input: CartInput): Promise<Order> {
    const name = input.customer.trim();
    const email = input.email.trim().toLowerCase();
    if (!name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new ApiError("A customer name and valid email are required.", 400);
    }
    if (
      !input.phone.trim() ||
      !input.address.trim() ||
      !input.city.trim() ||
      !input.state.trim() ||
      !input.pincode.trim() ||
      !input.paymentMethod.trim()
    ) {
      throw new ApiError("Complete all delivery and payment fields.", 400);
    }
    const session = await mongoose.startSession();
    let result: StarlineRecord | undefined;
    try {
      await session.withTransaction(async () => {
        const cart = await collections.cart.find({ sessionId }).session(session).exec();
        if (cart.length === 0) throw new ApiError("Cart is empty.", 400);
        const lines: CartItem[] = [];
        const orderItems: Record<string, unknown>[] = [];

        for (const cartItem of cart) {
          const product = await collections.products
            .findById(cartItem.get("productId"))
            .session(session)
            .exec();
          if (!product) throw new ApiError("A cart product no longer exists.", 409);
          const quantity = Number(cartItem.get("quantity"));
          const price = Number(product.get("price") ?? 0);
          const originalPrice = Number(product.get("originalPrice") ?? price);
          lines.push({
            ...serialize(cartItem) as unknown as CartItem,
            name: String(product.get("name") ?? ""),
            image: String(product.get("image") ?? ""),
            price,
            originalPrice,
          });
          orderItems.push({
            productId: product._id,
            name: product.get("name"),
            image: product.get("image") ?? "",
            price,
            originalPrice,
            quantity,
            total: price * quantity,
          });
          const stockUpdate = await collections.products
            .updateOne(
              { _id: product._id, stock: { $gte: quantity } },
              { $inc: { stock: -quantity } },
              { session },
            )
            .exec();
          if (stockUpdate.modifiedCount !== 1) {
            throw new ApiError("Requested quantity exceeds available stock.", 409);
          }
          await collections.inventory
            .updateOne(
              { productId: product._id },
              [
                {
                  $set: {
                    onHand: { $max: [0, { $subtract: ["$onHand", quantity] }] },
                    status: {
                      $cond: [
                        { $lte: [{ $subtract: ["$onHand", quantity] }, 0] },
                        "Out of stock",
                        {
                          $cond: [
                            { $lte: [{ $subtract: ["$onHand", quantity] }, "$reorderPoint"] },
                            "Low stock",
                            "Healthy",
                          ],
                        },
                      ],
                    },
                  },
                },
              ],
              { session },
            )
            .exec();
        }

        const breakdown = await this.calculateBreakdown(
          lines,
          input.couponCode,
          session,
        );
        const customer = await collections.customers.findOneAndUpdate(
          { email },
          {
            $set: {
              name,
              email,
              phone: input.phone.trim(),
              sessionId,
            },
            $setOnInsert: {
              joinedAt: new Date().toISOString(),
              status: "Active",
              orders: 0,
            },
          },
          {
            upsert: true,
            new: true,
            runValidators: true,
            setDefaultsOnInsert: true,
            session,
          },
        ).exec();

        const orderId = new Types.ObjectId();
        const invoiceId = new Types.ObjectId();
        const order = await collections.orders.create(
          [
            {
              _id: orderId,
              sessionId,
              number: `SL-${orderId.toString().slice(-8).toUpperCase()}`,
              invoiceNumber: `SL-INV-${invoiceId.toString().slice(-8).toUpperCase()}`,
              customer: name,
              customerId: customer._id,
              email,
              phone: input.phone.trim(),
              address: input.address.trim(),
              city: input.city.trim(),
              state: input.state.trim(),
              pincode: input.pincode.trim(),
              items: orderItems,
              subtotal: breakdown.subtotal,
              discount:
                breakdown.discount +
                breakdown.couponDiscount +
                breakdown.platformDiscount,
              couponCode: input.couponCode ?? null,
              platformDiscount: breakdown.platformDiscount,
              deliveryCharge: breakdown.deliveryCharge,
              packagingCharge: breakdown.packagingCharge,
              tax: breakdown.tax,
              total: breakdown.total,
              status: "Confirmed",
              paymentMethod: input.paymentMethod.trim(),
              paymentStatus: "Pending",
              createdAt: new Date(),
              ...(process.env.ESTIMATED_DELIVERY_DAYS === undefined
                ? {}
                : {
                    estimatedDelivery: new Date(
                      Date.now() +
                        systemNumber("ESTIMATED_DELIVERY_DAYS", 0) *
                          86_400_000,
                    )
                      .toISOString()
                      .slice(0, 10),
                  }),
            },
          ],
          { session },
        );
        const createdOrder = order[0];
        if (!createdOrder) throw new Error("MongoDB failed to create the order.");
        await collections.customers
          .updateOne({ _id: customer._id }, { $inc: { orders: 1 } }, { session })
          .exec();

        await collections.invoices.create(
          [
            {
              _id: invoiceId,
              sessionId,
              number: `SL-INV-${invoiceId.toString().slice(-8).toUpperCase()}`,
              customer: name,
              customerId: customer._id,
              orderId,
              amount: breakdown.total,
              status: "Pending",
              issuedAt: new Date().toISOString().slice(0, 10),
              dueAt: new Date().toISOString().slice(0, 10),
            },
          ],
          { session },
        );
        await collections.notifications.create(
          [
            {
              sessionId,
              customer: name,
              customerId: customer._id,
              orderId,
              title: "Order placed",
              message: `Your order ${createdOrder.get("number")} was placed successfully.`,
              type: "order-placed",
              read: false,
            },
          ],
          { session },
        );
        await collections.cart.deleteMany({ sessionId }, { session }).exec();
        result = serialize(createdOrder);
      });
    } finally {
      await session.endSession();
    }
    if (!result) throw new Error("MongoDB transaction completed without an order.");
    return result as unknown as Order;
  }

  async dashboard() {
    const now = new Date();
    const monthStarts = Array.from({ length: 6 }, (_, index) => {
      const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 5 + index, 1));
      return date;
    });
    const monthEnds = monthStarts.map((start, index) =>
      index < monthStarts.length - 1
        ? monthStarts[index + 1]!
        : new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)),
    );
    const [orders, customers, products, services, requests, inventory] =
      await Promise.all([
        collections.orders.find().sort({ createdAt: -1 }).exec(),
        collections.customers.find().sort({ createdAt: -1 }).exec(),
        collections.products.find().sort({ createdAt: -1 }).exec(),
        collections.services.find().sort({ createdAt: -1 }).exec(),
        collections.requests.find().sort({ createdAt: -1 }).exec(),
        collections.inventory.find().sort({ createdAt: -1 }).exec(),
      ]);

    const orderRecords = orders.map((record) => toPlainRecord(record));
    const requestRecords = requests.map((record) => toPlainRecord(record));
    const inventoryRecords = inventory.map((record) => toPlainRecord(record));
    const paidOrders = orderRecords.filter(
      (order) =>
        String(order.paymentStatus ?? "").toLowerCase() === "paid" &&
        String(order.status ?? "").toLowerCase() !== "cancelled",
    );
    const thisMonthRevenue = paidOrders
      .filter((order) => dateValue(order, "createdAt", "date") >= monthStarts[5]!)
      .reduce((sum, order) => sum + Number(order.total ?? 0), 0);
    const requestStatusCount = (statuses: string[]) =>
      requestRecords.filter((request) =>
        statuses.includes(String(request.status ?? "").toLowerCase()),
      ).length;
    const countStatus = (status: string) =>
      inventoryRecords.filter(
        (item) => String(item.status ?? "").toLowerCase() === status,
      ).length;
    const monthLabel = (date: Date) =>
      new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" }).format(date);
    const point = (label: string, value: number, color?: string) => ({
      label,
      value,
      ...(color ? { color } : {}),
    });
    const revenueTrend = monthStarts.map((start, index) =>
      point(
        monthLabel(start),
        paidOrders
          .filter((order) => {
            const date = dateValue(order, "createdAt", "date");
            return date >= start && date < monthEnds[index]!;
          })
          .reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      ),
    );
    const monthlyOrders = monthStarts.map((start, index) =>
      point(
        monthLabel(start),
        orderRecords.filter((order) => {
          const date = dateValue(order, "createdAt", "date");
          return date >= start && date < monthEnds[index]!;
        }).length,
      ),
    );

    const soldByProduct = new Map<string, number>();
    for (const order of orderRecords) {
      if (!Array.isArray(order.items)) continue;
      for (const rawItem of order.items) {
        if (!rawItem || typeof rawItem !== "object") continue;
        const item = rawItem as Record<string, unknown>;
        const label = String(item.name ?? item.product ?? "");
        if (label) {
          soldByProduct.set(
            label,
            (soldByProduct.get(label) ?? 0) + Number(item.quantity ?? 1),
          );
        }
      }
    }

    const activity = [
      ...orderRecords.map((order) => ({
        id: String(order._id),
        title: `Order ${String(order.status ?? "updated").toLowerCase()}`,
        detail: [order.number, order.customer].filter(Boolean).join(" · "),
        date: dateValue(order, "createdAt", "date"),
        tone: "success",
      })),
      ...requestRecords.map((request) => ({
        id: String(request._id),
        title: `Service request ${String(request.status ?? "submitted").toLowerCase()}`,
        detail: [request.reference, request.customer, request.service].filter(Boolean).join(" · "),
        date: dateValue(request, "submittedAt", "createdAt"),
        tone: "warning",
      })),
      ...inventoryRecords
        .filter((item) => ["low stock", "out of stock"].includes(String(item.status ?? "").toLowerCase()))
        .map((item) => ({
          id: String(item._id),
          title: `Inventory ${String(item.status).toLowerCase()}`,
          detail: `${String(item.product ?? "Item")} · ${Number(item.onHand ?? 0)} on hand`,
          date: dateValue(item, "updatedAt", "createdAt"),
          tone: "warning",
        })),
    ]
      .sort((left, right) => right.date.getTime() - left.date.getTime())
      .slice(0, 8)
      .map(({ date, ...entry }) => ({ ...entry, time: relativeTime(date) }));

    return {
      metrics: {
        revenue: thisMonthRevenue,
        orders: orders.length,
        customers: customers.length,
        products: products.length,
        services: services.length,
        pendingRequests: requestStatusCount([
          "submitted",
          "pending",
          "in progress",
          "waiting for customer",
        ]),
        completedRequests: requestStatusCount(["completed", "delivered"]),
        lowStock: countStatus("low stock") + countStatus("out of stock"),
      },
      revenueTrend,
      monthlyOrders,
      serviceRequests: [
        point("Submitted", requestStatusCount(["submitted", "pending"]), "amber"),
        point("In progress", requestStatusCount(["in progress", "processing"]), "blue"),
        point("Completed", requestStatusCount(["completed"]), "green"),
        point("Delivered", requestStatusCount(["delivered"]), "violet"),
      ],
      productAvailability: [
        point("Healthy", countStatus("healthy"), "green"),
        point("Low stock", countStatus("low stock"), "amber"),
        point("Out of stock", countStatus("out of stock"), "red"),
      ],
      topProducts: [...soldByProduct.entries()]
        .sort((left, right) => right[1] - left[1])
        .slice(0, 4)
        .map(([label, value]) => point(label, value)),
      customerGrowth: monthStarts.map((start, index) =>
        point(
          monthLabel(start),
          customers.filter((customer) => {
            const date = dateValue(toPlainRecord(customer), "joinedAt", "createdAt");
            return date >= start && date < monthEnds[index]!;
          }).length,
        ),
      ),
      inventoryStatus: inventoryRecords.map((item) =>
        point(
          String(item.product ?? "Item"),
          Number(item.onHand ?? 0),
          String(item.status ?? "").toLowerCase() === "healthy" ? "green" : "amber",
        ),
      ),
      recentActivity: activity,
    };
  }

  private async findOrCreateCustomer(
    input: Record<string, unknown>,
    sessionId?: string,
  ) {
    const name = typeof input.customer === "string" ? input.customer.trim() : "";
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    if (!name || !email) return undefined;
    return collections.customers.findOneAndUpdate(
      { email },
      {
        $set: {
          name,
          email,
          ...(typeof input.phone === "string" ? { phone: input.phone } : {}),
          ...(sessionId ? { sessionId } : {}),
        },
        $setOnInsert: {
          joinedAt: new Date().toISOString(),
          status: "Active",
          orders: 0,
        },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();
  }

  private async syncInventoryToProduct(record: StarlineRecord) {
    let product;
    if (typeof record.productId === "string" && objectId(record.productId)) {
      product = await collections.products.findById(record.productId).exec();
    }
    if (!product && typeof record.product === "string") {
      const productFilters: Array<Record<string, unknown>> = [
        { name: record.product },
      ];
      if (typeof record.sku === "string" && record.sku) {
        productFilters.push({ sku: record.sku });
      }
      product = await collections.products
        .findOne({ $or: productFilters })
        .exec();
    }
    if (!product) return;

    const onHand = Number(record.onHand ?? 0);
    const reorderPoint = Number(record.reorderPoint ?? 0);
    await Promise.all([
      collections.inventory.updateOne(
        { _id: record.id },
        {
          $set: {
            productId: product._id,
            product: product.get("name"),
            sku: product.get("sku"),
            status: statusForStock(onHand, reorderPoint),
          },
        },
        { runValidators: true },
      ),
      collections.products
        .updateOne({ _id: product._id }, { $set: { stock: onHand } })
        .exec(),
    ]);
  }

  private async syncProductStock(
    productId: Types.ObjectId,
    productName: string,
    sku: unknown,
    onHand: number,
  ) {
    const inventory = await collections.inventory.findOne({ productId }).exec();
    const reorderPoint = Number(inventory?.get("reorderPoint") ?? 0);
    await collections.inventory.findOneAndUpdate(
      { productId },
      {
        $set: {
          product: productName,
          ...(typeof sku === "string" ? { sku } : {}),
          onHand,
          status: statusForStock(onHand, reorderPoint),
        },
        $setOnInsert: { reserved: 0, reorderPoint },
      },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    ).exec();
  }

  private async syncProductReviews(productId: Types.ObjectId) {
    const [summary] = await collections.reviews
      .aggregate<{ count: number; rating: number }>([
        { $match: { productId, visibility: "Published" } },
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            rating: { $avg: "$rating" },
          },
        },
      ])
      .exec();
    await collections.products
      .updateOne(
        { _id: productId },
        {
          $set: {
            reviews: summary?.count ?? 0,
            rating: summary?.rating ?? 0,
          },
        },
      )
      .exec();
  }

  private async findReference(
    name: CollectionName,
    value: string,
    fields: string[],
  ) {
    if (!value.trim()) return null;
    const clauses: Array<Record<string, unknown>> = [];
    const id = objectId(value);
    if (id) clauses.push({ _id: id });
    for (const field of fields) clauses.push({ [field]: value });
    return modelFor(name).findOne({ $or: clauses }).exec();
  }
}

export const starlineService = new StarlineService();
