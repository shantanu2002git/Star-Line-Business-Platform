import mongoose, { Schema, type Model } from "mongoose";

export type CollectionName =
  | "products"
  | "categories"
  | "services"
  | "customers"
  | "orders"
  | "requests"
  | "reviews"
  | "inventory"
  | "invoices"
  | "banners"
  | "offers"
  | "content"
  | "cart"
  | "wishlist"
  | "notifications";

export type BusinessRecord = Record<string, unknown>;

const objectId = Schema.Types.ObjectId;
const mixed = Schema.Types.Mixed;
const requiredName = { type: String, required: true, trim: true, minlength: 1 };
const optionalText = { type: String, trim: true };
const nonNegative = { type: Number, min: 0 };
const mixedArray = { type: [mixed], default: [] };
function defineModel(
  name: string,
  collection: string,
  fields: Record<string, unknown>,
  indexes: Array<[Record<string, 1 | -1>, Record<string, unknown>?]> = [],
): Model<BusinessRecord> {
  const schema = new Schema<BusinessRecord>(fields, {
    strict: false,
    timestamps: true,
    versionKey: false,
    collection,
  });

  for (const [keys, options] of indexes) {
    schema.index(keys, options);
  }

  return (mongoose.models[name] as Model<BusinessRecord> | undefined) ??
    mongoose.model<BusinessRecord>(name, schema);
}

