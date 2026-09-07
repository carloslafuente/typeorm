import type { ObjectLiteral } from "../../common/ObjectLiteral"
import { NamedPlaceholdersNotSupportedError } from "../../error/NamedPlaceholdersNotSupportedError"
import { QueryFailedError } from "../../error/QueryFailedError"
import { QueryRunnerAlreadyReleasedError } from "../../error/QueryRunnerAlreadyReleasedError"
import { QueryResult } from "../../query-runner/QueryResult"
import { Broadcaster } from "../../subscriber/Broadcaster"
import { BroadcasterResult } from "../../subscriber/BroadcasterResult"
import { AbstractSqliteQueryRunner } from "../sqlite-abstract/AbstractSqliteQueryRunner"
import type { LibSqlDriver } from "./LibSqlDriver"

/**
 * Runs queries on a single LibSQL database connection.
 */
export class LibSqlQueryRunner extends AbstractSqliteQueryRunner {
    /**
     * Database driver used by connection.
     */
    driver: LibSqlDriver

    /**
     * Handle of the transaction that is currently open, if any.
     *
     * libsql runs every statement sent to the client in its own implicit
     * transaction, so a "BEGIN TRANSACTION" sent as a standalone statement is
     * committed on its own and the statements after it run outside of it.
     * Explicit transactions have to go through this handle instead.
     */
    protected libsqlTransaction?: any

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(driver: LibSqlDriver) {
        super()
        this.driver = driver
        this.dataSource = driver.dataSource
        this.broadcaster = new Broadcaster(this)
    }

    // -------------------------------------------------------------------------
    // Public Methods
    // -------------------------------------------------------------------------

    /**
     * Releases used database connection.
     */
    async release(): Promise<void> {
        // an unfinished transaction would otherwise keep holding the connection
        if (this.libsqlTransaction) {
            this.libsqlTransaction.close()
            this.libsqlTransaction = undefined
            this.isTransactionActive = false
            this.transactionDepth = 0
        }

        return super.release()
    }

    /**
     * Called before migrations are run.
     */
    async beforeMigration(): Promise<void> {
        await this.query("PRAGMA foreign_keys = OFF")
    }

    /**
     * Called after migrations are run.
     */
    async afterMigration(): Promise<void> {
        await this.query("PRAGMA foreign_keys = ON")
    }

    /**
     * Executes a given SQL query.
     *
     * @param query
     * @param parameters
     * @param useStructuredResult
     */
    async query(
        query: string,
        parameters: any[] | ObjectLiteral = [],
        useStructuredResult = false,
    ): Promise<any> {
        if (this.isReleased) throw new QueryRunnerAlreadyReleasedError()
        if (parameters && !Array.isArray(parameters))
            throw new NamedPlaceholdersNotSupportedError()

        const dataSource = this.driver.dataSource

        // libsql binds neither booleans nor undefined
        const normalizedParameters = parameters.map((parameter) => {
            if (typeof parameter === "boolean") return parameter ? 1 : 0
            if (parameter === undefined) return null
            return parameter
        })

        const broadcasterResult = new BroadcasterResult()

        dataSource.logger.logQuery(query, normalizedParameters, this)
        await this.broadcaster.broadcast(
            "BeforeQuery",
            query,
            normalizedParameters,
        )
        const queryStartTime = Date.now()

        try {
            const result = await this.executeStatement(
                query,
                normalizedParameters,
            )

            // log slow queries if maxQueryExecution time is set
            const maxQueryExecutionTime =
                this.driver.options.maxQueryExecutionTime
            const queryEndTime = Date.now()
            const queryExecutionTime = queryEndTime - queryStartTime
            if (
                maxQueryExecutionTime &&
                queryExecutionTime > maxQueryExecutionTime
            )
                dataSource.logger.logQuerySlow(
                    queryExecutionTime,
                    query,
                    normalizedParameters,
                    this,
                )

            this.broadcaster.broadcastAfterQueryEvent(
                broadcasterResult,
                query,
                normalizedParameters,
                true,
                queryExecutionTime,
                result.raw,
                undefined,
            )

            if (!useStructuredResult) {
                return result.raw
            }

            return result
        } catch (err) {
            dataSource.logger.logQueryError(
                err,
                query,
                normalizedParameters,
                this,
            )
            this.broadcaster.broadcastAfterQueryEvent(
                broadcasterResult,
                query,
                normalizedParameters,
                false,
                undefined,
                undefined,
                err,
            )

            throw new QueryFailedError(query, normalizedParameters, err)
        } finally {
            await broadcasterResult.wait()
        }
    }

    // -------------------------------------------------------------------------
    // Protected Methods
    // -------------------------------------------------------------------------

    /**
     * Runs one statement against libsql and shapes its result set the way the
     * rest of TypeORM expects it.
     *
     * The transaction control statements the abstract sqlite query runner emits
     * are turned into calls on libsql's transaction API rather than being sent
     * as SQL, since libsql would otherwise commit each of them on its own.
     * Savepoints are left as SQL — they run inside the open transaction.
     *
     * @param query
     * @param parameters
     */
    protected async executeStatement(
        query: string,
        parameters: any[],
    ): Promise<QueryResult> {
        const databaseConnection = await this.connect()

        switch (query) {
            case "BEGIN TRANSACTION":
                this.libsqlTransaction =
                    await databaseConnection.transaction("deferred")
                return new QueryResult()
            case "COMMIT":
                await this.libsqlTransaction.commit()
                this.libsqlTransaction = undefined
                return new QueryResult()
            case "ROLLBACK":
                await this.libsqlTransaction.rollback()
                this.libsqlTransaction = undefined
                return new QueryResult()
        }

        // while a transaction is open every statement has to be routed through
        // its handle to take part in it
        const executor = this.libsqlTransaction ?? databaseConnection
        const resultSet = await executor.execute({
            sql: query,
            args: parameters,
        })

        const result = new QueryResult()

        // a statement that returns rows always reports its columns, even when
        // it matches none; a write reports an empty column list
        if (resultSet.columns.length > 0) {
            const records = resultSet.rows.map((row: any) =>
                // libsql rows are arrays carrying named properties, so they
                // have to be rebuilt as plain objects before hydration
                Object.fromEntries(
                    resultSet.columns.map((column: string, i: number) => [
                        column,
                        row[i],
                    ]),
                ),
            )

            result.raw = records
            result.records = records
        } else {
            result.affected = resultSet.rowsAffected
            result.raw = this.normalizeLastInsertRowid(
                resultSet.lastInsertRowid,
            )
        }

        return result
    }

    /**
     * libsql always reports the inserted row id as a bigint, whereas the rest of
     * the sqlite drivers report a number. Narrow it back where that is lossless
     * so generated primary keys keep their usual type.
     *
     * @param lastInsertRowid
     */
    protected normalizeLastInsertRowid(
        lastInsertRowid: bigint | undefined,
    ): number | string | undefined {
        if (lastInsertRowid === undefined) return undefined

        return lastInsertRowid <= Number.MAX_SAFE_INTEGER
            ? Number(lastInsertRowid)
            : lastInsertRowid.toString()
    }
}
