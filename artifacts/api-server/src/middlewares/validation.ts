import { Request, Response, NextFunction } from "express";
import { z } from "zod";
import { logger } from "../lib/logger";

/**
 * Centralized Input Validation & Sanitization with Zod
 * Following Flipkart-scale patterns: schema-driven validation, sanitization, transformation
 */

// ============================================================================
// COMMON SCHEMAS
// ============================================================================

// ObjectId validation (MongoDB)
export const objectIdSchema = z
  .string()
  .regex(/^[a-f0-9]{24}$/i, "Invalid ID format")
  .transform((val) => val.toLowerCase());

// Pagination schemas
export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export const listOptionsSchema = z.object({
  search: z.string().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.string().optional(),
  category: z.string().optional(),
  featured: z.union([z.boolean(), z.enum(["true", "false"])]).optional().transform((val) => {
    if (typeof val === "string") return val === "true";
    return val;
  }),
  visibility: z.string().optional(),
});

// Email schema
const emailSchema = z.string().email().toLowerCase().trim();

// Phone schema (Indian format)
const phoneSchema = z.string().regex(/^[\d\s\-+]{10,15}$/, "Invalid phone number").trim();

// Pincode schema (Indian format)
const pincodeSchema = z.string().regex(/^\d{6}$/, "Invalid pincode").trim();

// Price schema
const priceSchema = z.number().min(0).max(1000000);

// Date schema (YYYY-MM-DD)
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Invalid date format (YYYY-MM-DD)");

// ============================================================================
// PRODUCT SCHEMAS
// ============================================================================

export const productCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  category: z.string().min(1).max(100).trim(),
  sku: z.string().max(50).trim().optional(),
  price: priceSchema,
  originalPrice: priceSchema.optional(),
  stock: z.number().int().min(0).default(0),
  image: z.string().optional().refine(
    (val) => !val || val.startsWith("data:image/") || val.startsWith("http"),
    "Image must be a data URL or HTTP URL"
  ),
  images: z.array(z.string().url()).max(10).optional(),
  featured: z.boolean().default(false),
  description: z.string().max(5000).trim().optional(),
  brand: z.string().max(100).trim().optional(),
});

export const productUpdateSchema = productCreateSchema.partial();

export const productParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// CATEGORY SCHEMAS
// ============================================================================

export const categoryCreateSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  slug: z.string().min(1).max(100).toLowerCase().trim().regex(/^[a-z0-9-]+$/, "Slug can only contain lowercase letters, numbers, and hyphens"),
});

export const categoryUpdateSchema = categoryCreateSchema.partial();

export const categoryParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// SERVICE SCHEMAS
// ============================================================================

export const serviceCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  description: z.string().max(5000).trim().optional(),
  startingPrice: priceSchema.optional(),
  turnaround: z.string().max(100).trim().optional(),
  active: z.boolean().default(true),
});

export const serviceUpdateSchema = serviceCreateSchema.partial();

export const serviceParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// CUSTOMER SCHEMAS
// ============================================================================

export const customerCreateSchema = z.object({
  name: z.string().min(1).max(200).trim(),
  email: emailSchema,
  phone: phoneSchema.optional(),
  status: z.enum(["Active", "Inactive", "Blocked"]).default("Active"),
});

export const customerUpdateSchema = customerCreateSchema.partial();

export const customerParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// ORDER SCHEMAS
// ============================================================================

const orderItemSchema = z.object({
  productId: objectIdSchema,
  name: z.string().min(1).max(200).trim(),
  image: z.string().optional(),
  price: priceSchema,
  originalPrice: priceSchema.optional(),
  quantity: z.number().int().min(1),
  total: priceSchema,
});

export const orderCreateSchema = z.object({
  customer: z.string().min(1).max(200).trim(),
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().min(1).max(500).trim(),
  city: z.string().min(1).max(100).trim(),
  state: z.string().min(1).max(100).trim(),
  pincode: pincodeSchema,
  paymentMethod: z.enum(["COD", "UPI", "Card", "Net Banking", "Wallet"]),
  couponCode: z.string().max(50).toUpperCase().trim().optional(),
  items: z.array(orderItemSchema).min(1, "At least one item is required"),
});

