import { expect, test } from "@playwright/test";
import stocks from "../data/stocks.json";

test("switches between cash and shares and remembers both holding amounts", async ({ page }) => {
  const ffcStock = stocks.find((stock) => stock.symbol === "FFC");
  if (!ffcStock) throw new Error("The snapshot must include FFC for this test.");
  const cashForThousandShares = (ffcStock.latestPrice * 1000).toFixed(2);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.locator(".assumptions-panel summary").click();
  const ffc = page.getByRole("row").filter({
    has: page.getByRole("link", { name: "FFC", exact: true }),
  });
  const gross = ffc.getByRole("cell").nth(5);
  const net = ffc.getByRole("cell").nth(6);
  await expect(page.getByRole("radio", { name: "Cash per stock", exact: true })).toBeChecked();
  await page.getByLabel("Investment per stock (Rs)", { exact: true }).fill(cashForThousandShares);
  await expect(gross).toContainText("50,000");
  await expect(net).toContainText("42,500");

  await page.getByRole("radio", { name: "Shares per stock", exact: true }).check();
  await expect(page.getByLabel("Shares per stock", { exact: true }).last()).toHaveValue("1000");
  await expect(gross).toContainText("50,000");
  await expect(net).toContainText("42,500");
  await expect(page.locator(".cash-total + .stat-detail")).toHaveText("1,000 shares per displayed stock");
  const efert = page.getByRole("row").filter({
    has: page.getByRole("link", { name: "EFERT", exact: true }),
  });
  await expect(efert.getByRole("cell").nth(5)).toContainText("13,250");
  await page.getByLabel("Withholding tax (%)").fill("20");
  await page.getByLabel("Zakat (%)").fill("2.5");
  await expect(net).toContainText("38,750");
  await page.getByLabel("Search symbol or company").fill("FFC");
  const netAmounts = await page.locator("tbody .net-cash").allTextContents();
  const total = netAmounts.reduce((sum, value) => sum + Number(value.replace(/[^\d.-]/g, "")), 0);
  await expect(page.locator(".cash-total")).toContainText(new Intl.NumberFormat("en-PK").format(total));

  await page.getByRole("button", { name: "2025 Full year" }).click();
  await expect(gross).toContainText("49,500");
  await page.getByRole("button", { name: "2026 YTD" }).click();
  const shares = page.getByRole("spinbutton", { name: "Shares per stock", exact: true });
  await shares.fill("2000");
  await expect(gross).toContainText("100,000");
  await page.getByRole("radio", { name: "Cash per stock", exact: true }).check();
  await expect(page.getByLabel("Investment per stock (Rs)", { exact: true })).toHaveValue(cashForThousandShares);
  await expect(gross).toContainText("50,000");
  await page.getByRole("radio", { name: "Shares per stock", exact: true }).check();
  await expect(shares).toHaveValue("2000");
  for (const value of ["", "0", "-100"]) {
    await shares.fill(value);
    await expect(gross).toHaveText(/(?:Rs|PKR)\s*0$/);
    await expect(net).toHaveText(/(?:Rs|PKR)\s*0$/);
  }
  await shares.fill("1000");
  await page.getByLabel("Withholding tax (%)").fill("150");
  await expect(net).toHaveText(/(?:Rs|PKR)\s*0$/);
  expect(errors).toEqual([]);
});

test("holding controls fit desktop and mobile and support keyboard selection", async ({ page }) => {
  await page.goto("/");
  await page.locator(".assumptions-panel summary").click();
  const cash = page.getByRole("radio", { name: "Cash per stock", exact: true });
  await cash.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("radio", { name: "Shares per stock", exact: true })).toBeChecked();
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    const panel = await page.locator(".assumptions-panel").boundingBox();
    expect(panel).not.toBeNull();
    for (const control of await page.locator(".assumptions-content input").all()) {
      const box = await control.boundingBox();
      expect(box).not.toBeNull();
      if (box && panel) {
        expect(box.x).toBeGreaterThanOrEqual(panel.x);
        expect(box.x + box.width).toBeLessThanOrEqual(panel.x + panel.width);
      }
    }
  }
});
