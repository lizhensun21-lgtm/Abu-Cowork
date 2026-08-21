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
