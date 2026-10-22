import "./config";
import { connectDatabase, mongoose } from "@workspace/db";
import app from "./app";
import { logger } from "./lib/logger";
import { closeRateLimiter } from "./middlewares/rateLimiter";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await connectDatabase();
logger.info({ database: mongoose.connection.name }, "Connected to MongoDB");

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
});

server.on("error", (err) => {
  logger.error({ err }, "Error listening on port");
  process.exitCode = 1;
});

// Graceful shutdown
async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  server.close(async () => {
    await mongoose.connection.close(false);
    await closeRateLimiter();
    logger.info("Server closed");
    process.exit(0);
  });

  // Force close after 10 seconds
  setTimeout(() => {
    logger.error("Forced shutdown after timeout");
    process.exit(1);
  }, 10000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
