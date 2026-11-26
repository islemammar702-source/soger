/**
 * Calcul des totaux d'un document commercial (devis, commande, facture, ticket).
 * Code pur, partagé client / serveur et testé (tests/totals.test.ts).
 * Arrondis au millime (3 décimales), ligne par ligne puis totaux.
 */
export type LineInput = {
  quantity: number;
  unitPrice: number; // HT
  discountRate?: number; // %
  vatRate: number; // %
};

export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function lineTotals(l: LineInput) {
  const gross = round3(l.quantity * l.unitPrice);
  const discount = round3((gross * (l.discountRate ?? 0)) / 100);
  const net = round3(gross - discount);
  const vat = round3((net * l.vatRate) / 100);
  return { gross, discount, net, vat, total: round3(net + vat) };
}

export function documentTotals(lines: LineInput[], opts: { shipping?: number; shippingVatRate?: number; stampDuty?: number } = {}) {
  const computed = lines.map(lineTotals);
  const byRate = new Map<number, { base: number; vat: number }>();
  lines.forEach((l, i) => {
    const r = byRate.get(l.vatRate) ?? { base: 0, vat: 0 };
    r.base = round3(r.base + computed[i].net);
    r.vat = round3(r.vat + computed[i].vat);
    byRate.set(l.vatRate, r);
  });
  const shipping = round3(opts.shipping ?? 0);
  const shippingVat = round3((shipping * (opts.shippingVatRate ?? 0)) / 100);
  const subtotal = round3(computed.reduce((s, c) => s + c.gross, 0));
  const discountTotal = round3(computed.reduce((s, c) => s + c.discount, 0));
  const netTotal = round3(subtotal - discountTotal);
  const vatTotal = round3(computed.reduce((s, c) => s + c.vat, 0) + shippingVat);
  const stampDuty = round3(opts.stampDuty ?? 0);
  return {
    lines: computed,
    vatBreakdown: [...byRate.entries()].sort((a, b) => a[0] - b[0]).map(([rate, v]) => ({ rate, ...v })),
    subtotal,
    discountTotal,
    netTotal,
    shipping,
    vatTotal,
    stampDuty,
    total: round3(netTotal + shipping + vatTotal + stampDuty),
  };
}

export const fmt3 = (n: number) => round3(n).toFixed(3);
