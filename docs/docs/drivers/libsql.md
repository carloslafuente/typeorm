# LibSQL

[LibSQL](https://github.com/tursodatabase/libsql) is a fork of SQLite that additionally speaks a
remote protocol, which is what [Turso](https://turso.tech) is built on. The driver builds on the
same foundation as the other SQLite drivers, so entities, migrations and the query builder behave
exactly as they do on SQLite.

## Installation

```shell
npm install @libsql/client
```

## Data Source Options

See [Data Source Options](../data-source/2-data-source-options.md) for the common data source options.

- `database` - Location of the database, passed to libsql as its `url`. Use `file:` for a local
  database file, `:memory:` for an in-memory database, and `libsql:`, `http:`, `https:`, `ws:` or
  `wss:` for a remote server.
- `authToken` - Authentication token used when connecting to a remote server.
- `syncUrl` - Location of the remote server to replicate a local database file from. Requires
  `database` to point at a local file (embedded replica).
- `syncInterval` - How often, in seconds, the embedded replica is synced with `syncUrl`. When not
  set, syncing is only performed on demand.
- `encryptionKey` - Encryption key used for an encrypted local database file.
- `intMode` - How SQLite integers are returned: `"number"` (default, matching the other SQLite
  drivers), `"bigint"` or `"string"`. Use one of the latter two to read values that do not fit into
  a JavaScript number.
- `concurrency` - How many requests libsql may have in flight at once (default `1`). See
  [Concurrency](#concurrency) before raising it.
- `driver` - The libsql client library. Defaults to `require("@libsql/client")`.

## Example

Local file:

```typescript
import { DataSource } from "typeorm"

const dataSource = new DataSource({
    type: "libsql",
    database: "file:local.db",
    entities: [Post],
})
```

Turso, with a local embedded replica:

```typescript
const dataSource = new DataSource({
    type: "libsql",
    database: "file:local.db",
    syncUrl: "libsql://my-database.turso.io",
    authToken: process.env.TURSO_AUTH_TOKEN,
    syncInterval: 60,
    entities: [Post],
})
```

## Concurrency

The libsql client pools connections, and a pooled connection can answer a `PRAGMA` with a schema it
has not caught up with yet. Schema synchronization reads constraints back with `PRAGMA` immediately
after issuing DDL, so on a pooled client it can read stale constraints and generate incorrect
migrations. The driver therefore defaults `concurrency` to `1`, which matches the single-connection
model the other SQLite drivers use. Raise it only for read-heavy workloads that never synchronize
schema.

## Limitations

- `ATTACH` is not supported, so the multiple-database features available in the `better-sqlite3`
  driver do not apply here.
- A check constraint cannot be created against a column that does not exist, so dropping a column
  that a check constraint refers to requires dropping that constraint first — the same limitation
  the `better-sqlite3` driver has.
