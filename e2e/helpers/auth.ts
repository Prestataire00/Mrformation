import { Page } from "@playwright/test";

async function loginWithCredentials(page: Page, email: string, password: string, expectedPath: RegExp) {
  await page.goto("/login");
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');

  // May redirect to /select-entity first
  await page.waitForURL(/\/(admin|select-entity|trainer|client|learner)/, { timeout: 15000 });

  // If on select-entity, pick the first entity (MR FORMATION)
  if (page.url().includes("select-entity")) {
    await page.waitForLoadState("networkidle");
    const entityCard = page.locator("[data-entity]").or(page.locator(".cursor-pointer")).first();
    if (await entityCard.isVisible({ timeout: 5000 })) {
      await entityCard.click();
    } else {
      const firstCard = page.locator("button, [role='button'], .rounded-xl").filter({ hasText: "MR" }).first();
      if (await firstCard.isVisible({ timeout: 3000 })) {
        await firstCard.click();
      }
    }
    await page.waitForURL(expectedPath, { timeout: 15000 });
  }

  // Handle select-role if needed
  if (page.url().includes("select-role")) {
    await page.waitForLoadState("networkidle");
    const roleCard = page.locator("button, [role='button'], .cursor-pointer").first();
    if (await roleCard.isVisible({ timeout: 3000 })) {
      await roleCard.click();
    }
    await page.waitForURL(expectedPath, { timeout: 15000 });
  }
}

export async function loginAsAdmin(page: Page) {
  await loginWithCredentials(
    page,
    process.env.TEST_ADMIN_EMAIL || "admin@mrformation.fr",
    process.env.TEST_ADMIN_PASSWORD || "password",
    /\/admin/
  );
}

export async function loginAsCommercial(page: Page) {
  await loginWithCredentials(
    page,
    process.env.TEST_COMMERCIAL_EMAIL || "commercial@mrformation.fr",
    process.env.TEST_COMMERCIAL_PASSWORD || "password",
    /\/(admin|crm)/
  );
}

export async function loginAsTrainer(page: Page) {
  await loginWithCredentials(
    page,
    process.env.TEST_TRAINER_EMAIL || "formateur@mrformation.fr",
    process.env.TEST_TRAINER_PASSWORD || "password",
    /\/(trainer|admin)/
  );
}

export async function loginAsClient(page: Page) {
  await loginWithCredentials(
    page,
    process.env.TEST_CLIENT_EMAIL || "client@mrformation.fr",
    process.env.TEST_CLIENT_PASSWORD || "password",
    /\/(client|admin)/
  );
}

export async function loginAsLearner(page: Page) {
  await loginWithCredentials(
    page,
    process.env.TEST_LEARNER_EMAIL || "apprenant@mrformation.fr",
    process.env.TEST_LEARNER_PASSWORD || "password",
    /\/(learner|admin)/
  );
}
