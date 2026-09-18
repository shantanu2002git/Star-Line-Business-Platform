import { Router, type IRouter, type Request, type Response } from "express";
import { starlineService } from "../services/starline";

const router: IRouter = Router();
type CollectionName = Parameters<typeof starlineService.list>[0];

const listOptions = (req: Request) => ({
  search: typeof req.query.search === "string" ? req.query.search : undefined,
  page: typeof req.query.page === "string" ? Number(req.query.page) : undefined,
  pageSize: typeof req.query.pageSize === "string" ? Number(req.query.pageSize) : undefined,
  status: typeof req.query.status === "string" ? req.query.status : undefined,
  category: typeof req.query.category === "string" ? req.query.category : undefined,
  featured: req.query.featured === undefined ? undefined : req.query.featured === "true",
  visibility: typeof req.query.visibility === "string" ? req.query.visibility : undefined,
});

const list = (name: CollectionName, paginated = false) => (req: Request, res: Response) => {
  res.json(paginated ? starlineService.list(name, listOptions(req)) : starlineService.array(name));
};

const create = (name: CollectionName) => (req: Request, res: Response) => {
  res.status(201).json(starlineService.create(name, req.body as Record<string, unknown>));
};

const update = (name: CollectionName) => (req: Request, res: Response) => {
  const id = String(req.params.id);
  const item = starlineService.update(name, id, req.body as Record<string, unknown>);
  if (!item) return res.status(404).json({ error: "Record not found" });
  return res.json(item);
};

const remove = (name: CollectionName) => (req: Request, res: Response) => {
  if (!starlineService.remove(name, String(req.params.id))) return res.status(404).json({ error: "Record not found" });
  return res.status(204).send();
};

router.get("/dashboard/summary", (_req, res) => res.json(starlineService.dashboard()));

router.get("/products", list("products", true));
router.post("/products", create("products"));
router.get("/products/:id", (req, res) => {
  const item = starlineService.find("products", req.params.id);
  return item ? res.json(item) : res.status(404).json({ error: "Product not found" });
});
router.patch("/products/:id", update("products"));
router.delete("/products/:id", remove("products"));

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

router.get("/orders", list("orders", true));
router.post("/orders", create("orders"));
router.patch("/orders/:id", update("orders"));
router.delete("/orders/:id", remove("orders"));

router.get("/requests", list("requests", true));
router.post("/requests", create("requests"));
router.patch("/requests/:id", update("requests"));
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