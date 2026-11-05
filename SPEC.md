# hotel-core — Project Specification & Build Plan (v2)

> **Audience:** any AI coding tool or developer. Read this whole file before writing code.
> **Status:** v1 scope, 2-day delivery. Where this file and the existing code disagree, **this file wins**.
> **Starting point:** the existing single-restaurant codebase `udupi-hotel-api` (Node.js + Express + MySQL). It is being evolved into `hotel-core`, not rewritten.

### Changes in v2
| # | Change | Why |
|---|---|---|
| 1 | **Decision confirmed: one shared MySQL database, tenant key `hotel_id`.** Each hotel still has its own separate menu, orders and admins (logically isolated, enforced by the app and by composite foreign keys). Separate database per hotel was evaluated and rejected for v1 (see §1.0). | Matches the CEO's "one centralized database" instruction, keeps cross-hotel customer history simple, fits the 2-day deadline. |
| 2 | Hotel profile fields (cuisines, cover/logo, open/closed switch); menu items get `is_veg` and `image_url`. | Needed for a Swiggy/Blinkit-style UI. |
| 3 | New endpoints: grouped menu (`GET /hotels/:hotelId/menu`), hotel profile edit (`PATCH /hotels/:hotelId`). New error `HOTEL_CLOSED`. | UI needs. |
| 4 | **New §14: UI/UX specification.** Step 6 expanded. | Requirement: UI like a standard consumer app (Swiggy/Blinkit). |

---

## 1. What we are building

**hotel-core** is a B2C, multi-tenant food ordering platform. Many hotels (restaurants/food vendors) live on one platform. Each hotel has its own menu and its own orders. Customers register once and can order from any active hotel.

- **Tenant** = one hotel. Tenancy model = **one MySQL database, one shared schema, tenant key `hotel_id`** on every hotel-owned row.
- **First tenants:** `Udupi Hotel` (existing data) and `Divum Vendor` (supplies lunch to Divum staff).
- **Scale target for v1:** a few hotels, hundreds of customers, tens of orders per minute at peak. One VM is enough. Do not over-engineer.

### 1.0 Why one shared database (decision)
Requirement check: *multiple hotels register; each hotel has its own admin(s), menu data and orders; a platform admin with a central database; customers choose any hotel and order.* This is satisfied by the shared-schema model:
- **Separate data per hotel** = every menu item, order and order item belongs to exactly one hotel (`hotel_id`). Admins only ever see their own hotel's rows (§3.2). Composite foreign keys make it impossible for hotel A's order to contain hotel B's menu item.
- **Central database** = users, hotels, hotel admins and all orders live together, so a customer's history across hotels, platform reports and the platform admin console are plain queries.
- **Performance:** every hotel-owned query starts with an index on `hotel_id`, so reading one hotel's menu or orders touches only that hotel's rows, the same as a separate DB would at this scale.
- **Why not a database per hotel (v1):** it needs provisioning code, per-hotel migrations and backups, an order-index table plus cross-database transactions, and many more tests. That cost is not justified for a few hotels and a 2-day deadline.
- **Upgrade path:** `hotel_id` is on every row, so a hotel can later be exported into its own database or server. A full alternative spec for database-per-hotel exists in `HOTEL-CORE-SPEC-ALT-db-per-hotel.md` should a hotel ever require physical isolation.

### 1.1 Roles

| Role | Stored as | Scope | Can do |
|---|---|---|---|
| **PLATFORM_ADMIN** | `users.role = 'PLATFORM_ADMIN'` | Whole platform | Create/suspend hotels, create hotel admins, grant/revoke hotel-admin access, act as admin in any hotel, view platform metrics |
| **HOTEL_ADMIN** | row in `hotel_members` (`user_id`, `hotel_id`) | Only the hotel(s) they are linked to | Manage that hotel's menu, view/complete/cancel that hotel's orders, view that hotel's reports |
| **CUSTOMER** | `users.role = 'CUSTOMER'` (default) | Public | Register, browse active hotels and menus, place orders at any active hotel, view/cancel own pending orders |

Rules:
1. A hotel admin is also a normal user (`role = 'CUSTOMER'` plus membership rows). A user may administer several hotels if the platform admin links them.
2. Customers are **never** tied to a hotel. Only hotel admins have hotel links.
3. `PLATFORM_ADMIN` accounts are created only by CLI script, never through any API.
4. **No self-signup for hotels** in v1. A platform admin creates the hotel and its admin.

### 1.2 In scope (v1)
- Multi-tenancy (tables, middleware, migration of existing data)
- Auth: customer registration/login, platform/hotel admin login (same login endpoint)
- Platform admin API: hotels, hotel admins
- Per-hotel menu management (CRUD, availability toggle)
- Customer ordering (one order = one hotel), cancellation, order history across hotels
- Hotel admin order handling and reports (daily sales, top-selling items)
- Pricing: each menu item has one `price`. The hotel admin can change it any time. Orders **snapshot** the price at order time. (**No per-date price table in v1.**)
- Minimal observability: structured request logs and an in-memory metrics endpoint
- Deployment to GCP (single VM, Docker Compose, nginx), backups
- Hotel profile (description, cuisines, images, open/closed switch)
- **UI: consumer-grade, Swiggy/Blinkit-style app (§14):** hotel discovery → hotel menu → cart → checkout → orders; hotel admin panel; platform admin panel

### 1.3 Out of scope (do NOT build)
Hotel self-signup/approval flow, payment gateway, per-date pricing, richer order statuses (confirmed/preparing/ready/out-for-delivery), delivery/rider tracking, maps/geolocation, ratings & reviews, coupons/offers, password reset, refresh tokens, per-hotel subdomains, per-hotel databases (see §1.0), multi-hotel carts, cross-hotel dish search, notifications, Redis/queues, microservices, full monitoring dashboard.

