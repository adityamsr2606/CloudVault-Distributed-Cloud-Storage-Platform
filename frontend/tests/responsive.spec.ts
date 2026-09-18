import { expect, test } from "@playwright/test";

const viewports = [
  { name: "small-phone", width: 320, height: 568 },
  { name: "android-phone", width: 360, height: 800 },
  { name: "iphone-class", width: 390, height: 844 },
  { name: "large-phone", width: 430, height: 932 },
  { name: "small-tablet", width: 768, height: 1024 },
  { name: "tablet", width: 820, height: 1180 },
  { name: "desktop", width: 1024, height: 768 },
] as const;

async function expectNoHorizontalOverflow(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => ({
    viewport: window.innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
  }));

  expect(metrics.documentWidth).toBeLessThanOrEqual(metrics.viewport + 1);
  expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport + 1);
}

for (const viewport of viewports) {
  test.describe(viewport.name, () => {
    test.use({
      viewport: { width: viewport.width, height: viewport.height },
      hasTouch: viewport.width <= 820,
      isMobile: viewport.width <= 430,
    });

    test("public routes stay inside the viewport", async ({ page }) => {
      await page.goto("/");
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      await page.goto("/auth");
      await expect(page.getByRole("heading", { name: /welcome back/i })).toBeVisible();
      await expectNoHorizontalOverflow(page);

      const email = page.getByLabel("Email");
      const password = page.getByLabel("Password");
      await expect(email).toBeVisible();
      await expect(password).toBeVisible();

      if (viewport.width <= 520) {
        const emailSize = await email.evaluate(
          (element) => Number.parseFloat(getComputedStyle(element).fontSize),
        );
        expect(emailSize).toBeGreaterThanOrEqual(16);
      }
    });

    test("application shell controls stay reachable without hover", async ({ page }) => {
      await page.goto("/");

      await page.evaluate(() => {
        document.body.innerHTML = `
          <div class="app-frame">
            <aside class="side-rail">
              <nav class="side-nav" aria-label="Primary">
                ${Array.from({ length: 8 }, (_, index) => `
                  <a class="nav-item${index === 1 ? " active" : ""}" href="#">
                    <svg aria-hidden="true"></svg><span>Item ${index + 1}</span>
                  </a>
                `).join("")}
              </nav>
            </aside>
            <section class="workspace">
              <header class="workspace-bar">
                <button class="command-trigger"><span>Search your vault</span><kbd>⌘K</kbd></button>
                <div class="workspace-actions">
                  <div class="theme-switcher compact"><button>Theme</button></div>
                  <button class="icon-button mobile-signout" aria-label="Sign out">Out</button>
                </div>
              </header>
              <main class="content-stage">
                <div class="page-wrap">
                  <div class="folder-strip">
                    <div class="folder-chip-shell">
                      <button class="folder-chip"><span>Long folder name that must stay usable</span></button>
                      <button class="folder-trash-button"><span>Trash</span></button>
                    </div>
                  </div>
                  <section class="table-card">
                    <div class="file-row">
                      <div class="file-glyph">F</div>
                      <div class="file-main">
                        <strong>very-long-file-name-that-should-not-break-layout.pdf</strong>
                        <span>application/pdf · 1.4 GB</span>
                      </div>
                      <span class="status-pill ready">ready</span>
                      <div class="hover-actions">
                        <button aria-label="Download">D</button>
                        <button aria-label="Share">S</button>
                        <button aria-label="Delete">X</button>
                      </div>
                    </div>
                  </section>
                </div>
              </main>
            </section>
          </div>
        `;
      });

      await expectNoHorizontalOverflow(page);

      const items = page.locator(".side-nav .nav-item");
      await expect(items).toHaveCount(8);

      if (viewport.width <= 820) {
        for (let index = 0; index < 8; index += 1) {
          await expect(items.nth(index)).toBeVisible();
        }

        const firstNavBox = await items.first().boundingBox();
        expect(firstNavBox?.height ?? 0).toBeGreaterThanOrEqual(44);

        await expect(page.locator(".mobile-signout")).toBeVisible();
        await expect(page.locator(".folder-trash-button")).toBeVisible();

        const trashBox = await page.locator(".folder-trash-button").boundingBox();
        expect(trashBox?.height ?? 0).toBeGreaterThanOrEqual(44);

        const actions = page.locator(".hover-actions");
        await expect(actions).toBeVisible();
        const opacity = await actions.evaluate((element) => getComputedStyle(element).opacity);
        expect(opacity).toBe("1");
      } else {
        await expect(page.locator(".mobile-signout")).toBeHidden();
      }
    });
  });
}
