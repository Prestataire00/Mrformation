import { Page } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || "admin@mrformation.fr");
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || "password");
  await page.click('button[type="submit"]');

  // May redirect to /select-entity first
  await page.waitForURL(/\/(admin|select-entity)/, { timeout: 15000 });

  // If on select-entity, pick the first entity
  if (page.url().includes("select-entity")) {
    await page.waitForLoadState("networkidle");
    const entityCard = page.locator("[data-entity]").or(page.locator(".cursor-pointer")).first();
    if (await entityCard.isVisible({ timeout: 5000 })) {
      await entityCard.click();
    } else {
      // Fallback: click the first clickable card/button
      const firstCard = page.locator("button, [role='button'], .rounded-xl").filter({ hasText: "MR" }).first();
      if (await firstCard.isVisible({ timeout: 3000 })) {
        await firstCard.click();
      }
    }
    await page.waitForURL("**/admin**", { timeout: 15000 });
  }
}
