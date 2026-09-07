import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../src/data-source/DataSource"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../utils/test-utils"
import { Post } from "./entity/Post"

describe("github issues > #11665 simple-json should use nvarchar to be in line with current JSON support in SQL server", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post],
            enabledDrivers: ["mssql"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should store simple-json and simple-array as nvarchar(MAX)", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const queryRunner = dataSource.createQueryRunner()
                const table = await queryRunner.getTable("post")
                await queryRunner.release()

                const jsonColumn = table!.findColumnByName("jsonField")!
                expect(jsonColumn.type).to.equal("nvarchar")
                expect(jsonColumn.length).to.equal("MAX")

                const arrayColumn = table!.findColumnByName("arrayField")!
                expect(arrayColumn.type).to.equal("nvarchar")
                expect(arrayColumn.length).to.equal("MAX")
            }),
        ))

    it("should round-trip a payload longer than the 255 character nvarchar default", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)

                // 1000 characters — comfortably past the length getColumnLength()
                // applies to an unlengthed nvarchar, which would silently truncate
                const payload = "x".repeat(1000)
                const arrayField = Array.from(
                    { length: 200 },
                    (_, i) => `v${i}`,
                )

                await repository.save({
                    id: 1,
                    jsonField: { payload },
                    arrayField,
                })

                const loadedPost = await repository.findOneByOrFail({ id: 1 })
                expect(loadedPost.jsonField.payload).to.equal(payload)
                expect(loadedPost.jsonField.payload).to.have.lengthOf(1000)
                expect(loadedPost.arrayField).to.eql(arrayField)
            }),
        ))

    it("should be readable by the SQL Server JSON functions, which reject ntext", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                await repository.save({
                    id: 1,
                    jsonField: { payload: "VALUE" },
                    arrayField: ["A", "B"],
                })

                const rows = await dataSource.query(
                    `SELECT JSON_VALUE("jsonField", '$.payload') AS "payload" ` +
                        `FROM "post" WHERE ISJSON("jsonField") = 1`,
                )

                expect(rows).to.have.lengthOf(1)
                expect(rows[0].payload).to.equal("VALUE")
            }),
        ))

    it("should not generate a schema change for an already migrated column", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const sqlInMemory = await dataSource.driver
                    .createSchemaBuilder()
                    .log()

                expect(sqlInMemory.upQueries).to.have.lengthOf(0)
                expect(sqlInMemory.downQueries).to.have.lengthOf(0)
            }),
        ))
})
