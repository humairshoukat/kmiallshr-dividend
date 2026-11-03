import { expect, test } from "@playwright/test";

for (const path of ["/", "/price-hikes"]) {
  test(`comma-separated search matches any symbol or company on ${path}`, async ({ page }) => {
    await page.goto(path);
    const search = page.getByRole("searchbox", { name: "Search symbol or company" });
    const symbols = page.locator("tbody .stock-heading > a:first-child");
    const originalCount = await symbols.count();
    await search.fill("FFC");
    await expect(symbols).toHaveText(["FFC"]);

    await search.fill(" fFc, , eFeRt, MARI, FFC, ");
    await expect(symbols).toHaveCount(3);
    expect((await symbols.allTextContents()).map((s) => s.trim()).sort()).toEqual(["EFERT", "FFC", "MARI"]);

    await search.fill("Engro Fertilizers, MARI");
    await expect(symbols).toHaveCount(2);
    expect((await symbols.allTextContents()).map((s) => s.trim()).sort()).toEqual(["EFERT", "MARI"]);

    await search.fill("no-such-stock, FFC");
    await expect(symbols).toHaveText(["FFC"]);
    await search.fill("efer");
    await expect(symbols).toHaveText(["EFERT"]);
    await search.fill(", , ");
    await expect(symbols).toHaveCount(originalCount);
    await search.fill("no-such-stock, another-missing-stock");
    await expect(symbols).toHaveCount(0);
    await expect(page.locator(".empty-state")).toBeVisible();
    await page.getByRole("button", { name: "Clear search", exact: true }).first().click();
    await expect(search).toHaveValue("");
    await expect(symbols).toHaveCount(originalCount);
  });
}

test("dividend totals include every stock in a comma-separated search", async ({ page }) => {
  await page.goto("/");
  await page.locator(".assumptions-panel summary").click();
  await page.getByRole("radio", { name: "Shares per stock", exact: true }).check();
  await page.getByRole("searchbox", { name: "Search symbol or company" }).fill("FFC, EFERT, MARI");
  await expect(page.locator(".cash-total")).toHaveText(/(?:Rs|PKR)\s*76,713$/);
  await page.getByRole("button", { name: "2025 Full year" }).click();
  await expect(page.locator(".cash-total")).toHaveText(/(?:Rs|PKR)\s*76,670$/);
});
