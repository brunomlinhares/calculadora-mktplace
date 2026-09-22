// Regras de taxa das plataformas e contas da calculadora.
// Roda no browser (expõe window.Calc) e no Node (module.exports) pros testes.
(function (root) {
  // Tabela oficial (seller.tiktok.com/br/seller-fees):
  // taxa de venda = (preço - desconto do vendedor) * comissão + tarifa por item.
  // A faixa usa o preço já com o desconto do vendedor.
  const TIKTOK_TIERS = [
    { max: 50, commission: 0.10, fixed: 4 },
    { max: Infinity, commission: 0.06, fixed: 6 },
  ];
  // Faixas oficiais 2026. O "subsídio Pix" (5% a 8%) que aparece na tabela da
  // Shopee NÃO entra no cálculo: quem banca é a Shopee, não o vendedor.
  const SHOPEE_TIERS = [
    { max: 80, commission: 0.20, fixed: 4 },
    { max: 100, commission: 0.14, fixed: 16 },
    { max: 200, commission: 0.14, fixed: 20 },
    { max: Infinity, commission: 0.14, fixed: 26 },
  ];

  const MARGIN_STEPS = [0.10, 0.20, 0.30, 0.40, 0.50, 0.60];

  function tiersFor(platform) {
    return platform === "tiktok" ? TIKTOK_TIERS : SHOPEE_TIERS;
  }
  function tierFor(price, table) {
    return table.find((t) => price < t.max) || table[table.length - 1];
  }

  // Custos de uma venda. `price` é o valor já com desconto do vendedor.
  // Percentuais de afiliado e NF em fração (0.2 = 20%).
  function calcSale(platform, price, cost, affiliatePct, nfPct) {
    const tier = tierFor(price, tiersFor(platform));
    const commissionValue = price * tier.commission;
    const affiliateValue = price * affiliatePct;
    const nfValue = price * nfPct;
    const profit = price - cost - commissionValue - tier.fixed - affiliateValue - nfValue;
    return {
      price, cost, tier, commissionValue, fixedValue: tier.fixed, affiliateValue, nfValue,
      profit, margin: price > 0 ? profit / price : 0,
    };
  }

  // Conta reversa: menor preço (em centavos) cuja margem sobre a venda é >= alvo.
  // Dentro de cada faixa a margem só cresce com o preço, então basta resolver a
  // equação por faixa e ficar com o menor preço que cai dentro da própria faixa.
  // Se a solução cai antes do início da faixa (buraco entre faixas), o piso da
  // faixa já entrega margem acima do alvo.
  function solvePrice(platform, cost, affiliatePct, nfPct, target) {
    const tiers = tiersFor(platform);
    const extra = affiliatePct + nfPct;
    let best = null;
    let lo = 0;
    for (const tier of tiers) {
      const hi = tier.max;
      const d = 1 - tier.commission - extra - target;
      const p = d > 0 ? (cost + tier.fixed) / d : Infinity;
      if (Number.isFinite(p)) {
        const candidate = Math.ceil(Math.max(p, lo) * 100 - 1e-6) / 100;
        if (candidate < hi && (best === null || candidate < best)) best = candidate;
      }
      lo = hi;
    }
    if (best === null || best <= 0) return null;
    const sale = calcSale(platform, best, cost, affiliatePct, nfPct);
    // Arredondar pra centavos nunca derruba a margem; > alvo + 0,5pp = pulou buraco de faixa.
    sale.aboveTarget = sale.margin > target + 0.005;
    return sale;
  }

  const api = {
    TIKTOK_TIERS, SHOPEE_TIERS, MARGIN_STEPS,
    tiersFor, tierFor, calcSale, solvePrice,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.Calc = api;
})(typeof window !== "undefined" ? window : globalThis);