export const collections: Record<CollectionName, Model<BusinessRecord>> = {
  products: defineModel(
    "Product",
    "products",
    {
      name: requiredName,
      category: requiredName,
      categoryId: { type: objectId, ref: "Category" },
      sku: optionalText,
      price: { ...nonNegative, required: true },
      originalPrice: nonNegative,
      stock: { type: Number, min: 0, default: 0 },
      rating: { type: Number, min: 0, max: 5, default: 0 },
      reviews: { type: Number, min: 0, default: 0 },
      image: optionalText,
      images: mixedArray,
      featured: { type: Boolean, default: false },
      description: optionalText,
    },
    [
      [{ sku: 1 }, { unique: true, sparse: true }],
      [{ categoryId: 1 }],
    ],
  ),
  categories: defineModel(
    "Category",
    "categories",
    {
      name: requiredName,
      slug: { ...requiredName, lowercase: true },
      productCount: { type: Number, min: 0, default: 0 },
    },
    [[{ slug: 1 }, { unique: true }]],
  ),
  services: defineModel(
    "Service",
    "services",
    {
      name: requiredName,
      description: optionalText,
      startingPrice: nonNegative,
      turnaround: optionalText,
      active: { type: Boolean, default: true },
    },
  ),
  customers: defineModel(
    "Customer",
    "customers",
    {
      name: requiredName,
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      },
      phone: optionalText,
      status: { type: String, trim: true, default: "Active" },
      joinedAt: { type: String, default: () => new Date().toISOString() },
      sessionId: optionalText,
    },
    [[{ email: 1 }, { unique: true, sparse: true }], [{ sessionId: 1 }]],
  ),
  orders: defineModel(
    "Order",
    "orders",
    {
      number: optionalText,
      customer: requiredName,
      customerId: { type: objectId, ref: "Customer" },
      email: { ...optionalText, lowercase: true },
      phone: optionalText,
      address: optionalText,
      city: optionalText,
      state: optionalText,
      pincode: optionalText,
      items: mixedArray,
      subtotal: nonNegative,
      discount: nonNegative,
      total: nonNegative,
      status: { type: String, trim: true, default: "Pending" },
      paymentMethod: optionalText,
      paymentStatus: { type: String, trim: true, default: "Pending" },
      createdAt: Date,
      sessionId: optionalText,
    },
    [
      [{ number: 1 }, { unique: true, sparse: true }],
      [{ customerId: 1, createdAt: -1 }],
      [{ sessionId: 1, createdAt: -1 }],
    ],
  ),
  requests: defineModel(
    "ServiceRequest",
    "requests",
    {
      reference: optionalText,
      customer: requiredName,
      email: {
        type: String,
        trim: true,
        lowercase: true,
        match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      },
      customerId: { type: objectId, ref: "Customer" },
      service: requiredName,
      serviceId: { type: objectId, ref: "Service" },
      status: { type: String, trim: true, default: "Submitted" },
      submittedAt: { type: String, default: () => new Date().toISOString() },
      dueDate: optionalText,
      documents: mixedArray,
      notes: { type: String, required: true, trim: true, maxlength: 5000 },
      amount: nonNegative,
      sessionId: optionalText,
    },
    [
      [{ reference: 1 }, { unique: true, sparse: true }],
      [{ customerId: 1, submittedAt: -1 }],
      [{ sessionId: 1, submittedAt: -1 }],
    ],
  ),
  reviews: defineModel(
    "Review",
    "reviews",
    {
      product: requiredName,
      productId: { type: objectId, ref: "Product" },
      customer: requiredName,
      customerId: { type: objectId, ref: "Customer" },
      rating: { type: Number, required: true, min: 1, max: 5 },
      comment: optionalText,
      visibility: { type: String, trim: true, default: "Pending" },
      sessionId: optionalText,
    },
    [
      [{ productId: 1 }],
      [{ customerId: 1 }],
      [{ sessionId: 1, createdAt: -1 }],
    ],
  ),
  inventory: defineModel(
    "InventoryItem",
    "inventory",
    {
      product: requiredName,
      productId: { type: objectId, ref: "Product" },
      sku: optionalText,
      onHand: { type: Number, required: true, min: 0 },
      reserved: { type: Number, min: 0, default: 0 },
      reorderPoint: { type: Number, min: 0, default: 0 },
      status: { type: String, trim: true, default: "Healthy" },
    },
    [[{ productId: 1 }, { unique: true, sparse: true }]],
  ),
  invoices: defineModel(
    "Invoice",
    "invoices",
    {
      number: optionalText,
      customer: requiredName,
      customerId: { type: objectId, ref: "Customer" },
      orderId: { type: objectId, ref: "Order" },
      amount: { type: Number, required: true, min: 0 },
      status: { type: String, trim: true, default: "Pending" },
      issuedAt: { type: String, default: () => new Date().toISOString() },
      dueAt: optionalText,
      sessionId: optionalText,
    },
    [
      [{ number: 1 }, { unique: true, sparse: true }],
      [{ orderId: 1 }],
      [{ sessionId: 1, issuedAt: -1 }],
    ],
  ),
  banners: defineModel("Banner", "banners", {
    title: requiredName,
    active: { type: Boolean, default: true },
  }),
  offers: defineModel(
    "Offer",
    "offers",
    {
      code: { ...requiredName, uppercase: true },
      title: requiredName,
      discount: optionalText,
      discountType: { type: String, enum: ["percentage", "fixed"] },
      discountValue: nonNegative,
      expiresAt: optionalText,
      active: { type: Boolean, default: true },
    },
    [[{ code: 1 }, { unique: true }]],
  ),
  content: defineModel(
    "ContentPage",
    "content",
    {
      key: { ...requiredName, lowercase: true },
      title: requiredName,
      body: { type: String, required: true },
      published: { type: Boolean, default: false },
    },
    [[{ key: 1 }, { unique: true }]],
  ),
  cart: defineModel(
    "CartItem",
    "cart",
    {
      sessionId: { type: String, required: true },
      productId: { type: objectId, required: true, ref: "Product" },
      name: requiredName,
      image: optionalText,
      price: { type: Number, required: true, min: 0 },
      originalPrice: { type: Number, required: true, min: 0 },
      quantity: { type: Number, required: true, min: 1 },
      maxStock: { type: Number, required: true, min: 0 },
      addedAt: { type: String, default: () => new Date().toISOString() },
    },
    [[{ sessionId: 1, productId: 1 }, { unique: true }]],
  ),
  wishlist: defineModel(
    "WishlistItem",
    "wishlist",
    {
      sessionId: { type: String, required: true },
      productId: { type: objectId, required: true, ref: "Product" },
      name: requiredName,
      image: optionalText,
      price: { type: Number, required: true, min: 0 },
      addedAt: { type: String, default: () => new Date().toISOString() },
    },
    [[{ sessionId: 1, productId: 1 }, { unique: true }]],
  ),
  notifications: defineModel(
    "Notification",
    "notifications",
    {
      sessionId: { type: String, required: true },
      customer: optionalText,
      customerId: { type: objectId, ref: "Customer" },
      orderId: { type: objectId, ref: "Order" },
      title: { ...requiredName, maxlength: 160 },
      message: { type: String, required: true, trim: true, maxlength: 2000 },
      type: { ...requiredName, maxlength: 80 },
      read: { type: Boolean, default: false },
    },
    [[{ sessionId: 1, createdAt: -1 }]],
  ),
};