---

## 2. Tech stack (fixed)

- Node.js 20 LTS, **CommonJS**, Express 4
- MySQL 8.0 via `mysql2/promise` (connection pool, parameterized queries only)
- Auth: `bcryptjs` (cost 12), `jsonwebtoken`
- Validation: `express-validator` (existing `validate` middleware)
- Docs: `swagger-jsdoc` + `swagger-ui-express` (keep `/api-docs`)
- Tests: built-in `node --test`
- New small dependencies allowed: `helmet`, `compression` (only if nginx gzip is not used), `pino` (or plain JSON `console.log`). No others without a written reason.
- Frontend: **React 18 + Vite**, source in `frontend/src/`, production build in `frontend/dist/`; Express serves the browser-history SPA fallback and API.

### 2.1 Conventions to keep (existing, do not change)
- Success: `{ "success": true, "data": ... }`; lists add `meta: { page, limit, total, totalPages }`.
- Error: `{ "success": false, "error": { "code", "message", "details": [] } }`. 500s never leak internals.
- Helpers: `asyncHandler`, `single`, `collection`, `httpError` in `src/utils/http.js`.
- Money: handled in integer paise via `src/utils/money.js` (`toPaise`, `fromPaise`). Never use floats for money.
- Pagination: `page` (≥1), `limit` (1–100, default 20).
- Roles/authorization are always loaded from the database, never trusted from the JWT.

---

## 3. Architecture

```
Browser (public/ UI)
   │  HTTPS + JWT (Authorization: Bearer)
nginx  (GCP VM, static external IP, ports 80/443 only)
   │  proxy_pass, gzip, security headers, request size limit
Express app "hotel-core"  (Docker, non-root user, port 3000 internal)
   middleware order:
     requestId/metrics → helmet → express.json(limit 100kb) → rate limiters
     → routes:
        authenticate (JWT → user row)
        resolveHotel (:hotelId → active hotel row)
        requireHotelAdmin (membership or PLATFORM_ADMIN)
     → errorHandler
   │  mysql2 pool (size from env, default 10)
MySQL 8 (Docker, internal network only, named volume) + daily dump to GCS
```

### 3.1 Code layout (target)

```
hotel-core/
  src/
    app.js, server.js
    config/        db.js, swagger.js, env.js        (env.js validates required env vars at boot)
    middleware/    auth.js, tenant.js, validate.js, errors.js, metrics.js, rateLimit.js
    routes/        index.js (mounts below)
                   auth.js, hotels.js, menu.js, orders.js, me.js, reports.js, platform.js
    services/      orderService.js (order creation transaction)
    utils/         http.js, money.js, auth.js
  backend/database/schema.sql (fresh install, v2), backend/database/migrations/001-multi-tenancy.sql, backend/database/seed.sql
  scripts/         create-platform-admin.js, reset-admin.js, migrate.js, backup.sh
  test/            (see §10)
  frontend/        React 18 + Vite UI source and production build
  docker/          Dockerfile, docker-compose.yml, nginx.conf
  SPEC.md          (this file)
```
Split the current 243-line `routes/index.js` into the route modules above. Behavior of existing endpoints is preserved except where this spec says otherwise.

### 3.2 Tenant-safety rules (the most important section)
1. **Hotel comes only from the URL** (`/api/hotels/:hotelId/...`). Never read `hotel_id` from a request body or query to decide tenancy.
2. Every query on `menu_items`, `orders`, `order_items` includes `hotel_id = ?` (`WHERE id = ? AND hotel_id = ?` for single-row access). No exceptions.
3. `resolveHotel` loads the hotel; suspended hotels reject writes (`403 HOTEL_SUSPENDED`) and are hidden from public lists. Unknown hotel → `404 HOTEL_NOT_FOUND`.
4. `requireHotelAdmin` passes if `users.role = 'PLATFORM_ADMIN'` **or** a `hotel_members` row exists for (user, hotel). Otherwise `403 FORBIDDEN`.
5. Accessing another user's order returns `404 ORDER_NOT_FOUND` (not 403) to avoid leaking existence.
6. The database also enforces tenancy with composite foreign keys (§4) so a bug cannot attach a hotel-A order item to a hotel-B menu item.

---

## 4. Database (MySQL 8, utf8mb4)

Charset/collation: `utf8mb4` / `utf8mb4_0900_ai_ci`. Engine InnoDB. Database name: `hotel_core`.

