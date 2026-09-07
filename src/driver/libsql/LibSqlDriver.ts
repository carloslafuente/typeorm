import type { DataSource } from "../../data-source"
import { DriverPackageNotInstalledError } from "../../error"
import { PlatformTools } from "../../platform/PlatformTools"
import type { QueryRunner } from "../../query-runner/QueryRunner"
import { AbstractSqliteDriver } from "../sqlite-abstract/AbstractSqliteDriver"
import type { ColumnType } from "../types/ColumnTypes"
import type { ReplicationMode } from "../types/ReplicationMode"
import type { LibSqlDataSourceOptions } from "./LibSqlDataSourceOptions"
import { LibSqlQueryRunner } from "./LibSqlQueryRunner"

/**
 * Organizes communication with LibSQL, a fork of sqlite that additionally
 * speaks a remote protocol.
 */
export class LibSqlDriver extends AbstractSqliteDriver {
    // -------------------------------------------------------------------------
    // Public Implemented Properties
    // -------------------------------------------------------------------------

    /**
     * DataSource options.
     */
    options: LibSqlDataSourceOptions

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(dataSource: DataSource) {
        super(dataSource)

        this.database = this.options.database

        // load libsql package
        this.loadDependencies()
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Closes connection with database.
     */
    async disconnect(): Promise<void> {
        this.queryRunner = undefined
        // libsql's close() is synchronous, unlike the callback-style close()
        // the abstract driver expects
        this.databaseConnection.close()
    }

    /**
     * Creates a query runner used to execute database queries.
     *
     * @param mode
     */
    createQueryRunner(mode: ReplicationMode): QueryRunner {
        this.queryRunner ??= new LibSqlQueryRunner(this)

        return this.queryRunner
    }

    normalizeType(column: {
        type?: ColumnType
        length?: number | string
        precision?: number | null
        scale?: number
    }): string {
        if (
            typeof column.type === "function" &&
            column.type.prototype instanceof Uint8Array
        ) {
            return "blob"
        }

        return super.normalizeType(column)
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Creates connection with the database.
     */
    protected async createDatabaseConnection() {
        const {
            database,
            authToken,
            syncUrl,
            syncInterval,
            encryptionKey,
            intMode,
            concurrency,
        } = this.options

        const databaseConnection = this.sqlite.createClient({
            url: database,
            authToken,
            syncUrl,
            syncInterval,
            encryptionKey,
            intMode,
            // libsql pools connections by default, and a pooled connection can
            // answer with a schema it has not caught up with yet — a PRAGMA
            // issued right after a DDL statement then reports the old schema.
            // The sqlite drivers are single-connection anyway, so pin it.
            concurrency: concurrency ?? 1,
        })

        // we need to enable foreign keys to make sure all foreign key related
        // features work properly. this also makes onDelete to work.
        await databaseConnection.execute("PRAGMA foreign_keys = ON")

        return databaseConnection
    }

    /**
     * If driver dependency is not given explicitly, then try to load it via "require".
     */
    protected loadDependencies(): void {
        try {
            this.sqlite =
                this.options.driver ?? PlatformTools.load("@libsql/client")
        } catch (e) {
            throw new DriverPackageNotInstalledError("LibSQL", "@libsql/client")
        }
    }
}