export const orderUpdateSchema = z.object({
  status: z.enum(["Pending", "Confirmed", "Processing", "Shipped", "Delivered", "Cancelled", "Returned"]).optional(),
  paymentStatus: z.enum(["Pending", "Paid", "Failed", "Refunded"]).optional(),
  paymentMethod: z.enum(["COD", "UPI", "Card", "Net Banking", "Wallet"]).optional(),
  trackingNumber: z.string().max(100).trim().optional(),
  estimatedDelivery: dateSchema.optional(),
});

export const orderParamsSchema = z.object({
  id: objectIdSchema,
});

export const orderQuerySchema = z.object({
  customer: z.string().optional(),
  mine: z.union([z.boolean(), z.enum(["true", "false"])]).optional().transform((val) => {
    if (typeof val === "string") return val === "true";
    return val;
  }),
  format: z.enum(["array"]).optional(),
});

// ============================================================================
// CART SCHEMAS
// ============================================================================

export const cartAddSchema = z.object({
  productId: objectIdSchema,
  quantity: z.number().int().min(1).max(99).default(1),
});

export const cartUpdateSchema = z.object({
  quantity: z.number().int().min(1).max(99),
});

export const cartParamsSchema = z.object({
  id: objectIdSchema,
});

export const cartBreakdownSchema = z.object({
  coupon: z.string().max(50).toUpperCase().trim().optional(),
});

// ============================================================================
// WISHLIST SCHEMAS
// ============================================================================

export const wishlistAddSchema = z.object({
  productId: objectIdSchema,
});

export const wishlistParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// CHECKOUT SCHEMAS
// ============================================================================

export const checkoutSchema = z.object({
  customer: z.string().min(1).max(200).trim(),
  email: emailSchema,
  phone: phoneSchema,
  address: z.string().min(1).max(500).trim(),
  city: z.string().min(1).max(100).trim(),
  state: z.string().min(1).max(100).trim(),
  pincode: pincodeSchema,
  paymentMethod: z.enum(["COD", "UPI", "Card", "Net Banking", "Wallet"]),
  couponCode: z.string().max(50).toUpperCase().trim().optional(),
});

// ============================================================================
// REVIEW SCHEMAS
// ============================================================================

export const reviewCreateSchema = z.object({
  product: z.string().min(1).max(200).trim(),
  customer: z.string().min(1).max(200).trim(),
  email: emailSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(2000).trim().optional(),
  visibility: z.enum(["Pending", "Published", "Hidden"]).default("Pending"),
});

export const reviewUpdateSchema = reviewCreateSchema.partial();

export const reviewParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// INVENTORY SCHEMAS
// ============================================================================

export const inventoryCreateSchema = z.object({
  product: z.string().min(1).max(200).trim(),
  productId: objectIdSchema.optional(),
  sku: z.string().max(50).trim().optional(),
  onHand: z.number().int().min(0),
  reserved: z.number().int().min(0).default(0),
  reorderPoint: z.number().int().min(0).default(0),
  status: z.enum(["Healthy", "Low stock", "Out of stock"]).default("Healthy"),
});

export const inventoryUpdateSchema = inventoryCreateSchema.partial();

export const inventoryParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// INVOICE SCHEMAS
// ============================================================================

export const invoiceCreateSchema = z.object({
  customer: z.string().min(1).max(200).trim(),
  email: emailSchema.optional(),
  orderId: objectIdSchema.optional(),
  amount: priceSchema,
  status: z.enum(["Pending", "Paid", "Overdue", "Cancelled"]).default("Pending"),
  issuedAt: dateSchema.default(() => new Date().toISOString().slice(0, 10)),
  dueAt: dateSchema.optional(),
});

export const invoiceUpdateSchema = invoiceCreateSchema.partial();

export const invoiceParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// BANNER SCHEMAS
// ============================================================================

export const bannerCreateSchema = z.object({
  title: z.string().min(1).max(200).trim(),
  subtitle: z.string().max(500).trim().optional(),
  image: z.string().url().optional(),
  link: z.string().url().optional(),
  active: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
});

export const bannerUpdateSchema = bannerCreateSchema.partial();

export const bannerParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// OFFER SCHEMAS
// ============================================================================

