import { expect, type Page } from "@playwright/test";

export async function editDocument(page: Page, title = "Bookstore event proposal") {
  const editor = page.getByLabel(`${title} text`, { exact: true });
  if (!(await editor.isVisible())) {
    await page
      .getByRole("button", { name: `Edit text of ${title}`, exact: true })
      .click();
  }
  await expect(editor).toBeVisible();
  return editor;
}
