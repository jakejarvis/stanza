---
"@withstanza/schema": patch
"stanza-cli": patch
---

Reject env var line-injection in `.env.example` generation. Module env declarations now validate `name` against the dotenv/shell key pattern `^[A-Za-z_][A-Za-z0-9_]*$` and reject control characters (newlines, CR, …) in `example` and `description`, both at the schema boundary (`envVarSchema`, applied to fetched third-party modules) and as a defense-in-depth guard inside the pure `appendEnvVar` helper. Previously a module with a newline in `name`/`example`/`description` could smuggle extra `KEY=value` lines into the generated `.env.example`.
