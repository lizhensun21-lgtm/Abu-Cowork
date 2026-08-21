# Abu PM Server foundation

This directory is the parallel V1 server foundation. The Electron desktop still uses the sealed RC1 JSON repository; there is no server cutover or dual-write in F1A.

Requirements: Java 21 and Docker Desktop (or another Docker-compatible runtime). Maven is supplied through the wrapper and downloads its pinned wrapper JAR and Maven distribution on first use.

From the repository root, start each process in its own PowerShell window:

```powershell
.\scripts\start-pm-db.ps1
.\scripts\start-pm-server.ps1
.\scripts\start-abu-desktop.ps1
```

The development-only PostgreSQL database is `abu_pm_dev` on `127.0.0.1:5432`. Its checked-in credentials are intentionally local-only. Production configuration requires `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD`.

Run server checks with `server\mvnw.cmd clean verify`. Integration tests require a working Docker runtime and use a real PostgreSQL Testcontainer; they never fall back to an embedded database.

Date contract: calendar dates use Java `LocalDate`, PostgreSQL `DATE`, and JSON `YYYY-MM-DD`. System timestamps use Java `Instant`, PostgreSQL `TIMESTAMPTZ`, and ISO-8601 UTC JSON. IDs use Java/PostgreSQL `UUID` and UUID strings in JSON.

## V1 server API convention

F1B defines infrastructure and tests only. It does not expose Project, Timeline,
Milestone, Person, Team, Phase, GateReview, Issue, Risk, or Action APIs, and it
does not connect the RC1 desktop repository to the server.

### Resources and HTTP

- Business resources live below `/api/v1/...`. Use plural resource nouns and
  path identifiers, not RPC names such as `/projectService` or
  `/updateProjectDate`.
- Reads, updates, and successful commands return `200`; creates return `201`;
  successful deletes return `204`.
- Malformed JSON, invalid syntax, and unsupported query forms return `400`.
  Missing resources return `404`. Business invariant, uniqueness, and stale
  version conflicts return `409`. DTO and field validation return `422`.
  Required backend outages return `503`; unexpected failures return `500`.
- A single resource is returned as its typed response. Lists always use an
  `items` envelope. Paged lists use `items`, `page`, `size`, and `total`; do not
  wrap every success in a generic `success/data` envelope.
- Complex atomic mutations use a resource-scoped command endpoint, for example
  future `POST /api/v1/project-timelines/{id}/move`, rather than a sequence of
  unrelated PATCH calls.

### Error and DTO contracts

Errors use `code`, `message`, `fieldErrors`, and mandatory `traceId` fields.
Each field error uses the API DTO property name plus `code` and `message`.
Clients branch on the stable `UPPER_SNAKE_CASE` code, never on the fallback
message. Common codes are:

```text
REQUEST_MALFORMED
VALIDATION_FAILED
RESOURCE_NOT_FOUND
BUSINESS_CONFLICT
STALE_VERSION
DATABASE_UNAVAILABLE
INTERNAL_ERROR
```

Feature rounds add only their own specific codes. Request types are named
`Create<Entity>Request`, `Update<Entity>Request`, or a command-specific name;
response types are named `<Entity>Response`, with `<Entity>ListItemResponse`
reserved for real list projections. Persistence records and API DTOs remain
separate, and Mapper records are never exposed by Controllers.

PATCH request fields use `PatchField<T>` so omitted, explicit JSON `null`, and
a supplied value remain distinct. Every update request normalizes a missing
wrapper with `PatchField.orAbsent(...)`. `null` must never implicitly mean "do
not update". Prefer a command-specific request when a mutation represents a
business operation rather than independent field replacement.

### Validation and transactions

Validation has three complementary layers:

1. Controller request DTOs use Bean Validation for required fields, format,
   length, and simple ranges.
2. Services enforce business invariants and lifecycle rules.
3. PostgreSQL constraints enforce PK, FK, UNIQUE, NOT NULL, and CHECK invariants,
   including race-condition protection.

Controllers and Mappers do not own transactions. A Service mutation method is
the transaction boundary and uses `@Transactional`; any unchecked failure rolls
back all writes. Read services use `@Transactional(readOnly = true)` only when
the consistency or lifecycle benefit is real. HTTP success is returned only
after the server transaction commits; a Desktop cache is presentation state,
not a canonical source.

Services should detect known business conflicts before writing. A database
constraint remains the race-safe backstop. Generic integrity violations are
translated to a stable `409 BUSINESS_CONFLICT`, while connection/backend
failures map to `503 DATABASE_UNAVAILABLE`; raw SQL or constraint details are
never returned to clients. Feature services may translate known named
constraints into a more specific stable feature code.

### Persistence and concurrency

Canonical mutable tables default to:

```sql
id UUID PRIMARY KEY,
created_at TIMESTAMPTZ NOT NULL,
updated_at TIMESTAMPTZ NOT NULL,
version BIGINT NOT NULL DEFAULT 0
```

Use UTC `Instant` for audit timestamps and keep business `DATE` values separate.
Every mutation updates `updated_at`. Mutable responses include `version`, and
updates/commands submit the expected version. SQL increments the version only
when `WHERE id = ... AND version = ...` matches; zero affected rows maps to
`409 STALE_VERSION` and prevents silent lost updates.

There is no global soft-delete field or base entity. Each domain chooses hard
delete, lifecycle state, or history retention according to its own semantics.
Database schema is `abu`; tables use singular `snake_case`, and columns use
`snake_case`.

Production MyBatis code uses Mapper interfaces plus XML for joins, filters,
dynamic queries, and other non-trivial SQL. Annotation SQL is limited to short,
stable statements and foundation/test fixtures. Every Mapper parameter uses
explicit `@Param`, especially UUID and multi-parameter methods. Mappers return
persistence/projection records; Services map them to API responses. Sort field
names are translated through a feature-owned whitelist and are never directly
concatenated into SQL.

### Query, trace, and serialization

- Pagination is one-based with defaults `page=1`, `size=50`, and maximum
  `size=200`. Invalid numeric ranges return `422 VALIDATION_FAILED`.
- Simple text search uses `q`. Different filter dimensions combine with AND;
  multi-value behavior within one dimension is defined by the feature.
- Sort uses `sort=field,direction`, where direction is `asc` or `desc` and the
  field must be on the feature whitelist. Invalid sorts return `422`.
- `X-Trace-Id` is accepted only in the safe F1A format or regenerated. It is
  present on successful and error responses, in error bodies, and in log MDC.
- API JSON uses UTF-8 and camelCase. Database snake_case does not leak through
  the API. Unknown request properties are rejected to prevent contract drift.

The machine-consumable summary is
`src/main/resources/api-conventions.json` and is covered by contract tests.
OpenAPI generation is intentionally deferred until real resource APIs exist;
F1B does not add a speculative dependency or publish empty business schemas.
