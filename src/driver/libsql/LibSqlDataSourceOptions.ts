import type { BaseDataSourceOptions } from "../../data-source/BaseDataSourceOptions"

/**
 * LibSQL-specific connection options.
 *
 * @see https://docs.turso.tech/sdk/ts/reference
 */
export interface LibSqlDataSourceOptions extends BaseDataSourceOptions {
    /**
     * Database type.
     */
    readonly type: "libsql"

    /**
     * Location of the database, passed to libsql as its "url".
     *
     * Supported schemes are "file:" for a local database file, ":memory:" for an
     * in-memory database, and "libsql:" / "http:" / "https:" / "ws:" / "wss:" for
     * a remote server.
     */
    readonly database: string

    /**
     * Authentication token used when connecting to a remote server.
     */
    readonly authToken?: string

    /**
     * Location of the remote server to replicate a local database file from.
     * Requires "database" to point at a local file (embedded replica).
     */
    readonly syncUrl?: string

    /**
     * How often, in seconds, the embedded replica is synced with "syncUrl".
     * When not set, syncing is only performed on demand.
     */
    readonly syncInterval?: number

    /**
     * Encryption key used for an encrypted local database file.
     */
    readonly encryptionKey?: string

    /**
     * How SQLite integers are returned. Defaults to "number", which matches the
     * other sqlite drivers. Use "bigint" or "string" to read values that do not
     * fit into a JavaScript number.
     */
    readonly intMode?: "number" | "bigint" | "string"

    /**
     * How many requests libsql may have in flight at once.
     *
     * Defaults to 1, because a pooled connection can answer a PRAGMA with a
     * schema it has not caught up with yet, which makes schema synchronization
     * read back stale constraints. Raise it only for read-heavy workloads that
     * never synchronize schema.
     */
    readonly concurrency?: number

    /**
     * The driver object.
     * This defaults to require("@libsql/client")
     */
    readonly driver?: any

    /**
     * Not supported by libsql (the client manages its own connections).
     */
    readonly poolSize?: never
}
