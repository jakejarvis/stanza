import { expect, test } from "@playwright/test";

test("home page renders the welcome heading", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Welcome to Stanza");
});