```sql
CREATE TABLE users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  full_name VARCHAR(120) NOT NULL,
  email VARCHAR(255) NOT NULL,                    -- stored lowercase
  phone VARCHAR(20) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('CUSTOMER','PLATFORM_ADMIN') NOT NULL DEFAULT 'CUSTOMER',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB;

CREATE TABLE hotels (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  slug VARCHAR(80) NOT NULL,                      -- lowercase, [a-z0-9-]
  description TEXT NULL,
  cuisines VARCHAR(160) NULL,                     -- comma-separated, e.g. "South Indian, Tiffins"
  address VARCHAR(255) NULL,
  phone VARCHAR(20) NULL,
  logo_url VARCHAR(500) NULL,                     -- https URL
  cover_url VARCHAR(500) NULL,                    -- https URL
  accepting_orders BOOLEAN NOT NULL DEFAULT TRUE, -- hotel admin's open/closed switch
  status ENUM('active','suspended') NOT NULL DEFAULT 'active',  -- platform admin's switch
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hotels_slug (slug),
  KEY idx_hotels_status_name (status, name)
) ENGINE=InnoDB;

CREATE TABLE hotel_members (                      -- hotel admins only
  user_id BIGINT UNSIGNED NOT NULL,
  hotel_id BIGINT UNSIGNED NOT NULL,
  role ENUM('ADMIN') NOT NULL DEFAULT 'ADMIN',    -- extendable later (e.g. STAFF)
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, hotel_id),
  KEY idx_members_hotel (hotel_id),
  CONSTRAINT fk_members_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON DELETE CASCADE,
  CONSTRAINT fk_members_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE menu_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  description TEXT NULL,
  category VARCHAR(80) NOT NULL,
  price DECIMAL(10,2) NOT NULL,
  is_veg BOOLEAN NOT NULL DEFAULT TRUE,
  image_url VARCHAR(500) NULL,                    -- https URL; no uploads in v1
  is_available BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_menu_id_hotel (id, hotel_id),                       -- target for composite FK
  UNIQUE KEY uq_menu_hotel_cat_name (hotel_id, category, name),
  KEY idx_menu_hotel_avail_cat (hotel_id, is_available, category),
  CONSTRAINT fk_menu_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT,
  CONSTRAINT chk_menu_price CHECK (price > 0)
) ENGINE=InnoDB;

CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(120) NOT NULL,            -- snapshot at order time
  phone VARCHAR(20) NOT NULL,                     -- snapshot at order time
  payment_method ENUM('cash','upi','card') NOT NULL,
  total_amount DECIMAL(10,2) NOT NULL,
  status ENUM('pending','completed') NOT NULL DEFAULT 'pending',
  cancelled_at TIMESTAMP NULL DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_id_hotel (id, hotel_id),                     -- target for composite FK
  KEY idx_orders_hotel_status_created (hotel_id, status, created_at),
  KEY idx_orders_hotel_created (hotel_id, created_at),
  KEY idx_orders_user_created (user_id, created_at),
  CONSTRAINT fk_orders_hotel FOREIGN KEY (hotel_id) REFERENCES hotels(id) ON DELETE RESTRICT,
  CONSTRAINT fk_orders_user  FOREIGN KEY (user_id)  REFERENCES users(id)  ON UPDATE CASCADE ON DELETE SET NULL,
  CONSTRAINT chk_order_total CHECK (total_amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id BIGINT UNSIGNED NOT NULL,
  hotel_id BIGINT UNSIGNED NOT NULL,              -- denormalized on purpose: enables composite FKs
  menu_item_id BIGINT UNSIGNED NOT NULL,
  item_name VARCHAR(120) NOT NULL,                -- snapshot
  unit_price DECIMAL(10,2) NOT NULL,              -- snapshot
  quantity INT UNSIGNED NOT NULL,
  subtotal DECIMAL(10,2) NOT NULL,
  PRIMARY KEY (id),
  KEY idx_oi_order (order_id),
  KEY idx_oi_hotel_menu (hotel_id, menu_item_id),
  CONSTRAINT fk_oi_order FOREIGN KEY (order_id, hotel_id)      REFERENCES orders(id, hotel_id)     ON DELETE CASCADE,
  CONSTRAINT fk_oi_menu  FOREIGN KEY (menu_item_id, hotel_id)  REFERENCES menu_items(id, hotel_id) ON DELETE RESTRICT,
  CONSTRAINT chk_item_price    CHECK (unit_price > 0),
  CONSTRAINT chk_item_quantity CHECK (quantity > 0),
  CONSTRAINT chk_item_subtotal CHECK (subtotal > 0)
) ENGINE=InnoDB;
```

### 4.1 Migration of the existing database (`backend/database/migrations/001-multi-tenancy.sql`)
Manual, idempotent where possible, uses `INFORMATION_SCHEMA` checks (this MySQL version rejects `ADD COLUMN IF NOT EXISTS`). **Back up first.** Never run automatically at server start; run via `npm run migrate`.
1. Insert default hotel: `Udupi Hotel`, slug `udupi-hotel`, status `active` → id 1.
2. Add `hotel_id` (nullable) to `menu_items`, `orders`; `UPDATE ... SET hotel_id = 1`; then `MODIFY ... NOT NULL`.
3. Add `hotel_id` to `order_items`, backfill from `orders.hotel_id`.
4. Add unique keys, indexes, composite FKs from §4; drop superseded indexes (`idx_menu_category`, `idx_menu_available`, `idx_orders_status_created`, `idx_orders_created`, `idx_orders_user_id`, `idx_order_items_menu`, old `fk_order_items_*`).
5. Create `hotel_members`. For every existing `users.role = 'ADMIN'`: insert (user, hotel 1) membership and set `users.role = 'CUSTOMER'`. **Do not auto-promote anyone to PLATFORM_ADMIN.**
6. Alter `users.role` to `ENUM('CUSTOMER','PLATFORM_ADMIN')`, add `is_active`.
7. Add `uq_menu_hotel_cat_name`. If duplicates exist, report them and stop.
8. Add the new columns with defaults (`menu_items.is_veg` TRUE, `image_url` NULL, hotel profile columns NULL, `accepting_orders` TRUE); the hotel admin corrects veg flags later.
9. Print before/after row counts.

### 4.2 Seed (`backend/database/seed.sql`, dev/demo only)
Hotels `udupi-hotel` and `divum-vendor`, each with 8–12 menu items across 3–4 categories, with veg/non-veg flags and placeholder `image_url`s (files in `public/img/`), plus cuisines and cover/logo on each hotel. Platform admin is created by script, never by seed.
The schema and seed SQL do not create or switch databases; scripts must connect to an explicitly selected, validated database. The demo seed is idempotent and limited to `_dev` and `_test` database names. A reset is permitted only for an `_test` database with an exact-name confirmation.

---

## 5. API specification

Base path `/api`. JSON only. `:hotelId`, `:id`, `:orderId` are positive integers. All list endpoints paginate.

Legend: **Public** = no token. **Auth** = any logged-in active user. **HA** = hotel admin of `:hotelId` or platform admin. **PA** = platform admin.

