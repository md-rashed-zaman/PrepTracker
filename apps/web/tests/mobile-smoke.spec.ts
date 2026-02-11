import { test, expect } from "@playwright/test";
import { uniqEmail, expectNoClientError } from "./_helpers";

test.use({ viewport: { width: 390, height: 844 } });

test("mobile: bottom nav works and pages render", async ({ page }) => {
  const email = uniqEmail("m");
  const password = "pass123";

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/today$/);

  // Bottom tabs should exist.
  await expect(page.getByTestId("mobile-tabs")).toBeVisible();

  await page.getByTestId("mobile-tab-lists").click();
  await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();

  await page.getByTestId("mobile-tab-stats").click();
  await expect(page.getByRole("heading", { name: "Progress signals" })).toBeVisible();

  await page.getByTestId("mobile-tab-library").click();
  await expect(page.getByRole("heading", { name: "Problems" })).toBeVisible();

  await expectNoClientError(page);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toHaveLength(0);
});
