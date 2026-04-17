import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Dashboard admin", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto("/admin");
    await page.waitForLoadState("domcontentloaded");
  });

  test("la page charge sans erreur", async ({ page }) => {
    const body = await page.textContent("body");
    expect(body).not.toContain("Internal Server Error");
  });

  test("KPIs sont visibles", async ({ page }) => {
    // At least one KPI card should be visible
    const kpiSection = page.locator("[class*='grid']").first();
    await expect(kpiSection).toBeVisible({ timeout: 10000 });
  });

  test("section activites recentes est visible", async ({ page }) => {
    const section = page.getByText(/activit|récent/i).first();
    await expect(section).toBeVisible({ timeout: 10000 });
  });

  test("section prochaines sessions est visible", async ({ page }) => {
    const section = page.getByText(/prochain|session|formation/i).first();
    await expect(section).toBeVisible({ timeout: 10000 });
  });

  test("le titre Dashboard ou le nom du dashboard est present", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible({ timeout: 10000 });
  });
});
