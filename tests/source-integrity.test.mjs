import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function read(path) {
  return readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
}

test("package manifests parse", () => {
  const pkg = JSON.parse(read("package.json"));
  JSON.parse(read("package-lock.json"));
  JSON.parse(read("tsconfig.json"));
  JSON.parse(read("drizzle/meta/_journal.json"));
  assert.equal(pkg.devDependencies.wrangler, "4.92.0");
});

test("worker module has a default export", () => {
  assert.match(read("worker/index.ts"), /export default worker;/);
});
