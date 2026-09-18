import { Router, type IRouter } from "express";
import healthRouter from "./health";
import starlineRouter from "./starline";

const router: IRouter = Router();

router.use(healthRouter);
router.use(starlineRouter);

export default router;
