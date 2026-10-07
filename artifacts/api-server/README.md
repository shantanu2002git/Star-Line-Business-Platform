# Star Line API

The API stores business records in MongoDB. It does not seed or fall back to
sample data. Collections and indexes are initialized when the server connects.

## Configuration

Copy the root `.env.example` to `.env` and set `MONGODB_URI` to a MongoDB
connection URI provided through your deployment secret manager. Do not commit
`.env`. `MONGODB_DATABASE` can select the database independently of the URI.
`FRONTEND_ORIGIN` accepts a comma-separated list of browser origins when the UI
is hosted separately from the API.

Optional checkout policy environment variables are `TAX_RATE` (decimal from 0
to 1), `DELIVERY_CHARGE`, `FREE_DELIVERY_THRESHOLD`, `PACKAGING_CHARGE`,
`PLATFORM_DISCOUNT_RATE` (decimal from 0 to 1),
`PLATFORM_DISCOUNT_THRESHOLD`, and `ESTIMATED_DELIVERY_DAYS`. Monetary values
are in the platform's configured currency. Fees and discounts default to zero;
coupon discounts come from active MongoDB offer records.

## Running

From the workspace root, run `pnpm run dev`. The API is started on port 3001
and the Star Line UI on port 5173. The correct frontend workspace filter is
`@workspace/star-line`.

The API waits for a successful MongoDB connection before listening. Check
`GET /api/healthz` for database readiness. CRUD routes use MongoDB ObjectIds,
validate documents with Mongoose schemas, and return empty collections until
records are created through the API.

## Vercel services

The root `vercel.json` deploys this Express API as the `api-server` service and
routes `/api` and `/api/*` to it. Configure `MONGODB_URI` and, optionally,
`MONGODB_DATABASE` as Vercel environment variables. The API connects lazily
when a request reaches it, which supports Vercel's function runtime as well as
the existing local server entrypoint.

Cart, wishlist, customer, order, service request, review, invoice, and
notification records are associated with an opaque, HTTP-only browser session
cookie. This provides persistence and separation for anonymous browser
sessions; it is not a substitute for account authentication or administrative
authorization.
