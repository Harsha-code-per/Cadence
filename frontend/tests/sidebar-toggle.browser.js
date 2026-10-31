// Playwright page function; begin already logged in as admin/staff on the local app.
async (page) => {
  const base = new URL(page.url()).origin;
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${base}/dashboard`);
  await page.waitForLoadState("networkidle");
  await page.evaluate(() => localStorage.setItem("cadence.sidebar.collapsed", "0"));
  await page.reload();
  const collapse = page.getByRole("button", { name: "Collapse sidebar", exact: true });
  await collapse.waitFor();
  await page.mouse.move(900, 600);
  const home = page.getByRole("link", { name: "Cadence home", exact: true });
  const mark = home.locator("[data-sidebar-mark]");
  const icon = collapse.locator("[data-sidebar-action]");
  if (await mark.evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Default logo hidden");
  const box = await collapse.boundingBox();
  const homeBox = await home.boundingBox();
  if (!box || box.y > 80 || box.width < 44 || box.height < 44) throw new Error("Top toggle target too small/misplaced");
  if (!homeBox || box.x < homeBox.x + homeBox.width) throw new Error("Collapse control is not to the right of Cadence");
  if (await icon.evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Expanded collapse action depends on hover");
  const labelContrast = await page.evaluate(() => {
    const luminance = (rgb) => rgb.match(/[\d.]+/g).slice(0, 3).map(Number).map((v) => {
      const channel = v / 255;
      return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
    const text = luminance(getComputedStyle(document.querySelector("aside nav p")).color);
    const background = luminance(getComputedStyle(document.querySelector("aside > div > div")).backgroundColor);
    return (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05);
  });
  if (labelContrast < 4.5) throw new Error("Section labels fail AA text contrast");
  await collapse.hover();
  if (await icon.evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Hover action missing");
  if (await mark.evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Expanded home logo disappeared");
  await page.screenshot({ path: "docs/qa/sidebar-expanded-hover.png" });
  await collapse.click();
  const expand = page.getByRole("button", { name: "Expand sidebar", exact: true });
  await expand.waitFor();
  await page.waitForFunction(() => Math.round(document.querySelector("aside").getBoundingClientRect().width) === 72);
  if (await expand.getAttribute("aria-expanded") !== "false") throw new Error("Collapsed state not exposed");
  const controls = await expand.getAttribute("aria-controls");
  if (!await page.locator(`#${controls}`).count()) throw new Error("Missing controlled navigation");
  if (await page.getByRole("button", { name: /^(Expand|Collapse) sidebar$/ }).count() !== 1) throw new Error("Duplicate toggle");
  await page.mouse.move(900, 600);
  if (await expand.locator("[data-sidebar-mark]").evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Collapsed logo is not the default");
  await page.screenshot({ path: "docs/qa/sidebar-collapsed.png" });
  await expand.hover();
  if (await expand.locator("[data-sidebar-action]").evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Collapsed hover action hidden");
  if (await expand.locator("[data-sidebar-mark]").evaluate((el) => getComputedStyle(el).opacity) !== "0") throw new Error("Collapsed logo did not swap");
  await page.screenshot({ path: "docs/qa/sidebar-collapsed-hover.png" });
  await page.getByRole("link", { name: "Insights", exact: true }).click();
  await page.getByRole("heading", { name: "Risk & Retention Insights" }).waitFor();
  if (await expand.getAttribute("aria-expanded") !== "false") throw new Error("Route lost collapse state");
  await page.reload();
  await expand.waitFor();
  if (await page.evaluate(() => localStorage.getItem("cadence.sidebar.collapsed")) !== "1") throw new Error("Reload persistence failed");
  await expand.focus();
  if (await expand.locator("[data-sidebar-action]").evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Keyboard action hidden");
  await expand.press("Enter");
  await collapse.waitFor();
  await collapse.press("Space");
  await expand.waitFor();
  await expand.press("Enter");
  await collapse.waitFor();
  await page.waitForFunction(() => Math.round(document.querySelector("aside").getBoundingClientRect().width) === 248);

  // Separate browser contexts keep touch/storage edge cases away from the user's session.
  const state = await page.context().storageState();
  const browser = page.context().browser();
  const touch = await browser.newContext({ storageState: state, viewport: { width: 1024, height: 900 }, hasTouch: true });
  const blocked = await browser.newContext({ storageState: state, viewport: { width: 1440, height: 900 } });
  try {
    const tablet = await touch.newPage();
    await tablet.goto(`${base}/dashboard`);
    const touchToggle = tablet.getByRole("button", { name: "Collapse sidebar", exact: true });
    await touchToggle.waitFor();
    if (!(await tablet.evaluate(() => matchMedia("(hover: none)").matches))) throw new Error("Touch emulation missing");
    if (await touchToggle.locator("[data-sidebar-action]").evaluate((el) => getComputedStyle(el).opacity) !== "1") throw new Error("Touch action depends on hover");
    const touchLink = await tablet.getByRole("link", { name: "Overview", exact: true }).boundingBox();
    if (!touchLink || touchLink.height < 44) throw new Error("Touch navigation target too small");
    await touchToggle.tap();
    await tablet.getByRole("button", { name: "Expand sidebar", exact: true }).waitFor();

    await blocked.addInitScript(() => {
      Storage.prototype.setItem = () => { throw new DOMException("Storage unavailable", "QuotaExceededError"); };
    });
    const privatePage = await blocked.newPage();
    await privatePage.goto(`${base}/dashboard`);
    await privatePage.getByRole("button", { name: "Collapse sidebar", exact: true }).click();
    await privatePage.getByRole("button", { name: "Expand sidebar", exact: true }).click();
    await privatePage.getByRole("button", { name: "Collapse sidebar", exact: true }).waitFor();
  } finally {
    await touch.close();
    await blocked.close();
  }

  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("button", { name: "Open menu", exact: true }).click();
  const sheet = page.getByRole("dialog");
  await sheet.waitFor();
  if (await sheet.getByRole("button", { name: /^(Expand|Collapse) sidebar$/ }).count()) throw new Error("Mobile sheet has desktop toggle");
  await sheet.getByRole("link", { name: "Cadence home", exact: true }).waitFor();
  await page.screenshot({ path: "docs/qa/sidebar-mobile-sheet.png" });
  await sheet.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("heading", { name: "Products", exact: true }).waitFor();
  await sheet.waitFor({ state: "hidden" });
  const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobile.scrollWidth > mobile.width) throw new Error("Mobile overflow");
  await page.setViewportSize({ width: 1440, height: 900 });
  const report = { topToggle: box, labelContrast, passed: ["expanded logo and always-visible right toggle", "collapsed logo default and hover swap", "mouse toggle", "ARIA state", "route/reload persistence", "Enter and Space", "touch without hover", "44px touch navigation", "blocked storage", "mobile sheet navigation"], mobile };
  await page.evaluate((value) => { window.__cadenceSidebarReport = value; }, report);
  return report;
}
