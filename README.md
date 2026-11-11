# hotel-core

Multi-hotel food ordering platform. See [SPEC.md](SPEC.md) for the project specification.

Backend commands:

```sh
cd backend
npm install
npm start
npm test
```

Copy `backend/.env.example` to `backend/.env` and set local configuration before starting the backend.
Hotel owners can register without platform-admin approval. Anonymous registrations create the owner account and hotel membership; authenticated customer registrations reuse the existing customer account. New hotels become active and publicly discoverable immediately. Platform administrators retain the ability to suspend and reactivate any hotel. No approval configuration is required.

Hotel cover and logo images are optional. A shared, locally bundled Hotel Core storefront illustration is shown when no image is configured or an optional image fails to load. No image upload or external image service is required.

Historical `pending` and `rejected` records remain in the database but stay hidden from public listings and direct public access. A platform administrator can explicitly activate an individual legacy hotel from the platform hotel list or detail page. Owners cannot resubmit or activate these records themselves. Suspended hotels are also hidden publicly and all backend writes and new orders are rejected until a platform administrator reactivates them.

## Database setup

`backend/database/schema.sql` and `backend/database/seed.sql` are the authoritative fresh-install and demo-seed files. They do not select or switch databases; the scripts connect to the validated `DB_NAME` target.

```sh
cd backend
DB_NAME=hotel_core_dev npm run db:init
DB_NAME=hotel_core_dev npm run db:seed
```

For an existing database, apply the latest repeatable schema migrations with:

```sh
cd backend
DB_NAME=hotel_core_dev npm run migrate
```

Migrations 003 and 004 add customer address/feedback storage and a saved-address book with an order delivery-address snapshot. Migration 004 carries existing customer profile addresses into the address book. Apply them to the intended database before using address selection at checkout.

Demo seeding is idempotent and allowed only for a database ending in `_dev` or `_test`. It upserts the named demo hotels and menu rows; it does not delete existing records. Reset is restricted to a disposable `_test` database and requires its exact name:

```sh
DB_NAME=hotel_core_test npm run db:reset -- --confirm-reset=hotel_core_test
```

The root `database/init.sh` is a compatibility wrapper around these guarded commands. Never use reset against development or production data.

## Development and tests

For development, copy `backend/.env.example` to `backend/.env` and configure local credentials there. Keep `DB_NAME=hotel_core_dev`; the backend dev server loads this file and uses the configured database name. Start the backend with `npm --prefix backend run dev` and the Vite frontend with `npm --prefix frontend run dev`.

Database integration tests load connection settings from `backend/.env`, then explicitly set `DB_NAME=hotel_core_test` in the test process before connecting. They therefore never use the `.env` database name. Run the full suite from the repository root with `npm run verify`; the test database is disposable and tests may recreate it. Manual browser QA uses a production build against `hotel_core_dev`, never `hotel_core_test`.
