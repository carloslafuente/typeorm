import "reflect-metadata"
import { expect } from "chai"
import type { DataSource } from "../../../src/data-source/DataSource"
import {
    closeTestingConnections,
    createTestingConnections,
    reloadTestingDatabases,
} from "../../utils/test-utils"
import { Post } from "./entity/Post"

describe("libsql driver", () => {
    let dataSources: DataSource[]
    before(async () => {
        dataSources = await createTestingConnections({
            entities: [Post],
            enabledDrivers: ["libsql"],
            schemaCreate: true,
            dropSchema: true,
        })
    })
    beforeEach(() => reloadTestingDatabases(dataSources))
    after(() => closeTestingConnections(dataSources))

    it("should return the generated primary key as a number, not the bigint libsql reports", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const post = await dataSource
                    .getRepository(Post)
                    .save({ title: "First post" })

                expect(post.id).to.be.a("number")
                expect(post.id).to.equal(1)
            }),
        ))

    it("should report how many rows an update and a delete affected", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                await repository.save([
                    { title: "First post" },
                    { title: "Second post" },
                    { title: "Third post" },
                ])

                const updateResult = await repository.update(
                    { isPublished: false },
                    { isPublished: true },
                )
                expect(updateResult.affected).to.equal(3)

                const deleteResult = await repository.delete({
                    title: "Second post",
                })
                expect(deleteResult.affected).to.equal(1)
            }),
        ))

    it("should hydrate rows as plain objects rather than the array-like rows libsql returns", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                await dataSource.getRepository(Post).save({ title: "A post" })

                const rows = await dataSource.query(
                    `SELECT "id", "title" FROM "post"`,
                )

                expect(rows).to.have.lengthOf(1)
                expect(Array.isArray(rows[0])).to.be.false
                expect(Object.keys(rows[0])).to.eql(["id", "title"])
                expect(rows[0]).to.eql({ id: 1, title: "A post" })
            }),
        ))

    it("should return an empty result set for a select that matches no rows", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const rows = await dataSource.query(
                    `SELECT "id" FROM "post" WHERE "id" = 999`,
                )

                // a select reports its columns even with no rows, which is how
                // the query runner tells reads apart from writes
                expect(rows).to.eql([])
            }),
        ))

    it("should roll a transaction back", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)

                await expect(
                    dataSource.transaction(async (manager) => {
                        await manager.save(Post, { title: "Doomed post" })
                        throw new Error("rollback")
                    }),
                ).to.be.rejectedWith("rollback")

                expect(await repository.count()).to.equal(0)
            }),
        ))

    it("should persist booleans, which libsql cannot bind directly", () =>
        Promise.all(
            dataSources.map(async (dataSource) => {
                const repository = dataSource.getRepository(Post)
                await repository.save({
                    title: "Published post",
                    isPublished: true,
                })

                const loadedPost = await repository.findOneByOrFail({
                    isPublished: true,
                })
                expect(loadedPost.isPublished).to.equal(true)
            }),
        ))
})
