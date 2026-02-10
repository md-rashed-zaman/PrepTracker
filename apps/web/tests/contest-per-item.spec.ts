import { test, expect } from "@playwright/test";
import { uniqEmail, expectNoClientError } from "./_helpers";

test("contest: confirm results per item locks row", async ({ page }) => {
  const email = uniqEmail("cpi");
  const password = "pass123";

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Register
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/today$/);

  // Import a template list to ensure enough problems.
  await page.goto("/lists");
  await page.getByRole("button", { name: "Import Blind 75" }).click();

  // Generate contest
  await page.goto("/contests");
  await page.getByRole("button", { name: "Generate" }).click();
  await expect(page.getByText("Contest generated.")).toBeVisible();

  await page.getByRole("button", { name: "Start" }).click();

  // Confirm first row
  await page.getByRole("button", { name: "Confirm" }).first().click();
  await expect(page.getByText("Recorded.")).toBeVisible();

  // Row should lock as Recorded
  await expect(page.getByText("Recorded").first()).toBeVisible();

  await expectNoClientError(page);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toHaveLength(0);
});
