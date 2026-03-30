import { Page } from "@playwright/test";

export async function loginAsAdmin(page: Page) {
  await page.goto("/login");
  await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || "admin@mrformation.fr");
  await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || "password");
  await page.click('button[type="submit"]');
  await page.waitForURL("**/admin**", { timeout: 15000 });
}
