export class SequentialIdGenerator {
  private index = BigInt(1)

  generate(): string {
    const id = this.index.toString(36)
    this.index++
    return id
  }
}
