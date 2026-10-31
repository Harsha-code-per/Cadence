import assert from "node:assert/strict";
import { test } from "node:test";
import { toApi } from "../src/lib/resource-payload.ts";

test("blank discount minimums use zero, while dates and usage limits stay nullable", () => {
  const fields = [
    { name: "min_amount", kind: "money", emptyValue: "0.00" },
    { name: "min_quantity", kind: "number", emptyValue: 0 },
    { name: "end_date", kind: "date" },
    { name: "usage_limit", kind: "number" },
  ];
  assert.deepEqual(toApi(fields, Object.fromEntries(fields.map((f) => [f.name, ""]))), {
    min_amount: "0.00", min_quantity: 0, end_date: null, usage_limit: null,
  });
  assert.deepEqual(toApi(fields, {
    min_amount: "1200.50", min_quantity: "10", end_date: "2026-12-31", usage_limit: "5",
  }), { min_amount: "1200.50", min_quantity: 10, end_date: "2026-12-31", usage_limit: 5 });
});

test("a template with no product lines sends an empty list, not null", () => {
  const fields = [{ name: "lines", kind: "custom", emptyValue: [] }];
  assert.deepEqual(toApi(fields, { lines: null }), { lines: [] });
  const lines = [{ product: 1, variant: null, quantity: 1, description: "" }];
  assert.deepEqual(toApi(fields, { lines }), { lines });
});
