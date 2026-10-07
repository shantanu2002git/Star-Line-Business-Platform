import "./config";
import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createHash, randomBytes } from "node:crypto";
import pinoHttp from "pino-http";
import mongoose from "mongoose";
import router from "./routes";
import { logger } from "./lib/logger";
import { ApiError } from "./services/starline";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
const allowedOrigins = process.env.FRONTEND_ORIGIN
  ?.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: allowedOrigins?.length ? allowedOrigins : true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use((req, res, next) => {
  const existing = req.cookies?.starLineSession;
  const token =
    typeof existing === "string" && /^[a-f0-9]{64}$/.test(existing)
      ? existing
      : randomBytes(32).toString("hex");

  if (token !== existing) {
    res.cookie("starLineSession", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });
  }
  req.sessionId = createHash("sha256").update(token).digest("hex");
  next();
});

app.use("/api", router);

app.get("/", (_req, res) => {
  res.json({
    name: "Star Line Business Platform API",
    version: "0.0.0",
    health: "/api/healthz",
    docs: "/api",
  });
});

app.use((req, res) => {
  res.status(404).json({ error: `Route ${req.method} ${req.path} not found.` });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (
    error &&
    typeof error === "object" &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    return res.status(413).json({ error: "Request body exceeds the 5 MB limit." });
  }
  if (error instanceof ApiError) {
    return res.status(error.statusCode).json({ error: error.message });
  }
  if (error instanceof mongoose.Error.ValidationError) {
    return res.status(400).json({ error: error.message });
  }
  if (error instanceof mongoose.Error.CastError) {
    return res.status(400).json({ error: "Invalid document value." });
  }
  if (
    error &&
    typeof error === "object" &&
    "code" in error &&
    error.code === 11000
  ) {
    return res.status(409).json({ error: "A record with this value already exists." });
  }
  logger.error({ err: error }, "Unhandled API error");
  return res.status(500).json({ error: "Internal server error." });
});

export default app;
