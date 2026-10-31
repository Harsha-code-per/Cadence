// Playwright page function. Layout uses local records; pagination edge cases use isolated API fixtures.
async (page) => {
  const base = new URL(page.url()).origin;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/subscriptions/board`);
  await page.waitForLoadState("networkidle");
  await page.waitForFunction(() => document.querySelectorAll('[aria-label="Subscription stages"] section ul').length === 6);
  const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
  const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
  if (await expand.count()) { await expand.click(); await collapse.waitFor(); }
  const measurements = [];
  async function measure(width, expectedColumns) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForFunction((count) => getComputedStyle(document.querySelector('[aria-label="Subscription stages"]')).gridTemplateColumns.split(" ").length === count, expectedColumns);
    const data = await page.evaluate(() => {
      const board = document.querySelector('[aria-label="Subscription stages"]');
      return {
        viewport: innerWidth, documentWidth: document.documentElement.scrollWidth,
        documentHeight: document.documentElement.scrollHeight,
        columns: [...board.children].map((column) => ({
          x: column.getBoundingClientRect().x, y: column.getBoundingClientRect().y,
          width: column.getBoundingClientRect().width, height: column.getBoundingClientRect().height,
          overflow: getComputedStyle(column.querySelector("ul")).overflowY,
          clipped: column.querySelector("ul").scrollHeight > column.querySelector("ul").clientHeight + 2,
        })),
      };
    });
    if (data.documentWidth > width) throw new Error(`Page overflow at ${width}`);
    if (data.columns.some((column) => ["auto", "scroll"].includes(column.overflow) || column.clipped)) throw new Error("A column still scrolls/clips internally");
    if (expectedColumns === 6) {
      if (Math.max(...data.columns.map((column) => column.y)) - Math.min(...data.columns.map((column) => column.y)) > 1) throw new Error("Six stages are not on one row");
      if (Math.max(...data.columns.map((column) => column.width)) - Math.min(...data.columns.map((column) => column.width)) > 1) throw new Error("Uneven column widths");
    }
    measurements.push(data);
  }
  await measure(1366, 6);
  await measure(1920, 6);
  await collapse.click();
  await expand.waitFor();
  await measure(1440, 6);
  await expand.evaluate((el) => el.blur());
  await page.mouse.move(900, 80);
  await page.getByRole("tooltip").waitFor({ state: "hidden" });
  await page.screenshot({ path: "docs/qa/pipeline-six-columns.png" });
  await page.keyboard.press("End");
  await page.waitForFunction(() => scrollY > 500);
  if (await page.locator('[aria-label="Subscription stages"] section ul').evaluateAll((lists) => lists.some((list) => list.scrollTop !== 0))) throw new Error("Keyboard scrolled a column instead of the page");
  await measure(1024, 3);
  await measure(768, 2);
  await measure(375, 1);
  await page.evaluate(() => scrollTo(0, 0));
  await page.screenshot({ path: "docs/qa/pipeline-mobile.png" });

  // Fixtures make >100-record and retry checks deterministic without writing business data.
  const statuses = ["draft", "quotation", "confirmed", "active", "paused", "closed"];
  const records = Object.fromEntries(statuses.map((status, stageIndex) => [status,
    Array.from({ length: status === "active" ? 110 : status === "closed" ? 0 : 1 }, (_, index) => ({
      id: stageIndex * 1000 + index + 1, number: `SUB/QA/${stageIndex}-${index + 1}`,
      status, customer: { id: 1, name: "QA customer with a long readable name", company: "QA subscription company" },
      plan: { name: "QA monthly plan", billing_period: "monthly" }, recurring_total: "1200.00",
      next_invoice_date: null, valid_until: null, allowed_actions: status === "draft" ? ["send", "close"] : [],
    })),
  ]));
  let failNext = true;
  const requests = [];
  await page.route("**/api/analytics/pipeline/", (route) => route.fulfill({ json: statuses.map((status) => ({ status, count: records[status].length, recurring_value: "1200.00" })) }));
  await page.route("**/api/subscriptions/?*", (route) => {
    const url = new URL(route.request().url());
    const status = url.searchParams.get("status");
    const number = Number(url.searchParams.get("page") || 1);
    const size = Number(url.searchParams.get("page_size"));
    requests.push({ status, page: number, size });
    if (status === "active" && number === 2 && failNext) return route.fulfill({ status: 503, json: { error: { code: "unavailable", message: "Retry this page.", field_errors: {} } } });
    const rows = records[status];
    return route.fulfill({ json: {
      count: rows.length, next: number * size < rows.length ? `?page=${number + 1}` : null, previous: null,
      results: rows.slice((number - 1) * size, number * size),
    } });
  });
  try {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.reload();
    const active = page.getByRole("list", { name: "active subscriptions", exact: true });
    const cards = active.locator(":scope > li[draggable]");
    await page.waitForFunction(() => document.querySelectorAll('[aria-label="active subscriptions"] > li[draggable]').length === 12);
    await active.getByRole("button", { name: /Show more/ }).click();
    await active.getByRole("alert").waitFor({ timeout: 20000 });
    if (await cards.count() !== 12) throw new Error("Pagination failure removed existing cards");
    failNext = false;
    while (await active.getByRole("button", { name: /Show more/ }).count()) {
      const before = await cards.count();
      await active.getByRole("button", { name: /Show more/ }).click();
      await page.waitForFunction((count) => document.querySelectorAll('[aria-label="active subscriptions"] > li[draggable]').length > count, before);
    }
    if (await cards.count() !== 110) throw new Error("Could not load past 100 records");
    if (requests.some((request) => request.size > 12)) throw new Error("Unbounded page request");
    await page.getByRole("list", { name: "closed subscriptions", exact: true }).getByText("Nothing here right now.").waitFor();
    await page.getByRole("button", { name: "Move SUB/QA/0-1", exact: true }).click();
    await page.getByRole("menuitem", { name: "Quotation", exact: true }).waitFor();
    if (await page.getByRole("menuitem", { name: "Active", exact: true }).count()) throw new Error("Invalid move was offered");
    await page.keyboard.press("Escape");
    const report = { measurements, pagination: { loaded: 110, maximumPageSize: Math.max(...requests.map((request) => request.size)), retryPreservedCards: true }, allowedMoveMenu: true, writes: 0 };
    await page.evaluate((value) => { window.__cadencePipelineReport = value; }, report);
    return report;
  } finally {
    await page.unroute("**/api/analytics/pipeline/");
    await page.unroute("**/api/subscriptions/?*");
  }
}
