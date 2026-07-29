# @standardserver/bun

End-to-end tests for Standard Server running on the [Bun](https://bun.com) runtime.

For now this package only hosts e2e tests (no published code). It exercises the `@standardserver/fetch` adapters against a real `Bun.serve` HTTP server and the `@standardserver/peer` client/server over Bun's native WebSockets, using `bun test`.

```bash
bun test
```
