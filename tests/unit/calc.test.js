const test = require("node:test");
const assert = require("node:assert/strict");
const { calcSale, solvePrice, tierFor, TIKTOK_TIERS, SHOPEE_TIERS, MARGIN_STEPS } = require("../../calc.js");

// Taxa de venda cobrada pelo TikTok = comissão + tarifa por item.
const tiktokFee = (price) => {
  const s = calcSale("tiktok", price, 0, 0, 0);
  return Math.round((s.commissionValue + s.fixedValue) * 100) / 100;
};

const close = (a, b, eps = 0.005) => assert.ok(Math.abs(a - b) <= eps, `${a} ≉ ${b}`);

// Menor preço (em centavos) com margem >= alvo, por força bruta.
function bruteMinPrice(platform, cost, aff, nf, target, maxCents = 1_000_000) {
  for (let cents = 1; cents <= maxCents; cents++) {
    if (calcSale(platform, cents / 100, cost, aff, nf).margin >= target - 1e-12) return cents / 100;
  }
  return null;
}

test("faixas do TikTok mudam em R$50", () => {
  assert.deepEqual(tierFor(49.99, TIKTOK_TIERS), { max: 50, commission: 0.10, fixed: 4 });
  assert.deepEqual(tierFor(50, TIKTOK_TIERS), { max: Infinity, commission: 0.06, fixed: 6 });
});

test("faixas da Shopee mudam em R$80, R$100 e R$200", () => {
  assert.equal(tierFor(79.99, SHOPEE_TIERS).fixed, 4);
  assert.equal(tierFor(80, SHOPEE_TIERS).fixed, 16);
  assert.equal(tierFor(99.99, SHOPEE_TIERS).fixed, 16);
  assert.equal(tierFor(100, SHOPEE_TIERS).fixed, 20);
  assert.equal(tierFor(199.99, SHOPEE_TIERS).fixed, 20);
  assert.equal(tierFor(200, SHOPEE_TIERS).fixed, 26);
});

// Exemplos oficiais de seller.tiktok.com/br/seller-fees ("Ver exemplo").
test("exemplo oficial TikTok: camisa R$45, sem desconto -> taxa R$8,50", () => {
  const s = calcSale("tiktok", 45 - 0, 0, 0, 0);
  assert.equal(s.tier.commission, 0.10);
  close(s.commissionValue, 4.5, 0.001);
  assert.equal(s.fixedValue, 4);
  assert.equal(tiktokFee(45), 8.5);
});

test("exemplo oficial TikTok: calça R$85 com R$10 de desconto -> taxa R$10,50", () => {
  const s = calcSale("tiktok", 85 - 10, 0, 0, 0);
  assert.equal(s.tier.commission, 0.06);
  close(s.commissionValue, 4.5, 0.001);
  assert.equal(s.fixedValue, 6);
  assert.equal(tiktokFee(75), 10.5);
});

test("TikTok: faixa usa o preço já com desconto (R$55 - R$10 = R$45 cai em 10% + R$4)", () => {
  assert.equal(tiktokFee(55 - 10), 8.5);
  assert.equal(tiktokFee(49.99), 9);
  assert.equal(tiktokFee(50), 9);
});

test("TikTok cobra só comissão + tarifa por item (sem taxa extra de frete)", () => {
  const s = calcSale("tiktok", 100, 0, 0, 0);
  assert.equal(s.freteValue, undefined);
  close(s.profit, 100 - 6 - 6);
});

test("venda TikTok R$34,90 com custo 9,50, afiliado 20% e NF 6%", () => {
  const s = calcSale("tiktok", 34.9, 9.5, 0.2, 0.06);
  close(s.commissionValue, 3.49);
  assert.equal(s.fixedValue, 4);
  close(s.affiliateValue, 6.98);
  close(s.nfValue, 2.094);
  close(s.profit, 8.84);
  close(s.margin, 0.253, 0.001);
});

test("Shopee: R$100 cai em 14% + R$20", () => {
  const s = calcSale("shopee", 100, 10, 0, 0);
  close(s.profit, 100 - 10 - 14 - 20);
});

test("preço zero não gera margem NaN", () => {
  assert.equal(calcSale("shopee", 0, 10, 0, 0).margin, 0);
});

test("conta reversa: exemplo da UI (TikTok, 30%)", () => {
  const s = solvePrice("tiktok", 9.5, 0.2, 0.06, 0.3);
  assert.equal(s.price, 39.71);
  close(s.profit, 11.91);
  assert.ok(s.margin >= 0.3);
  assert.equal(s.aboveTarget, false);
});

test("conta reversa: inviável quando percentuais + margem passam de 100%", () => {
  assert.equal(solvePrice("shopee", 9.5, 0.2, 0.06, 0.6), null);
  assert.equal(solvePrice("tiktok", 10, 0.5, 0.2, 0.5), null);
});

test("nas tabelas atuais, virar de faixa nunca aumenta a margem (sem buraco entre faixas)", () => {
  // Se isso quebrar, alguma plataforma mudou as faixas: a conta reversa continua certa
  // (ela trata buraco e marca aboveTarget), mas vale revisar a UI do "*".
  for (const platform of ["tiktok", "shopee"]) {
    const table = platform === "tiktok" ? TIKTOK_TIERS : SHOPEE_TIERS;
    for (const t of table.slice(0, -1)) {
      for (const cost of [0, 10, 50]) {
        const before = calcSale(platform, t.max - 0.01, cost, 0.1, 0.06).margin;
        const after = calcSale(platform, t.max, cost, 0.1, 0.06).margin;
        assert.ok(after <= before + 1e-3, `${platform} em R$${t.max}: ${before} -> ${after}`);
      }
    }
  }
});

test("conta reversa: preço sugerido nunca fica com margem abaixo do alvo", () => {
  for (const platform of ["tiktok", "shopee"]) {
    for (let cost = 0; cost <= 300; cost += 7.3) {
      for (const target of MARGIN_STEPS) {
        const s = solvePrice(platform, cost, 0.15, 0.06, target);
        if (!s) continue;
        assert.ok(s.margin >= target - 1e-9, `${platform} custo ${cost} alvo ${target}: ${s.margin}`);
        if (s.aboveTarget) assert.ok(table(platform).some((t) => t.max === s.price), "pulo de faixa tem que cair no piso");
      }
    }
  }
  function table(p) { return p === "tiktok" ? TIKTOK_TIERS : SHOPEE_TIERS; }
});

test("conta reversa: preço alto no TikTok continua exato", () => {
  const s = solvePrice("tiktok", 800, 0, 0, 0.3);
  assert.ok(s.margin >= 0.3);
  assert.ok(calcSale("tiktok", s.price - 0.01, 800, 0, 0).margin < 0.3);
});

test("conta reversa bate com força bruta em várias combinações", () => {
  let checked = 0;
  for (const platform of ["tiktok", "shopee"]) {
    for (const cost of [0, 1, 9.5, 20, 35, 60, 150]) {
      for (const aff of [0, 0.1, 0.2]) {
        for (const nf of [0, 0.06]) {
          for (const target of [0, ...MARGIN_STEPS]) {
            const s = solvePrice(platform, cost, aff, nf, target);
            const brute = bruteMinPrice(platform, cost, aff, nf, target);
            assert.equal(s ? s.price : null, brute, JSON.stringify({ platform, cost, aff, nf, target }));
            checked++;
          }
        }
      }
    }
  }
  assert.equal(checked, 588);
});
