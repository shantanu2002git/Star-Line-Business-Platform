import { Router, type IRouter, type Request, type Response } from "express";
import type { CollectionName } from "@workspace/db";
import { ApiError, starlineService } from "../services/starline";

const router: IRouter = Router();

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

router.get("/dashboard/summary", async (_req, res) =>
  res.json(await starlineService.dashboard()),
);

router.get("/products", list("products", true));
router.post("/products", create("products"));
router.get("/products/:id", async (req, res) => {
  const item = await starlineService.find("products", String(req.params.id));
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Product not found" });
});
router.patch("/products/:id", update("products"));
router.delete("/products/:id", remove("products"));

router.get("/cart", async (req, res) =>
  res.json(await starlineService.getCart(req.sessionId)),
);
router.post("/cart", async (req, res) => {
  const body = req.body as { productId?: string; quantity?: number };
  const result = await starlineService.addToCart(
    req.sessionId,
    String(body?.productId ?? ""),
    Number(body?.quantity ?? 1),
  );
  return res.status(201).json(result);
});
router.patch("/cart/:id", async (req, res) => {
  const body = req.body as { quantity?: number };
  return res.json(
    await starlineService.updateCartQuantity(
      req.sessionId,
      String(req.params.id),
      Number(body?.quantity),
    ),
  );
});
router.delete("/cart/:id", async (req, res) => {
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
router.delete("/cart", async (req, res) => {
  await starlineService.clearCart(req.sessionId);
  return res.status(204).end();
});
router.get("/cart/breakdown", async (req, res) => {
  const coupon =
    typeof req.query.coupon === "string" ? req.query.coupon : null;
  return res.json(await starlineService.cartBreakdown(req.sessionId, coupon));
});

router.get("/wishlist", async (req, res) =>
  res.json(await starlineService.getWishlist(req.sessionId)),
);
router.post("/wishlist", async (req, res) => {
  const body = req.body as { productId?: string };
  return res
    .status(201)
    .json(
      await starlineService.addToWishlist(
        req.sessionId,
        String(body?.productId ?? ""),
      ),
    );
});
router.delete("/wishlist/:id", async (req, res) => {
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

router.post("/checkout", async (req, res) =>
  res
    .status(201)
    .json(await starlineService.checkout(req.sessionId, req.body)),
);
router.get("/orders/:id", async (req, res) => {
  const order = await starlineService.find("orders", String(req.params.id));
  return order
    ? res.json(order)
    : res.status(404).json({ error: "Order not found" });
});
router.get("/orders", async (req, res) => {
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
  return res.json(
    await starlineService.list("orders", listOptions(req)),
  );
});
router.post("/orders", create("orders"));
router.patch("/orders/:id", async (req, res) => {
  const item = await starlineService.updateOrder(
    String(req.params.id),
    req.body,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Order not found" });
});
router.delete("/orders/:id", remove("orders"));

router.get("/notifications", async (req, res) => {
  const customer =
    typeof req.query.customer === "string" ? req.query.customer : undefined;
  return res.json(
    await starlineService.listNotifications(req.sessionId, customer),
  );
});
router.patch("/notifications/:id/read", async (req, res) => {
  const item = await starlineService.markNotificationRead(
    String(req.params.id),
    req.sessionId,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Notification not found" });
});

router.get("/categories", list("categories"));
router.post("/categories", create("categories"));
router.patch("/categories/:id", update("categories"));
router.delete("/categories/:id", remove("categories"));

router.get("/services", list("services"));
router.post("/services", create("services"));
router.patch("/services/:id", update("services"));
router.delete("/services/:id", remove("services"));

router.get("/customers", list("customers", true));
router.post("/customers", create("customers"));
router.patch("/customers/:id", update("customers"));
router.delete("/customers/:id", remove("customers"));

router.get("/requests", list("requests", true));
router.post("/requests", create("requests"));
router.patch("/requests/:id", async (req, res) => {
  const item = await starlineService.updateRequest(
    String(req.params.id),
    req.body,
  );
  return item
    ? res.json(item)
    : res.status(404).json({ error: "Request not found" });
});
router.delete("/requests/:id", remove("requests"));

router.get("/reviews", list("reviews"));
router.post("/reviews", create("reviews"));
router.patch("/reviews/:id", update("reviews"));
router.delete("/reviews/:id", remove("reviews"));

router.get("/inventory", list("inventory"));
router.post("/inventory", create("inventory"));
router.patch("/inventory/:id", update("inventory"));
router.delete("/inventory/:id", remove("inventory"));

router.get("/invoices", list("invoices"));
router.post("/invoices", create("invoices"));
router.patch("/invoices/:id", update("invoices"));
router.delete("/invoices/:id", remove("invoices"));

router.get("/banners", list("banners"));
router.post("/banners", create("banners"));
router.patch("/banners/:id", update("banners"));
router.delete("/banners/:id", remove("banners"));

router.get("/offers", list("offers"));
router.post("/offers", create("offers"));
router.patch("/offers/:id", update("offers"));
router.delete("/offers/:id", remove("offers"));

router.get("/content", list("content"));
router.post("/content", create("content"));
router.patch("/content/:id", update("content"));
router.delete("/content/:id", remove("content"));

export default router;
