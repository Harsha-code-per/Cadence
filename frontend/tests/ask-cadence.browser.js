// Run as a Playwright page function against local Insights, already logged in as admin/staff.
// No live provider calls: only assistant responses are mocked; aging numbers are read locally.
async (page) => {
  const base = new URL(page.url()).origin;
  await page.goto(`${base}/insights`);
  await page.waitForLoadState("networkidle");
  const status = await (await page.request.get(`${base}/api/assistant/status/`)).json();
  if (status.enabled !== false) throw new Error("Run this no-key regression with assistant disabled");
  const heading = page.getByRole("heading", { name: "Ask Cadence", exact: true });
  if (await heading.count()) throw new Error("Disabled assistant rendered");

  const numbers = await (await page.request.get(`${base}/api/analytics/aging/`)).json();
  const answer = `INR ${numbers.find((row) => row.bucket === "60+").amount} is more than 60 days overdue.`;
  let mode = "success";
  let calls = 0;
  await page.route("**/api/assistant/status/", (route) => route.fulfill({ json: { enabled: true } }));
  await page.route("**/api/assistant/ask/?*", (route) => {
    calls += 1;
    if (route.request().method() !== "GET") throw new Error("Question must use GET");
    if (mode === "unsupported") return route.fulfill({ json: {
      answer: "I can answer revenue, aging, status and pipeline questions.", tool: null, numbers: null,
    } });
    if (mode === "failure" || mode === "rate") return route.fulfill({
      status: mode === "rate" ? 429 : 503,
      json: { error: {
        code: mode === "rate" ? "throttled" : "assistant_unavailable",
        message: mode === "rate" ? "You have asked 10 questions. Try again in a minute." : "Ask Cadence is temporarily unavailable. Please try again shortly.",
        field_errors: {},
      } },
    });
    return route.fulfill({ json: { answer, tool: "aging", numbers } });
  });
  try {
    await page.reload();
    await heading.waitFor();
    const input = page.getByLabel("Your finance question", { exact: true });
    const button = page.getByRole("button", { name: "Ask Cadence", exact: true });
    if (!(await button.isDisabled())) throw new Error("Blank question allowed");
    if (await input.getAttribute("maxlength") !== "300") throw new Error("Missing character limit");
    await input.fill("How much is more than 60 days overdue?");
    await input.press("Enter");
    await page.getByText(answer, { exact: true }).waitFor();
    const raw = page.getByLabel("Raw aggregate numbers");
    if (JSON.stringify(JSON.parse(await raw.innerText())) !== JSON.stringify(numbers)) {
      throw new Error("Displayed numbers differ from response");
    }
    await raw.focus();
    if (!(await raw.evaluate((el) => el === document.activeElement))) throw new Error("Numbers not keyboard focusable");

    for (const next of ["unsupported", "failure", "rate"]) {
      mode = next;
      await input.fill("What can you answer?");
      await button.click();
      if (next === "unsupported") {
        await page.getByText("I can answer revenue, aging, status and pipeline questions.", { exact: true }).waitFor();
        if (await raw.count()) throw new Error("Previous numbers persisted on unsupported answer");
      } else {
        await page.locator("#ask-cadence-error").waitFor();
        const error = await page.locator("#ask-cadence-error").innerText();
        if (!error.includes(next === "rate" ? "10 questions" : "temporarily unavailable")) throw new Error("Error not shown");
        if (await raw.count()) throw new Error("Previous numbers persisted on error");
      }
    }
    mode = "success";
    await input.fill("How much is more than 60 days overdue?");
    await button.click();
    await page.getByText(answer, { exact: true }).waitFor();
    await page.setViewportSize({ width: 375, height: 812 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    if (overflow) throw new Error("Mobile page overflows horizontally");
    await page.screenshot({ path: "docs/qa/ask-cadence-375.png", fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: "docs/qa/ask-cadence-desktop.png", fullPage: true });
    if (calls !== 5) throw new Error(`Expected five user-triggered asks, received ${calls}`);
    return { passed: ["disabled hidden", "label and limit", "keyboard submit", "exact source numbers", "unsupported", "provider error", "429 error", "375px overflow"], calls, provider: "mocked", numbers: "local database aging aggregates" };
  } finally {
    await page.unroute("**/api/assistant/status/");
    await page.unroute("**/api/assistant/ask/?*");
  }
}