export const offerCreateSchema = z.object({
  code: z.string().min(1).max(50).toUpperCase().trim(),
  title: z.string().min(1).max(200).trim(),
  discountType: z.enum(["percentage", "fixed"]),
  discountValue: z.number().min(0).max(100000),
  expiresAt: dateSchema.optional(),
  active: z.boolean().default(true),
  minOrderValue: priceSchema.optional(),
  maxDiscount: priceSchema.optional(),
  usageLimit: z.number().int().min(1).optional(),
  applicableCategories: z.array(objectIdSchema).optional(),
  applicableProducts: z.array(objectIdSchema).optional(),
});

export const offerUpdateSchema = offerCreateSchema.partial();

export const offerParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// CONTENT SCHEMAS
// ============================================================================

export const contentCreateSchema = z.object({
  key: z.string().min(1).max(100).toLowerCase().trim().regex(/^[a-z0-9-]+$/, "Key can only contain lowercase letters, numbers, and hyphens"),
  title: z.string().min(1).max(200).trim(),
  body: z.string().min(1),
  published: z.boolean().default(false),
});

export const contentUpdateSchema = contentCreateSchema.partial();

export const contentParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// SERVICE REQUEST SCHEMAS
// ============================================================================

export const requestCreateSchema = z.object({
  customer: z.string().min(1).max(200).trim(),
  email: emailSchema,
  phone: phoneSchema.optional(),
  service: z.string().min(1).max(200).trim(),
  notes: z.string().max(5000).trim(),
  dueDate: dateSchema.optional(),
  documents: z.array(z.string().url()).max(10).optional(),
  amount: priceSchema.optional(),
});

export const requestUpdateSchema = z.object({
  status: z.enum(["Submitted", "Pending", "In Progress", "Waiting for Customer", "Completed", "Delivered", "Cancelled"]).optional(),
  notes: z.string().max(5000).trim().optional(),
  assignedTo: z.string().max(200).trim().optional(),
  dueDate: dateSchema.optional(),
});

export const requestParamsSchema = z.object({
  id: objectIdSchema,
});

// ============================================================================
// NOTIFICATION SCHEMAS
// ============================================================================

export const notificationParamsSchema = z.object({
  id: objectIdSchema,
});

export const notificationQuerySchema = z.object({
  customer: z.string().optional(),
});

// ============================================================================
// SEARCH SCHEMAS
// ============================================================================

export const searchSchema = z.object({
  q: z.string().min(1).max(200).trim(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  category: z.string().optional(),
  sort: z.enum(["relevance", "price_asc", "price_desc", "newest", "popular"]).default("relevance"),
});

// ============================================================================
// VALIDATION MIDDLEWARE FACTORY
// ============================================================================

/**
 * Creates a validation middleware for the given schema
 * @param schema - Zod schema to validate against
 * @param source - Request source to validate ('body', 'query', 'params')
 */
export function validate(schema: z.ZodSchema, source: "body" | "query" | "params" = "body") {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = req[source];
      const result = schema.safeParse(data);

      if (!result.success) {
        const errors = result.error.flatten();
        logger.warn(
          {
            path: req.path,
            method: req.method,
            source,
            errors: errors.fieldErrors,
            formErrors: errors.formErrors,
          },
          "Validation failed"
        );
        res.status(400).json({
          error: "Validation failed",
          code: "VALIDATION_ERROR",
          details: errors.fieldErrors,
        });
        return;
      }

      // Replace request data with validated/transformed data
      (req as any)[source] = result.data;
      next();
    } catch (error) {
      logger.error({ err: error }, "Validation middleware error");
      res.status(500).json({ error: "Validation error" });
    }
  };
}

/**
 * Validates multiple sources at once
 */
