import { test, expect } from "@playwright/test";
import { uniqEmail, expectNoClientError } from "./_helpers";

test("custom list: create -> add library problem -> add to list (no 500)", async ({ page }) => {
  const email = uniqEmail("cl");
  const password = "pass123";

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Register
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/today$/);

  // Add a problem to Library
  await page.goto("/library");
  await page.getByRole("button", { name: "Add problem" }).click();
  await page.getByLabel("URL").fill("https://leetcode.com/problems/valid-parentheses/");
  await page.getByLabel("Title").fill("Valid Parentheses");
  await page.getByLabel("Platform").fill("LeetCode");
  await page.getByLabel("Difficulty").fill("Easy");
  await page.getByLabel("Topics").fill("stack");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("link", { name: "Valid Parentheses" })).toBeVisible();

  // Create list and add item
  await page.goto("/lists");
  await page.getByRole("button", { name: "New list" }).click();
  await page.getByPlaceholder("List name").fill("My list");
  await page.getByRole("button", { name: "Create" }).click();
  await expect(page.getByRole("button", { name: "My list" })).toBeVisible();
  await page.getByRole("button", { name: "My list" }).click();
  await expect(page.getByRole("heading", { name: "My list" })).toBeVisible();

  await page.getByRole("button", { name: "Add problem" }).click();

  // Intercept the add-item request to assert it is not 5xx.
  const [addResp] = await Promise.all([
    page.waitForResponse((r) => r.url().includes("/api/lists/") && r.url().includes("/items") && r.request().method() === "POST"),
    page.getByRole("button", { name: "Valid Parentheses" }).click(),
  ]);
  expect(addResp.status(), `add-item status: ${addResp.status()} url=${addResp.url()}`).toBeLessThan(500);

  // Should show in list details.
  await expect(page.getByRole("link", { name: "Valid Parentheses" })).toBeVisible();
  await expectNoClientError(page);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toHaveLength(0);
});

