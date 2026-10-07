import mongoose from "mongoose";
import { collections } from "./schema";

export async function connectDatabase(): Promise<void> {
  const uri = process.env.MONGODB_URI;

  if (!uri) {
    throw new Error("MONGODB_URI is required to connect to MongoDB.");
  }

  if (!uri.startsWith("mongodb://") && !uri.startsWith("mongodb+srv://")) {
    throw new Error("MONGODB_URI must use mongodb:// or mongodb+srv://.");
  }

  await mongoose.connect(uri, {
    ...(process.env.MONGODB_DATABASE
      ? { dbName: process.env.MONGODB_DATABASE }
      : {}),
    tls: true,
    tlsAllowInvalidCertificates: false,
    tlsAllowInvalidHostnames: false,
    serverSelectionTimeoutMS: 10_000,
    autoIndex: process.env.NODE_ENV !== "production",
  });
  await Promise.all(
    Object.values(collections).map((collection) => collection.createIndexes()),
  );
}

export { collections, mongoose };
export * from "./schema";
