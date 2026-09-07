import { Column } from "../../../../src/decorator/columns/Column"
import { PrimaryColumn } from "../../../../src/decorator/columns/PrimaryColumn"
import { Entity } from "../../../../src/decorator/entity/Entity"

@Entity()
export class Post {
    @PrimaryColumn()
    id: number

    @Column("simple-json")
    jsonField: { payload: string }

    @Column("simple-array")
    arrayField: string[]
}