### 5.1 Health
| Method & path | Access | Notes |
|---|---|---|
| `GET /health` | Public | Liveness. **No DB call.** Returns `{status:'ok'}` |
| `GET /health/ready` | Public | Readiness. Runs `SELECT 1` |

### 5.2 Auth
| Method & path | Access | Body / behavior |
|---|---|---|
| `POST /auth/register` | Public, rate-limited | `{full_name, email, phone, password(8–72)}` → creates `CUSTOMER`. Any submitted role is ignored. 409 `EMAIL_IN_USE` |
| `POST /auth/login` | Public, rate-limited | `{email, password}` → `{token, user}`. Same error for unknown email and wrong password. Inactive user → 401 |
| `GET /auth/me` | Auth | Returns user (no hash) plus `admin_of: [{hotel_id, name, slug}]` |

JWT: `sub` = user id, `iss` = `hotel-core`, expiry 1h, secret ≥ 32 chars from env.

### 5.3 Hotels & menu (public read)
| Method & path | Access | Notes |
|---|---|---|
| `GET /hotels` | Public | Active hotels only. Query: `search` (name/cuisines), `page`, `limit`. Fields: id, name, slug, description, cuisines, address, logo_url, cover_url, accepting_orders |
| `GET /hotels/:hotelId` | Public | Active hotel only |
| `GET /hotels/:hotelId/menu` | Public | **Grouped menu for the UI:** `{ categories: [{ name, items: [...] }] }`, all of the hotel's items in one query (cap 500), ordered by category then name. Query `veg=true` for veg only. Unavailable items are included with `is_available:false` |
| `GET /hotels/:hotelId/menu-items` | Public | Query: `search`, `category`, `available`, `veg`, `page`, `limit`. Default customers' view: `available` unfiltered, UI hides unavailable |
| `GET /hotels/:hotelId/menu-items/:id` | Public | Must match hotel |

### 5.4 Hotel admin: menu
| Method & path | Access | Body |
|---|---|---|
| `POST /hotels/:hotelId/menu-items` | HA | `{name, description?, category, price, is_veg?, image_url?, is_available?}` → 201. 409 on duplicate (hotel, category, name) |
| `PATCH /hotels/:hotelId/menu-items/:id` | HA | any of name, description, category, price, is_veg, image_url, is_available (strict booleans) |
| `PATCH /hotels/:hotelId/menu-items/:id/availability` | HA | `{is_available: boolean}` |
| `PATCH /hotels/:hotelId` | HA | **Limited profile edit:** description, cuisines, address, phone, logo_url, cover_url, `accepting_orders`. (name, slug, status are PA-only.) |

Image/logo/cover URLs must be `https://` (validated, max 500). There is no delete endpoint. Use availability. Price changes apply to new orders only.

### 5.5 Orders
| Method & path | Access | Notes |
|---|---|---|
| `POST /hotels/:hotelId/orders` | Auth (active customer) | `{payment_method, items:[{menu_item_id, quantity 1–999}]}`. Hotel must be `active` and `accepting_orders` (else 409 `HOTEL_CLOSED`). All items must belong to `:hotelId` and be available. Server computes price. Name/phone come from DB user. 201 returns order + items |
| `GET /me/orders` | Auth | Own orders across all hotels, newest first. Query `status` (`pending|completed|cancelled`), pagination. Include `hotel_id` and hotel `name` via JOIN |
| `GET /me/orders/:orderId` | Auth | Own order with items, else 404 |
| `PATCH /me/orders/:orderId/cancel` | Auth | Own, active pending only. Else 409 `CANCELLATION_NOT_ALLOWED` |
| `GET /hotels/:hotelId/orders` | HA | Hotel's orders; query `status`, `date` (YYYY-MM-DD, IST), pagination |
| `GET /hotels/:hotelId/orders/:orderId` | HA | With items |
| `PATCH /hotels/:hotelId/orders/:orderId/status` | HA | `{status:'completed'}`; only active pending → completed. 409 `INVALID_STATUS_TRANSITION` |
| `PATCH /hotels/:hotelId/orders/:orderId/cancel` | HA | Active pending only |

Order rules (unchanged from current app): statuses `pending`, `completed`; cancellation is `cancelled_at IS NOT NULL` while status stays `pending`; completed orders cannot be reopened or cancelled.

### 5.6 Reports (HA)
- `GET /hotels/:hotelId/reports/daily-sales?date=YYYY-MM-DD` (default today in `Asia/Kolkata`) → `{date, completed_order_count, total_sales}`
- `GET /hotels/:hotelId/reports/top-selling-items?from&to&limit` → rows `{menu_item_id, item_name, quantity_sold}`
Only `status='completed' AND cancelled_at IS NULL`. Date filters use half-open ranges on `created_at` (index-friendly; never wrap the column in a function).

### 5.7 Platform admin (PA)
| Method & path | Body / notes |
|---|---|
| `POST /platform/hotels` | `{name, slug?, description?, cuisines?, address?, phone?}` → slug auto-generated from name if absent; 409 on duplicate slug |
| `GET /platform/hotels` | All statuses, pagination |
| `PATCH /platform/hotels/:hotelId` | name, description, cuisines, address, phone, logo_url, cover_url, `status` (`active|suspended`) |
| `GET /platform/hotels/:hotelId/admins` | List admins of hotel |
| `POST /platform/hotels/:hotelId/admins` | Exactly one mode: `{user_id}` or `{email}` (link an existing active `CUSTOMER`; email lookup is case-insensitive; platform admins and inactive users are ineligible; neither/both selectors are rejected; ineligible or unknown email returns generic 404 `USER_NOT_FOUND`) **or** `{full_name, email, phone, password}` (create user + link, in one transaction). Duplicate link returns 409 |
| `DELETE /platform/hotels/:hotelId/admins/:userId` | Remove link only; the user account stays |
| `GET /platform/metrics` | In-memory request metrics (§8) |

