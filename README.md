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

## Database setup

`backend/database/schema.sql` and `backend/database/seed.sql` are the authoritative fresh-install and demo-seed files. They do not select or switch databases; the scripts connect to the validated `DB_NAME` target.

```sh
cd backend
DB_NAME=hotel_core_dev npm run db:init
DB_NAME=hotel_core_dev npm run db:seed
```

Demo seeding is idempotent and allowed only for a database ending in `_dev` or `_test`. It upserts the named demo hotels and menu rows; it does not delete existing records. Reset is restricted to a disposable `_test` database and requires its exact name:

```sh
DB_NAME=hotel_core_test npm run db:reset -- --confirm-reset=hotel_core_test
```

The root `database/init.sh` is a compatibility wrapper around these guarded commands. Never use reset against development or production data.
