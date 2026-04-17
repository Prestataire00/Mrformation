import { test, expect } from "@playwright/test";
import { loginAsAdmin } from "./helpers/auth";

test.describe("Sidebar navigation", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  const visibleLinks = [
    { label: "Dashboard", path: "/admin" },
    { label: "Pipeline", path: "/admin/crm" },
    { label: "Prospects", path: "/admin/crm/prospects" },
    { label: "Devis", path: "/admin/crm/quotes" },
    { label: "Tâches", path: "/admin/crm/tasks" },
    { label: "Clients", path: "/admin/clients" },
    { label: "Formations", path: "/admin/trainings" },
    { label: "Programmes", path: "/admin/programs" },
    { label: "Documents", path: "/admin/documents" },
    { label: "Emails", path: "/admin/emails" },
    { label: "Signatures", path: "/admin/signatures" },
  ];

  for (const link of visibleLinks) {
    test(`lien "${link.label}" est visible et navigable`, async ({ page }) => {
      const sidebarLink = page.getByRole("link", { name: link.label }).first();
      await expect(sidebarLink).toBeVisible({ timeout: 5000 });
      await sidebarLink.click();
      await page.waitForLoadState("domcontentloaded");
      // Verify no 500 error
      const body = await page.textContent("body");
      expect(body).not.toContain("Internal Server Error");
      expect(body).not.toContain("500");
    });
  }

  const hiddenLabels = ["Lieux", "Certificateurs", "Suivi OPCO", "Affacturage"];

  for (const label of hiddenLabels) {
    test(`"${label}" n'est PAS visible dans le sidebar (masque V1)`, async ({ page }) => {
      // Ensure sidebar is loaded
      await expect(page.getByRole("link", { name: "Dashboard" }).first()).toBeVisible({ timeout: 5000 });
      const link = page.getByRole("link", { name: label });
      await expect(link).toHaveCount(0);
    });
  }
});