### 5.8 Error codes (additions)
`HOTEL_NOT_FOUND` 404, `HOTEL_SUSPENDED` 403, `MENU_ITEM_NOT_FOUND` 404, `INVALID_MENU_ITEM` 400, `ITEM_UNAVAILABLE` 409, `MENU_ITEM_EXISTS` 409, `ALREADY_HOTEL_ADMIN` 409, `SLUG_IN_USE` 409, `HOTEL_CLOSED` 409, plus existing ones.

---

## 6. Security requirements

**Authentication & accounts**
- bcrypt cost 12; password 8–72 chars; emails normalized to lowercase.
- Login/register limiter: 10 attempts / 15 min **per IP**, and `app.set('trust proxy', 1)` so the real client IP (not nginx's) is used. Without this, every user shares one counter behind nginx and gets locked out.
- General API limiter (e.g. 300 req/min per IP) as a safety net.
- Per-request user lookup selects only needed columns: `id, full_name, email, phone, role, is_active`. Reject inactive users.
- `PLATFORM_ADMIN` only via `scripts/create-platform-admin.js`.

**Authorization & tenancy**: §3.2 is mandatory. Every new route needs an isolation test.

**Input & output**
- Parameterized queries only; the only dynamic SQL allowed is a whitelisted column list for PATCH.
- Validate every param, query, and body field. `express.json({limit:'100kb'})`.
- `helmet()` defaults on. CORS: same-origin by default; if needed, allow only origins in `CORS_ORIGIN`.
- Never log passwords, tokens, or the `Authorization` header. Never return `password_hash`.
- Customer name/phone are visible only to that hotel's admins and platform admins.

**Secrets & config**
- Validate required env vars at boot (`src/config/env.js`); fail fast.
- `.env`, `.env.*`, `*.save` in `.gitignore`. **The provided zip contains `.env` and `.env.save`; `.gitignore` currently ignores only `.env`. Fix `.gitignore`, remove both files from the repo, and rotate every secret** (JWT secret, DB password, admin password).
- On the VM: `.env` file with `chmod 600`, owned by the deploy user. (Upgrade path: GCP Secret Manager.)
- Use two DB users: a runtime user with only `SELECT, INSERT, UPDATE, DELETE` on `hotel_core.*`, and a migration user with DDL rights used only by `npm run migrate`.

**Infrastructure**
- Firewall: allow 80/443 from anywhere; SSH (22) only from your IP or via IAP. **MySQL port 3306 is never published to the host or opened in the firewall**; it exists only on the Docker internal network.
- Containers run as non-root. Pin image versions (no `latest`).
- HTTPS: needs a hostname. With only an IP, v1 demo runs on HTTP (tokens travel unencrypted, acceptable for an internal demo only). Preferred: a real domain or a wildcard-DNS name (e.g. `<ip>.sslip.io`) plus Let's Encrypt via certbot. Say clearly which mode is deployed.

---

## 7. Performance requirements

Query rules:
1. No `SELECT *` in application code. List the columns.
2. Every list endpoint is paginated (max 100) and uses an index starting with `hotel_id` (or `user_id` for `/me`). The one exception is `GET /hotels/:hotelId/menu` (grouped menu): one query on `idx_menu_hotel_avail_cat`, capped at 500 rows; it may send `Cache-Control: public, max-age=30`.
3. No functions on indexed columns in `WHERE` (use `created_at >= ? AND created_at < ?`).
4. Order creation (`orderService.js`): one short transaction. Read menu rows for the hotel's requested ids with a **plain `SELECT ... WHERE hotel_id = ? AND id IN (...)`**. **Do not use `FOR UPDATE` on menu rows**: it would serialize all concurrent orders for popular items. Insert all `order_items` with a **single multi-row INSERT**. Return the created order from the in-memory data, not extra SELECTs where possible.
5. Avoid N+1: list endpoints return orders without items; the detail endpoint loads items in one query. `/me/orders` JOINs hotel name.
6. Reports are aggregate queries that must use `idx_orders_hotel_status_created`. Verify with `EXPLAIN` and record results in `docs/explain.md`.
7. Menu `search` uses `LIKE '%x%'` within one hotel's menu (small set, bounded by the `hotel_id` index). Acceptable in v1; use FULLTEXT only if a menu exceeds ~1,000 items.

Runtime:
- Pool size from `DB_POOL_SIZE` (default 10). `queueLimit` bounded (e.g. 100) so overload fails fast instead of piling up.
- `/health` must not touch the database.
- nginx: gzip for JSON/JS/CSS, long cache headers for static assets (`public/`), keep-alive to upstream. Optionally `Cache-Control: public, max-age=30` on `GET /hotels`.
- Do not add Redis or in-process caches until metrics show a need.

---

## 8. Observability (minimal, v1)
- `metrics.js` middleware: for every request record `request_id`, method, **route pattern** (`req.route.path`, not the raw URL), status, duration ms, `hotel_id`, `user_id`. Emit one JSON line to stdout (collected by Docker/GCP Cloud Logging).
- Keep in-memory counters per route: count, error count, p50/p95/max latency since process start. Expose at `GET /platform/metrics` (PA). This is the seed of the later dashboard (to be revisited after 100+ customers).
- Log slow requests (> 500 ms) at warn level.
- GCP: install the Ops Agent on the VM for CPU/memory/disk and logs; set an uptime check on `/api/health`.

---

## 9. Deployment (GCP)

**Resources**
- Project with billing/free credits. Compute Engine VM: `e2-medium` (2 vCPU, 4 GB) Ubuntu LTS, 20–30 GB disk, region near users (e.g. `asia-south1`).
- **Reserve a static external IP** and attach it (otherwise the IP changes on restart). Share this IP with the team lead.
- Network tags `http-server`, `https-server`; firewall rules as in §6.

**Containers** (`docker/`)
- `Dockerfile`: `node:20-alpine`, `npm ci --omit=dev`, run as `node` user, `CMD ["node","src/server.js"]`, `HEALTHCHECK` on `/api/health`.
- `docker-compose.yml`: services `app`, `db` (mysql:8.0, volume `dbdata`, no published ports), `nginx` (ports 80/443). `restart: unless-stopped`. Env from `.env`.
- `nginx.conf`: proxy to `app:3000`, forward `X-Forwarded-For/Proto`, `client_max_body_size 200k`, gzip, static caching.

**Process**
1. Clone repo on the VM (Divum Git account/deploy key only).
2. Create `.env` (`chmod 600`), `docker compose up -d --build`.
3. Run migration/schema, then `npm run create-platform-admin` inside the app container.
4. Seed demo hotels if wanted.
5. Smoke test (§11), then share the IP.

**Backups**: `scripts/backup.sh` runs `mysqldump --single-transaction` nightly via cron, gzips, uploads to a GCS bucket, keeps 14 days. Do one test restore.

**Releases**: `git pull && docker compose up -d --build`; migrations are run manually and separately, never on boot.

---

## 10. Testing requirements
Use `node --test`. Tests run against a dedicated test database (never the real one).

Mandatory **tenant isolation matrix**: create hotels A and B, admin A, admin B, customer C, platform admin P.
- Admin A cannot read/create/modify B's menu, orders, reports, or admins → 403.
- Admin A cannot reach an A-order id through B's URL (and vice versa) → 404.
- Order at hotel A with a menu item belonging to B → 400 `INVALID_MENU_ITEM`.
- Customer C can order at A and B, sees both in `/me/orders`, cannot see others' orders (404), cannot use any admin endpoint (403).
- Suspended hotel: hidden from `GET /hotels`, rejects orders (403), admin reads still work for PA. `accepting_orders=false` → 409 `HOTEL_CLOSED`.
- Grouped menu returns only that hotel's items; a hotel admin cannot edit another hotel's profile (403).
- Price change after ordering does not alter existing order items.
- Cancelling/completing rules (pending → completed once; cancelled cannot complete; completed cannot cancel).
- Register ignores a submitted `role`; inactive user cannot log in or use an old token.
- Composite FK: direct SQL inserting an `order_items` row with mismatched `hotel_id` fails.
Keep existing tests (`auth`, `money`, `auth-flow`) passing/updated.

---

## 11. Smoke test after deploy
1. `GET /api/health` and `/api/health/ready` → 200.
2. Login as platform admin → create hotel → create its admin.
3. Login as hotel admin → add 3 menu items (with image URLs and veg flags).
4. Register a customer → list hotels → order from hotel → see in `/me/orders`.
5. Hotel admin marks it completed → daily-sales report shows it.
6. Confirm port 3306 is not reachable from outside.
7. Hit login 11 times from one client → 429, and a *different* client IP is not blocked.

---

## 12. Action plan (build in this order)

Each step = one branch/PR from `develop`. A step is done only when its **Done when** items pass. Paste the step text to an AI tool together with this file.

### Step 0 — Repo & hygiene (≈1 h)
- Create `hotel-core` in the Divum Git repo (Divum accounts only). Branches: `main` (deployed), `develop`, `feature/*`.
- Rename package to `hotel-core`, DB to `hotel_core`, log text to "hotel-core".
- Fix `.gitignore` (`.env*`, `*.save`), delete `.env`/`.env.save` from the tree, rotate secrets, keep `.env.example`.
- **Done when:** `git ls-files` contains no `.env*`; app still boots locally.

### Step 1 — Schema & migration (≈3 h)
- Write `backend/database/schema.sql` (§4), `backend/database/migrations/001-multi-tenancy.sql` (§4.1), `scripts/migrate.js`, `backend/database/seed.sql`.
- **Done when:** fresh install works; migration on a copy of the old DB preserves all orders/items and links the old admin to hotel 1; composite-FK test passes.

### Step 2 — Tenant core & auth changes (≈3 h)
- `config/env.js`, `middleware/tenant.js` (`resolveHotel`, `requireHotelAdmin`), update `auth.js` (column list, `is_active`), `/auth/me` with `admin_of`, `trust proxy`, helmet, limiters, `create-platform-admin.js`.
- Split routes into modules without behavior change.
- **Done when:** existing auth tests pass; new middleware unit tests pass.

### Step 3 — Hotels, menu, platform admin API (≈4 h)
- Implement §5.3, §5.4, §5.7 (except metrics).
- **Done when:** isolation tests for menu/admin endpoints pass; Swagger documents all routes.

### Step 4 — Orders & reports (≈4 h)
- `orderService.js` per §7.4; §5.5, §5.6.
- **Done when:** full isolation matrix (§10) passes; `EXPLAIN` evidence saved.

### Step 5 — Metrics & health (≈1.5 h)
- §8 and §5.1.
- **Done when:** `/platform/metrics` shows per-route p95; `/health` makes no DB call.

### Step 6 — UI (≈8 h, two parts)
- **6a Design system + customer app (≈5 h):** §14.1–14.4: tokens/components, home (hotel discovery), hotel menu page, cart & checkout, orders, auth.
- **6b Admin apps (≈3 h):** §14.5–14.6: hotel admin panel (live orders, menu manager, reports, settings) and platform admin panel (hotels, admins, metrics).
- **Done when:** the §11 smoke test (steps 2–5) works entirely through the UI on a 390 px-wide phone viewport and on desktop, and the §14.9 checklist passes.

### Step 7 — Deploy (≈3 h)
- §9 end to end; backup cron; Ops Agent; static IP shared with the team lead.
- **Done when:** §11 passes against the public IP.

### Parallel split for two developers
- **Dev A:** Steps 0–2 together first (shared foundation), then Step 3 (platform/hotels), Step 6b (admin UI) and Step 7 (deploy).
- **Dev B:** after Step 2, Step 4 (orders/reports) and Step 6a (customer UI). Dev B can start the UI on mocked JSON while Steps 3–4 land.
- Merge to `develop` at least twice a day; deploy from `main` only.

---

## 13. Rules for AI coding tools
1. Follow this spec; if something is ambiguous, choose the simpler option and note it in the PR description.
2. Never put secrets in code, tests, or commits.
3. Never accept `hotel_id` from the client body for tenancy; always from the URL.
4. Never write SQL by string concatenation with user input.
5. Do not add features from §1.3.
6. Every new endpoint ships with validation, authorization, a Swagger entry, and tests (including a cross-hotel denial test).
7. Keep response/error formats and helper functions as in §2.1.
8. Keep changes small and runnable at the end of each step.

---

## 14. UI/UX specification (Swiggy / Blinkit-style consumer app)

**Goal:** the app should feel like a mainstream food/quick-commerce app: fast, image-led, thumb-friendly, with an always-visible cart. **Take inspiration from the interaction patterns only. Do not copy any brand's logo, name, illustrations, icons, photos, copy or exact color values.** Brand name in the UI: **hotel-core** (placeholder, swappable via one CSS/JS constant).

### 14.1 Principles
1. **Mobile-first.** Design at 390 px width first; scale up to tablet/desktop (content container max-width 1200 px; menu page becomes two columns on ≥ 1024 px).
2. **Image-led and scannable:** big cover images for hotels, square thumbnails for dishes, clear price, veg/non-veg marker.
3. **Cart always in reach:** sticky bottom cart bar on hotel/menu pages once the cart has items.
4. **Instant feedback:** quantity steppers update the cart optimistically with no loading spinner; toasts for errors.
5. **Browse first, log in late:** guests can browse and fill the cart; login/registration is requested at checkout, then returns to the cart (cart is preserved).
6. **One-hotel cart** (§1.3): adding an item from a different hotel opens a "Replace cart?" confirmation.
7. **Every screen has loading, empty, and error states** (§14.7).

### 14.2 Design tokens (`public/css/tokens.css`, CSS variables)
```css
:root {
  /* color */
  --brand: #FF6A13;        --brand-dark: #E55A0A;   --brand-soft: #FFF1E8;
  --veg: #1E9E57;          --nonveg: #D93025;
  --bg: #F6F6F8;           --surface: #FFFFFF;
  --text: #1C1C1E;         --text-muted: #6B6B76;   --border: #E8E8EE;
  --success: #1E9E57;      --warning: #F5A623;      --danger: #D93025;  --info: #2D6CDF;
  /* shape & elevation */
  --radius-sm: 8px; --radius-md: 12px; --radius-lg: 16px; --radius-pill: 999px;
  --shadow-1: 0 1px 3px rgba(0,0,0,.08);
  --shadow-2: 0 6px 20px rgba(0,0,0,.12);
  /* spacing: 4-pt scale */
  --s1: 4px; --s2: 8px; --s3: 12px; --s4: 16px; --s5: 24px; --s6: 32px;
  /* type */
  --font: "Inter", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  --fs-xs: 12px; --fs-sm: 14px; --fs-md: 16px; --fs-lg: 20px; --fs-xl: 24px;
}
```
- Fonts: self-host Inter (or use the system stack); the app must render correctly with the fallback.
- Minimum touch target 44×44 px. Text contrast ≥ WCAG AA. Body text 14–16 px.
- Currency: always `Intl.NumberFormat('en-IN', {style:'currency', currency:'INR'})` (₹).
- Light theme only in v1.

### 14.3 Component library (`public/js/components/`)
App shell (top bar + bottom tab bar) · Search field · Chip / chip-row (horizontal scroll) · Hotel card · Menu item row · Veg/non-veg marker (square outline with dot) · **ADD button → quantity stepper (− 1 +)** · Sticky cart bar · Bottom sheet / modal · Cart line · Bill summary · Status chip (Pending = amber, Completed = green, Cancelled = red) · Toast · Skeleton loader · Empty state · Error state with Retry · Toggle switch · Form fields with inline validation · Data table (admin) · Tabs.

### 14.4 Customer screens
Routing: browser-history URLs (`/`, `/hotel/:id`, `/cart`, `/orders`, `/orders/:id`, `/account`, `/login`). Express serves the SPA fallback for direct navigation and refresh. Bottom tab bar on mobile: **Home · Search · Orders · Account** (+ cart reachable via the sticky bar and a header cart icon with badge). On desktop the tab bar becomes a top navigation.

1. **Home / hotel discovery (`/`)**
   - Sticky header: brand, search field ("Search hotels or cuisines").
   - Cuisine chips (derived from `GET /hotels` `cuisines`), horizontal scroll, tap to filter (client-side).
   - "Hotels for you" grid: **Hotel card** = cover image (16:9, lazy, placeholder on error), logo badge, name, cuisines, address line; **"Closed"** greyed overlay when `accepting_orders=false`.
   - Pagination via "Load more" (or infinite scroll).
2. **Hotel page (`/hotel/:id`)**
   - Header: cover image, name, cuisines, address, open/closed pill.
   - Sticky row: in-menu search, **Veg only** toggle.
   - Sticky category chips with scroll-spy (tapping scrolls to the category; active chip follows scroll).
   - Menu rows: left = veg marker, name, price, 2-line description; right = 96×96 rounded image with the **ADD** button overlapping its bottom edge. After adding, the button becomes the − qty + stepper. Unavailable items: greyed, "Sold out", no ADD button.
   - Data from `GET /hotels/:hotelId/menu` (one request); filtering is client-side.
   - **Sticky cart bar** (bottom, above tab bar): "N items · ₹total — View cart ›".
3. **Cart (`/cart`)**: hotel name header; line items with steppers; item total (no taxes/fees in v1); payment method selector (Cash / UPI / Card — recorded only, no gateway; say "Pay at counter/on delivery" style helper text); sticky **Place order · ₹total** button. If not logged in → `/login?next=/cart`. Closed hotel → button disabled with explanation. Server price/availability errors (`ITEM_UNAVAILABLE`, `INVALID_MENU_ITEM`) shown inline per item with a "Remove" action.
4. **Order placed**: full-screen success (animated check), order number, items summary, buttons **View order** and **Back to home**. Cart cleared.
5. **Orders (`/orders`)**: cards newest first from `/me/orders`: hotel logo+name, items summary, total, date/time (IST), status chip. Filters: All / Active / Past. Tap → detail (`/orders/:id`) with item lines and **Cancel order** (only when pending) and **Reorder** (re-adds still-available items from the same hotel, then opens the cart).
6. **Auth (`/login`, register tab)**: mobile full-screen form, inline validation, show/hide password, clear error messages; returns to `next` route. Session expiry (401) → login screen with the cart intact.
7. **Account (`/account`)**: name, phone, email, logout. Hotel admins see "Manage <hotel>" shortcuts; platform admin sees "Platform console".

**Client state**: cart in `localStorage` (`{hotelId, items:[{menu_item_id, name, price, qty}]}`; contains no secrets; prices are display-only, the server recomputes); JWT in `sessionStorage` (cleared on tab close; 1 h expiry). Strict CSP, no inline event handlers, all user-provided text rendered with `textContent` (no `innerHTML` with API data).

### 14.5 Hotel admin panel (`/admin/:hotelId/...`)
Layout: left sidebar on desktop, top tabs on mobile. Hotel switcher in the header for users linked to several hotels.
- **Live orders:** pending orders first, auto-refresh every 15 s (plain polling), each card shows order #, time, customer name/phone, items, total, payment method; buttons **Mark completed** and **Cancel**. Tabs: Pending / Completed / Cancelled; date filter.
- **Menu manager:** grouped by category; each row has image, name, price, veg marker, **availability toggle**; **Add item** and **Edit** open a side sheet/modal (name, category, price, veg, description, image URL with live preview). Search + category filter.
- **Reports:** date picker → today's sales card (order count, total); top-selling items list with simple CSS bars (no chart library).
- **Settings:** accepting-orders toggle (Open/Closed), description, cuisines, address, phone, logo/cover URLs with preview.

### 14.6 Platform admin panel (`/platform/...`)
- **Hotels:** table (name, slug, status chip, admins count, created), search, **Create hotel** modal (name, cuisines, address, phone), Suspend/Activate action with confirmation.
- **Hotel detail:** admins list; **Add admin** (link an existing active customer by user ID or case-insensitive email, **or** create new), remove admin with confirmation.
- **Metrics:** table from `/platform/metrics` (route, count, errors, p50/p95/max), refresh button.

### 14.7 States & feedback
- **Loading:** skeleton cards/rows matching final layout (no full-page spinners).
- **Empty:** friendly illustration-free message + action (e.g. "No hotels yet", "Your cart is empty — Browse hotels").
- **Error:** inline error panel with **Retry**; network offline → persistent toast "You're offline".
- **Success/errors from actions:** toasts (3 s), form errors inline.
- **Images:** `loading="lazy"`, explicit `width`/`height` (no layout shift), inline SVG placeholder on `onerror`.

### 14.8 Frontend architecture and bundle budget
The application source lives in `frontend/src/`, with customer routes under `pages/`, administrative routes under `admin/`, and shared components, API clients, and state under their respective directories. Vite produces the static production application in `frontend/dist/`.

The accepted frontend architecture is React 18 with Vite. No CDN dependencies are required at runtime. The initial entry JavaScript has a gzip budget of 200 KiB (204,800 bytes) and a secondary raw-size sanity cap of 400 KiB (409,600 bytes). This applies to the entrypoint and its transitive **static JavaScript imports** required at startup; dynamically imported route and feature chunks are excluded until their routes or features are visited. The limits apply to the initial payload, not all generated JavaScript combined.

`frontend/scripts/check-size.js` reads Vite's production `.vite/manifest.json`, follows the entrypoint's transitive `imports` (not `dynamicImports`), and reports raw and gzip bytes for every generated JavaScript chunk. It sums the unique initial JavaScript chunks' raw and gzip sizes, enforces the aggregate 200 KiB gzip budget and 400 KiB raw cap, and keeps a 200 KiB gzip safety check for each generated chunk.

### 14.9 UI acceptance checklist
- [ ] Usable at 360–430 px width; no horizontal scroll; tap targets ≥ 44 px.
- [ ] Home shows hotel cards with images; closed hotels are visibly closed and cannot be ordered from.
- [ ] Hotel page: sticky category chips with scroll-spy, veg-only toggle, ADD→stepper, sold-out state, sticky cart bar.
- [ ] Cart enforces one hotel with a "Replace cart?" dialog; cart survives refresh and login.
- [ ] Checkout works end to end; success screen; order visible in Orders with correct status chip.
- [ ] Reorder and cancel-pending work.
- [ ] Hotel admin can: see live orders, complete/cancel, edit menu with images, toggle availability and open/closed, view reports.
- [ ] Platform admin can: create a hotel, add/remove its admin, suspend/activate, view metrics.
- [ ] Loading, empty and error states exist for every list screen.
- [ ] No API data is inserted via `innerHTML`; CSP does not break the app.
- [ ] Keyboard focus visible; images have alt text; colour contrast AA.
- [ ] No third-party brand assets or names used.
