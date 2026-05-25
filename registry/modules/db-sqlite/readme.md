Zero-config local database — `better-sqlite3` writes to the path in `DATABASE_URL` (defaults to `./dev.db`). No server to start.

The shared client is exported from `{{packages.db.name}}` — import it from any app or package that declares it as a dep.
