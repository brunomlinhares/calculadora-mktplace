const { test, expect } = require("@playwright/test");

test.beforeEach(async ({ page }) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  page.errors = errors;
  await page.goto("/");
  await page.evaluate(() => localStorage.clear());
  await page.reload();
});

test.afterEach(async ({ page }) => {
  expect(page.errors, "página não pode ter erro de JS").toEqual([]);
});

test("aba Quanto sobra calcula lucro com valores padrão", async ({ page }) => {
  await expect(page.locator("#tabForward")).toHaveClass(/active/);
  await expect(page.locator("#profitValue")).toHaveText("R$ 6,74");
  await expect(page.locator("#marginValue")).toHaveText("19,3%");
  await expect(page.locator("#targetMargin")).toBeHidden();
  await expect(page.locator("#price")).toBeVisible();
});

test("trocar pra Shopee recalcula e esconde frete", async ({ page }) => {
  await page.click("#btnShopee");
  await expect(page.locator("#breakdown")).not.toContainText("Frete");
  await expect(page.locator("#tierNote")).toContainText("20%");
});

test("aviso de margem baixa aparece só na aba Quanto sobra", async ({ page }) => {
  await page.fill("#price", "20");
  await expect(page.locator("#warning")).toBeVisible();
  await page.click("#tabReverse");
  await expect(page.locator("#warning")).toBeHidden();
});

test("aba Quanto cobrar sugere preço e mostra tabela de margens", async ({ page }) => {
  await page.click("#tabReverse");
  await expect(page.locator("#price")).toBeHidden();
  await expect(page.locator("#targetMargin")).toBeVisible();
  await expect(page.locator("#suggestedPrice")).toHaveText("R$ 48,22");
  await expect(page.locator("#marginValue")).toHaveText("30%");
  const rows = page.locator("#marginRows tr");
  await expect(rows).toHaveCount(6);
  await expect(page.locator("#marginRows tr.current td").first()).toHaveText("30%");
  await expect(rows.nth(5)).toContainText("inviável");
});

test("margem inviável mostra aviso e esconde detalhamento", async ({ page }) => {
  await page.click("#tabReverse");
  await page.fill("#targetMargin", "80");
  await expect(page.locator("#suggestedPrice")).toHaveText("Inviável");
  await expect(page.locator("#breakdownTable")).toBeHidden();
  await expect(page.locator("#finalBlock")).toBeHidden();
});

test("desligar afiliado baixa o preço sugerido", async ({ page }) => {
  await page.click("#tabReverse");
  await page.uncheck("#useAffiliate");
  await expect(page.locator("#affiliatePct")).toBeDisabled();
  await expect(page.locator("#suggestedPrice")).not.toHaveText("R$ 48,22");
});

test("inputs e aba ficam salvos após recarregar", async ({ page }) => {
  await page.click("#tabReverse");
  await page.click("#btnShopee");
  await page.fill("#cost", "15");
  await page.fill("#targetMargin", "40");
  await page.reload();
  await expect(page.locator("#tabReverse")).toHaveClass(/active/);
  await expect(page.locator("#btnShopee")).toHaveClass(/active/);
  await expect(page.locator("#cost")).toHaveValue("15");
  await expect(page.locator("#targetMargin")).toHaveValue("40");
});

test("localStorage corrompido não quebra a página", async ({ page }) => {
  await page.evaluate(() => localStorage.setItem("calc-mktplace:v1", "{lixo"));
  await page.reload();
  await expect(page.locator("#profitValue")).toHaveText("R$ 6,74");
});

test("sem scroll horizontal", async ({ page }) => {
  await page.click("#tabReverse");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
