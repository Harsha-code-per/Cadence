import assert from "node:assert/strict";
import { test } from "node:test";
import { pinDistance } from "../src/components/landing/scroll-distance.ts";

test("desktop pinned chapters need about half the former extra scroll distance", () => {
  const total = pinDistance("statement", 900) + pinDistance("billing", 900) + pinDistance("month", 1274);
  assert.equal(total, 2729);
  assert.ok(total < (1500 + 2400 + 1274) * 0.55);
});

test("viewport-dependent holds stay bounded on short and tall screens", () => {
  assert.equal(pinDistance("statement", 400), 420);
  assert.equal(pinDistance("statement", 2000), 720);
  assert.equal(pinDistance("billing", 400), 900);
  assert.equal(pinDistance("billing", 2000), 1440);
  assert.equal(pinDistance("month", -100), 1);
});
