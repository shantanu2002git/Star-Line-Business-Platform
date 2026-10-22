import { Router, type IRouter, type Request, type Response } from "express";
import type { CollectionName } from "@workspace/db";
import { ApiError, starlineService } from "../services/starline";
import { authenticate, requireAuth, authorize, requireRole } from "../middlewares/auth";
import { validate, validateAll, sanitizeInput, schemas } from "../middlewares/validation";

const router: IRouter = Router();

// Apply authentication to all routes (adds req.user with guest fallback)
router.use(authenticate);

// Sanitize input to prevent injection attacks
router.use(sanitizeInput);

function positiveIntegerQuery(
  value: unknown,
  field: string,
  maximum = Number.MAX_SAFE_INTEGER,
) {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new ApiError(`${field} must be a positive integer.`, 400);
  }
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number < 1 || number > maximum) {
    throw new ApiError(`${field} must be between 1 and ${maximum}.`, 400);
  }
  return number;
}

const listOptions = (req: Request) => {
  if (
    typeof req.query.search === "string" &&
    req.query.search.length > 200
  ) {
    throw new ApiError("search cannot exceed 200 characters.", 400);
  }
  if (
    req.query.featured !== undefined &&
    req.query.featured !== "true" &&
    req.query.featured !== "false"
  ) {
    throw new ApiError("featured must be true or false.", 400);
  }
  return {
    search: typeof req.query.search === "string" ? req.query.search : undefined,
    page: positiveIntegerQuery(req.query.page, "page"),
    pageSize: positiveIntegerQuery(req.query.pageSize, "pageSize", 100),
    status: typeof req.query.status === "string" ? req.query.status : undefined,
    category:
      typeof req.query.category === "string" ? req.query.category : undefined,
    featured: req.query.featured === undefined ? undefined : req.query.featured === "true",
    visibility:
      typeof req.query.visibility === "string"
        ? req.query.visibility
        : undefined,
  };
};

const list = (name: CollectionName, paginated = false) =>
  async (req: Request, res: Response) => {
    const mine = req.query.mine === "true";
    if (paginated) {
      return res.json(
        await starlineService.list(
          name,
          listOptions(req),
          mine ? req.sessionId : undefined,
        ),
      );
    }
    return res.json(
      await starlineService.array(name, mine ? req.sessionId : undefined),
    );
  };

const create = (name: CollectionName) =>
  async (req: Request, res: Response) =>
    res
      .status(201)
      .json(await starlineService.create(name, req.body, req.sessionId));

const update = (name: CollectionName) =>
  async (req: Request, res: Response) => {
    const item = await starlineService.update(
      name,
      String(req.params.id),
      req.body,
    );
    return item
      ? res.json(item)
      : res.status(404).json({ error: "Record not found" });
  };

const remove = (name: CollectionName) =>
  async (req: Request, res: Response) => {
    if (!(await starlineService.remove(name, String(req.params.id)))) {
      return res.status(404).json({ error: "Record not found" });
    }
    return res.status(204).end();
  };

router.get("/dashboard/summary", requireRole("staff", "manager", "admin", "super_admin"), async (_req, res) =>
  res.json(await starlineService.dashboard()),
);

