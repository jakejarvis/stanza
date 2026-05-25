Set `DATABASE_URL` in `.env` to point at a Postgres instance. For local development:

```sh
docker run --rm -p 5432:5432 -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=stanza postgres:16
```

The shared database client is exported from `{{packages.db.name}}` — import it from any app or package that declares it as a dep.