export function validateAll(schemas: {
  body?: z.ZodSchema;
  query?: z.ZodSchema;
  params?: z.ZodSchema;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      if (schemas.body) {
        const result = schemas.body.safeParse(req.body);
        if (!result.success) {
          const errors = result.error.flatten();
          res.status(400).json({
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            details: errors.fieldErrors,
          });
          return;
        }
        req.body = result.data;
      }

      if (schemas.query) {
        const result = schemas.query.safeParse(req.query);
        if (!result.success) {
          const errors = result.error.flatten();
          res.status(400).json({
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            details: errors.fieldErrors,
          });
          return;
        }
        req.query = result.data as any;
      }

      if (schemas.params) {
        const result = schemas.params.safeParse(req.params);
        if (!result.success) {
          const errors = result.error.flatten();
          res.status(400).json({
            error: "Validation failed",
            code: "VALIDATION_ERROR",
            details: errors.fieldErrors,
          });
          return;
        }
        req.params = result.data as any;
      }

      next();
    } catch (error) {
      logger.error({ err: error }, "Validation middleware error");
      res.status(500).json({ error: "Validation error" });
    }
  };
}

/**
 * Sanitizes input to prevent injection attacks
 * Strips dangerous keys and transforms values
 */
export function sanitizeInput(req: Request, res: Response, next: NextFunction): void {
  // Remove dangerous keys from body
  if (req.body && typeof req.body === "object") {
    const dangerousKeys = ["$where", "$regex", "$options", "$or", "$and", "$nor", "$not", "__proto__", "constructor", "prototype"];
    for (const key of dangerousKeys) {
      if (key in req.body) {
        logger.warn({ key, path: req.path }, "Dangerous key detected in request body, removing");
        delete req.body[key];
      }
    }
  }

  // Sanitize query parameters
  if (req.query && typeof req.query === "object") {
    const dangerousKeys = ["$where", "$regex", "$options", "$or", "$and", "$nor", "$not", "__proto__", "constructor", "prototype"];
    for (const key of dangerousKeys) {
      if (key in req.query) {
        logger.warn({ key, path: req.path }, "Dangerous key detected in query params, removing");
        delete req.query[key];
      }
    }
  }

  next();
}

// Export all schemas for easy importing
export const schemas = {
  // Common
  objectId: objectIdSchema,
  pagination: paginationSchema,
  listOptions: listOptionsSchema,

  // Products
  productCreate: productCreateSchema,
  productUpdate: productUpdateSchema,
  productParams: productParamsSchema,

  // Categories
  categoryCreate: categoryCreateSchema,
  categoryUpdate: categoryUpdateSchema,
  categoryParams: categoryParamsSchema,

  // Services
  serviceCreate: serviceCreateSchema,
  serviceUpdate: serviceUpdateSchema,
  serviceParams: serviceParamsSchema,

  // Customers
  customerCreate: customerCreateSchema,
  customerUpdate: customerUpdateSchema,
  customerParams: customerParamsSchema,

  // Orders
  orderCreate: orderCreateSchema,
  orderUpdate: orderUpdateSchema,
  orderParams: orderParamsSchema,
  orderQuery: orderQuerySchema,

  // Cart
  cartAdd: cartAddSchema,
  cartUpdate: cartUpdateSchema,
  cartParams: cartParamsSchema,
  cartBreakdown: cartBreakdownSchema,

  // Wishlist
  wishlistAdd: wishlistAddSchema,
  wishlistParams: wishlistParamsSchema,

  // Checkout
  checkout: checkoutSchema,

  // Reviews
  reviewCreate: reviewCreateSchema,
  reviewUpdate: reviewUpdateSchema,
  reviewParams: reviewParamsSchema,

  // Inventory
  inventoryCreate: inventoryCreateSchema,
  inventoryUpdate: inventoryUpdateSchema,
  inventoryParams: inventoryParamsSchema,

  // Invoices
  invoiceCreate: invoiceCreateSchema,
  invoiceUpdate: invoiceUpdateSchema,
  invoiceParams: invoiceParamsSchema,

  // Banners
  bannerCreate: bannerCreateSchema,
  bannerUpdate: bannerUpdateSchema,
  bannerParams: bannerParamsSchema,

  // Offers
  offerCreate: offerCreateSchema,
  offerUpdate: offerUpdateSchema,
  offerParams: offerParamsSchema,

  // Content
  contentCreate: contentCreateSchema,
  contentUpdate: contentUpdateSchema,
  contentParams: contentParamsSchema,

  // Requests
  requestCreate: requestCreateSchema,
  requestUpdate: requestUpdateSchema,
  requestParams: requestParamsSchema,

  // Notifications
  notificationParams: notificationParamsSchema,
  notificationQuery: notificationQuerySchema,

  // Search
  search: searchSchema,
};