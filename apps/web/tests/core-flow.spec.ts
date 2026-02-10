import { test, expect } from "@playwright/test";
import { uniqEmail, expectNoClientError } from "./_helpers";

test("core flow: add problem -> due -> review -> ICS", async ({ page, request }) => {
  const email = uniqEmail("core");
  const password = "pass123";

  const pageErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(String(e)));

  // Register
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/today$/);

  // Add a problem
  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Problems" })).toBeVisible();
  await page.getByRole("button", { name: "Add problem" }).click();
  await page.getByLabel("URL").fill("https://leetcode.com/problems/two-sum/");
  await page.getByLabel("Title").fill("Two Sum");
  await page.getByLabel("Platform").fill("LeetCode");
  await page.getByLabel("Difficulty").fill("Easy");
  await page.getByLabel("Topics").fill("arrays, hashmap");
  await page.getByRole("button", { name: "Save" }).click();

  await expect(page.getByRole("link", { name: "Two Sum" })).toBeVisible();
  await expectNoClientError(page);

  // Review it (Today page should show it due immediately)
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Due reviews" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Two Sum" })).toBeVisible();
  await page.getByRole("button", { name: "3" }).first().click();
  await page.getByRole("button", { name: "Confirm" }).first().click();

  // Settings: generate ICS URL and fetch it
  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "Schedule controls" })).toBeVisible();
  await page.getByRole("button", { name: "Generate link" }).click();

  const input = page.locator("input[readonly]").first();
  await expect(input).toBeVisible();
  const url = await input.inputValue();
  expect(url).toContain("/ics?token=");

  const resp = await request.get(url);
  expect(resp.status()).toBe(200);
  expect(resp.headers()["content-type"]).toContain("text/calendar");
  const ics = await resp.text();
  expect(ics).toContain("BEGIN:VCALENDAR");
  expect(ics).toContain("SUMMARY:");
  expectNoClientError(page);
  expect(pageErrors, `page errors: ${pageErrors.join("\n")}`).toHaveLength(0);
});
