# @standardserver/deno

End-to-end tests for Standard Server running on the [Deno](https://deno.com) runtime.

For now this package only hosts e2e tests (no published code). It exercises the `@standardserver/fetch` adapters against a real `Deno.serve` HTTP server and the `@standardserver/peer` client/server over Deno's native WebSockets, using `deno test`.

```bash
deno test --sloppy-imports --unstable-no-legacy-abort --allow-net --allow-read --allow-env tests/
```