// Products - public read, admin write with validation
router.get("/products", validate(schemas.listOptions, "query"), list("products", true));
router.get("/products/:id", validate(schemas.productParams, "params"), async (req, res) => {
  const item = await starlineService.find("products", String(req.params.id));
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Product not found" });
});
router.post("/products", requireRole("manager", "admin", "super_admin"), validate(schemas.productCreate), create("products"));
router.patch("/products/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.productParams, body: schemas.productUpdate }), update("products"));
router.delete("/products/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.productParams, "params"), remove("products"));

router.get("/cart", requireAuth, async (req, res) =>
  res.json(await starlineService.getCart(req.sessionId)),
);
router.post("/cart", requireAuth, validate(schemas.cartAdd), async (req, res) => {
  const result = await starlineService.addToCart(
    req.sessionId,
    String(req.body.productId),
    Number(req.body.quantity ?? 1),
  );
  return res.status(201).json(result);
});
router.patch("/cart/:id", requireAuth, validateAll({ params: schemas.cartParams, body: schemas.cartUpdate }), async (req, res) => {
  return res.json(
    await starlineService.updateCartQuantity(
      req.sessionId,
      String(req.params.id),
      Number(req.body.quantity),
    ),
  );
});
router.delete("/cart/:id", requireAuth, validate(schemas.cartParams, "params"), async (req, res) => {
  if (
    !(await starlineService.removeCartItem(
      req.sessionId,
      String(req.params.id),
    ))
  ) {
    return res.status(404).json({ error: "Cart item not found" });
  }
  return res.status(204).end();
});
router.delete("/cart", requireAuth, async (req, res) => {
  await starlineService.clearCart(req.sessionId);
  return res.status(204).end();
});
router.get("/cart/breakdown", requireAuth, validate(schemas.cartBreakdown, "query"), async (req, res) => {
  const coupon = (req.query as any).coupon ?? null;
  return res.json(await starlineService.cartBreakdown(req.sessionId, coupon));
});

router.get("/wishlist", requireAuth, async (req, res) =>
  res.json(await starlineService.getWishlist(req.sessionId)),
);
router.post("/wishlist", requireAuth, validate(schemas.wishlistAdd), async (req, res) => {
  return res
    .status(201)
    .json(
      await starlineService.addToWishlist(
        req.sessionId,
        String(req.body.productId),
      ),
    );
});
router.delete("/wishlist/:id", requireAuth, validate(schemas.wishlistParams, "params"), async (req, res) => {
  if (
    !(await starlineService.removeFromWishlist(
      req.sessionId,
      String(req.params.id),
    ))
  ) {
    return res.status(404).json({ error: "Wishlist item not found" });
  }
  return res.status(204).end();
});

router.post("/checkout", requireAuth, validate(schemas.checkout), async (req, res) =>
  res
    .status(201)
    .json(await starlineService.checkout(req.sessionId, req.body)),
);
router.get("/orders/:id", requireAuth, validate(schemas.orderParams, "params"), async (req, res) => {
  const order = await starlineService.find("orders", String(req.params.id));
  return order
    ? res.json(order)
    : res.status(404).json({ error: "Order not found" });
});
router.get("/orders", requireAuth, validate(schemas.orderQuery, "query"), async (req, res) => {
  const customer =
    typeof req.query.customer === "string" ? req.query.customer : undefined;
  if (customer || req.query.mine === "true" || req.query.format === "array") {
    return res.json(
      await starlineService.listOrders(
        customer,
        req.query.mine === "true" ? req.sessionId : undefined,
      ),
    );
  }
  // Admin/manager can see all orders
  if (["manager", "admin", "super_admin"].includes(req.user?.role || "")) {
    return res.json(
      await starlineService.list("orders", listOptions(req)),
    );
  }
  // Customers can only see their own orders
  return res.json(
    await starlineService.listOrders(undefined, req.sessionId),
  );
});
router.post("/orders", requireRole("staff", "manager", "admin", "super_admin"), validate(schemas.orderCreate), create("orders"));
router.patch("/orders/:id", requireRole("staff", "manager", "admin", "super_admin"), validateAll({ params: schemas.orderParams, body: schemas.orderUpdate }), async (req, res) => {
  const item = await starlineService.updateOrder(
    String(req.params.id),
    req.body,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Order not found" });
});
router.delete("/orders/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.orderParams, "params"), remove("orders"));

router.get("/notifications", requireAuth, validate(schemas.notificationQuery, "query"), async (req, res) => {
  const customer =
    typeof req.query.customer === "string" ? req.query.customer : undefined;
  return res.json(
    await starlineService.listNotifications(req.sessionId, customer),
  );
});
router.patch("/notifications/:id/read", requireAuth, validate(schemas.notificationParams, "params"), async (req, res) => {
  const item = await starlineService.markNotificationRead(
    String(req.params.id),
    req.sessionId,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Notification not found" });
});

router.get("/categories", validate(schemas.listOptions, "query"), list("categories"));
router.post("/categories", requireRole("manager", "admin", "super_admin"), validate(schemas.categoryCreate), create("categories"));
router.patch("/categories/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.categoryParams, body: schemas.categoryUpdate }), update("categories"));
router.delete("/categories/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.categoryParams, "params"), remove("categories"));

router.get("/services", validate(schemas.listOptions, "query"), list("services"));
router.post("/services", requireRole("manager", "admin", "super_admin"), validate(schemas.serviceCreate), create("services"));
router.patch("/services/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.serviceParams, body: schemas.serviceUpdate }), update("services"));
router.delete("/services/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.serviceParams, "params"), remove("services"));

router.get("/customers", requireRole("staff", "manager", "admin", "super_admin"), validate(schemas.listOptions, "query"), list("customers", true));
router.post("/customers", requireRole("manager", "admin", "super_admin"), validate(schemas.customerCreate), create("customers"));
router.patch("/customers/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.customerParams, body: schemas.customerUpdate }), update("customers"));
router.delete("/customers/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.customerParams, "params"), remove("customers"));

router.get("/requests", requireRole("staff", "manager", "admin", "super_admin"), validate(schemas.listOptions, "query"), list("requests", true));
router.post("/requests", requireAuth, validate(schemas.requestCreate), create("requests"));
router.patch("/requests/:id", requireRole("staff", "manager", "admin", "super_admin"), validateAll({ params: schemas.requestParams, body: schemas.requestUpdate }), async (req, res) => {
  const item = await starlineService.updateRequest(
    String(req.params.id),
    req.body,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Request not found" });
});
router.delete("/requests/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.requestParams, "params"), remove("requests"));

router.get("/reviews", validate(schemas.listOptions, "query"), list("reviews"));
router.post("/reviews", requireAuth, validate(schemas.reviewCreate), create("reviews"));
router.patch("/reviews/:id", requireRole("staff", "manager", "admin", "super_admin"), validateAll({ params: schemas.reviewParams, body: schemas.reviewUpdate }), update("reviews"));
router.delete("/reviews/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.reviewParams, "params"), remove("reviews"));

router.get("/inventory", requireRole("staff", "manager", "admin", "super_admin"), validate(schemas.listOptions, "query"), list("inventory"));
router.post("/inventory", requireRole("manager", "admin", "super_admin"), validate(schemas.inventoryCreate), create("inventory"));
router.patch("/inventory/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.inventoryParams, body: schemas.inventoryUpdate }), update("inventory"));
router.delete("/inventory/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.inventoryParams, "params"), remove("inventory"));

router.get("/invoices", requireRole("staff", "manager", "admin", "super_admin"), validate(schemas.listOptions, "query"), list("invoices"));
router.post("/invoices", requireRole("manager", "admin", "super_admin"), validate(schemas.invoiceCreate), create("invoices"));
router.patch("/invoices/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.invoiceParams, body: schemas.invoiceUpdate }), update("invoices"));
router.delete("/invoices/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.invoiceParams, "params"), remove("invoices"));

router.get("/banners", validate(schemas.listOptions, "query"), list("banners"));
router.post("/banners", requireRole("manager", "admin", "super_admin"), validate(schemas.bannerCreate), create("banners"));
router.patch("/banners/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.bannerParams, body: schemas.bannerUpdate }), update("banners"));
router.delete("/banners/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.bannerParams, "params"), remove("banners"));

router.get("/offers", validate(schemas.listOptions, "query"), list("offers"));
router.post("/offers", requireRole("manager", "admin", "super_admin"), validate(schemas.offerCreate), create("offers"));
router.patch("/offers/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.offerParams, body: schemas.offerUpdate }), update("offers"));
router.delete("/offers/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.offerParams, "params"), remove("offers"));

router.get("/content", validate(schemas.listOptions, "query"), list("content"));
router.post("/content", requireRole("manager", "admin", "super_admin"), validate(schemas.contentCreate), create("content"));
router.patch("/content/:id", requireRole("manager", "admin", "super_admin"), validateAll({ params: schemas.contentParams, body: schemas.contentUpdate }), update("content"));
router.delete("/content/:id", requireRole("manager", "admin", "super_admin"), validate(schemas.contentParams, "params"), remove("content"));

export default router;
