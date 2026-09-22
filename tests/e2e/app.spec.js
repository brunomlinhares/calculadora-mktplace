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

test.describe("layout de PC", () => {
  test.skip(({ viewport }) => viewport.width < 900, "só em telas >= 900px");

  test("inputs à esquerda e resultado à direita", async ({ page }) => {
    await page.click("#tabReverse");
    const inputs = await page.locator(".panel-inputs").boundingBox();
    const results = await page.locator(".panel-results").boundingBox();
    expect(results.x).toBeGreaterThan(inputs.x + inputs.width);
    expect(Math.abs(results.y - inputs.y)).toBeLessThan(40);
  });

  test("preço, lucro e margem ficam na mesma linha no topo", async ({ page }) => {
    await page.click("#tabReverse");
    const hero = await page.locator(".hero").boundingBox();
    const final = await page.locator("#finalBlock").boundingBox();
    expect(final.x).toBeGreaterThan(hero.x + 100);
    expect(Math.abs(final.y - hero.y)).toBeLessThan(20);
  });

  test("tabela de margens inteira visível sem rolar", async ({ page }) => {
    await page.click("#tabReverse");
    const lastRow = await page.locator("#marginRows tr").last().boundingBox();
    const vh = page.viewportSize().height;
    expect(lastRow.y + lastRow.height).toBeLessThanOrEqual(vh);
  });

  test("coluna de inputs fica fixa ao rolar", async ({ page }) => {
    await page.setViewportSize({ width: page.viewportSize().width, height: 450 });
    await page.click("#tabReverse");
    await page.evaluate(() => window.scrollTo(0, 150));
    await page.waitForFunction(() => window.scrollY === 150);
    // Sticky com top: 24px -> o topo da coluna para em ~24px em vez de sumir pra cima.
    const panel = await page.locator(".panel-inputs").boundingBox();
    expect(panel.y).toBeGreaterThanOrEqual(23);
  });
});

test("mobile continua em coluna única", async ({ page }) => {
  test.skip(page.viewportSize().width >= 900, "só em telas < 900px");
  await page.click("#tabReverse");
  const inputs = await page.locator(".panel-inputs").boundingBox();
  const results = await page.locator(".panel-results").boundingBox();
  expect(results.y).toBeGreaterThan(inputs.y + inputs.height - 1);
});

test.describe("gráfico de composição do preço", () => {
  const sliceCount = (page) => page.evaluate(() => Chart.getChart("donutChart").data.datasets[0].data.length);
  const sharesOf = (page) => page.$$eval("#donutLegend li .pc", (els) =>
    els.map((e) => e.textContent).filter((t) => t !== "—")
      .map((t) => parseFloat(t.replace("%", "").replace(",", "."))));

  test("fatias somam 100% e lucro bate com a margem", async ({ page }) => {
    await expect(page.locator("#donutLegend li")).toHaveCount(5);
    await expect(page.locator("#donutCenter")).toHaveText("19,3%");
    await expect(page.locator('#donutLegend li[data-slice="profit"] .v')).toHaveText("R$ 6,74");
    const total = (await sharesOf(page)).reduce((a, b) => a + b, 0);
    expect(Math.abs(total - 100)).toBeLessThan(0.5);
    await expect.poll(() => sliceCount(page)).toBe(5);
  });

  test("afiliado desligado some do gráfico", async ({ page }) => {
    await page.uncheck("#useAffiliate");
    await expect(page.locator('#donutLegend li[data-slice="affiliate"]')).toHaveClass(/muted/);
    await expect.poll(() => sliceCount(page)).toBe(4);
    await expect(page.locator("#breakdown")).not.toContainText("-R$ 0,00");
  });

  test("prejuízo aparece no centro e em vermelho na legenda", async ({ page }) => {
    await page.fill("#price", "18");
    await expect(page.locator("#donutCenter")).toHaveText("Prejuízo");
    await expect(page.locator('#donutLegend li[data-slice="profit"]')).toHaveClass(/loss/);
    await expect.poll(() => sliceCount(page)).toBe(4);
  });

  test("acompanha a aba Quanto cobrar", async ({ page }) => {
    await page.click("#tabReverse");
    await expect(page.locator("#composition")).toBeVisible();
    await expect(page.locator("#donutCenter")).toHaveText("30%");
    await page.fill("#targetMargin", "80");
    await expect(page.locator("#composition")).toBeHidden();
  });
});
