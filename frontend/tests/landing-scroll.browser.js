// Playwright page function. Wheel events are simulated, not physical mouse/trackpad validation.
async (page) => {
  const base = new URL(page.url()).origin;
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  await page.locator(".pin-spacer").first().waitFor();
  const layout = await page.evaluate(() => ({
    height: document.documentElement.scrollHeight,
    holds: [...document.querySelectorAll(".pin-spacer")].map((el) => ({
      chapter: el.querySelector("[data-chapter]")?.getAttribute("data-chapter"),
      distance: parseFloat(getComputedStyle(el).paddingBottom),
    })),
    customScroll: document.documentElement.classList.contains("lenis"),
  }));
  if (layout.height > 11000 || layout.customScroll) throw new Error("Scroll shortening/native input regression");
  if (layout.holds.reduce((sum, hold) => sum + hold.distance, 0) !== 2729) throw new Error("Unexpected pin distances");

  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.mouse.move(1100, 450);
  await page.mouse.wheel(0, 120);
  await page.waitForFunction(() => scrollY > 0);
  const coarse = await page.evaluate(() => scrollY);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  for (let i = 0; i < 4; i += 1) await page.mouse.wheel(0, 30);
  await page.waitForFunction((distance) => scrollY >= distance * 0.9, coarse);
  const fine = await page.evaluate(() => scrollY);

  async function endChapter(chapter) {
    const target = await page.evaluate((value) => {
      const section = document.querySelector(`[data-chapter="${value}"]`);
      const spacer = section.parentElement;
      const y = spacer.getBoundingClientRect().top + scrollY + parseFloat(getComputedStyle(spacer).paddingBottom) + 2;
      window.scrollTo(0, y);
      return y;
    }, chapter);
    await page.waitForFunction((y) => Math.abs(scrollY - y) < 2, target);
    await page.waitForTimeout(500);
  }
  await endChapter("1");
  await page.waitForFunction(() => [...document.querySelectorAll("[data-lit]")].every((word) => Number(getComputedStyle(word).opacity) > 0.99));
  const lit = await page.locator("[data-lit]").evaluateAll((words) => words.every((word) => Number(getComputedStyle(word).opacity) > 0.99));
  if (!lit) throw new Error("Statement did not complete");
  await endChapter("2");
  await page.waitForFunction(() => document.querySelector("#month ol li:last-child").getBoundingClientRect().right <= innerWidth + 3);
  await endChapter("3");
  await page.waitForFunction(() => Number(getComputedStyle(document.querySelector('[data-step]:last-child')).opacity) > 0.99);
  const billing = page.locator('[data-chapter="3"]');
  if (await billing.locator('[data-step]').last().evaluate((el) => Number(getComputedStyle(el).opacity)) < 0.99) throw new Error("Final billing step inaccessible");
  await page.screenshot({ path: "docs/qa/landing-shorter-scroll.png" });
  await page.keyboard.press("End");
  await page.waitForTimeout(400);
  if (!(await page.getByRole("link", { name: "Open the live demo" }).last().isVisible())) throw new Error("Closing CTA unavailable");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  if (await page.locator(".pin-spacer").count()) throw new Error("Reduced motion still pins");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto(base);
  await page.waitForLoadState("networkidle");
  const mobile = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth }));
  if (mobile.scrollWidth > mobile.width) throw new Error("Mobile page overflows horizontally");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  return { layout, coarse, fine, completed: ["statement", "month", "billing", "closing CTA"], reducedMotionPins: 0, mobile };
}
