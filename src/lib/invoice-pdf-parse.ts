/**
 * Lecture « sans IA » d'une facture PDF contenant du texte (PDF généré par un logiciel, pas un scan).
 * Le tableau est reconstitué à partir de la position des mots : la ligne d'en-tête (Réf., Désignation,
 * Qté, P.U., Remise, TVA, Total) donne les colonnes, puis chaque ligne est rangée dans la bonne colonne.
 * Résultat au même format que la lecture IA ; il préremplit un formulaire que l'utilisateur vérifie.
 */
import type { ExtractedInvoice } from "@/server/invoice-ai";

export type PdfTextItem = { str: string; x: number; y: number; width: number; fontSize: number };
type Cell = { text: string; x: number; right: number; fontSize: number };
type Row = { page: number; y: number; cells: Cell[]; text: string };

/* ─── Nombres et dates ─────────────────────────────────────────────── */

/** « 1 234,500 », « 1.234,500 », « 12.500 », « 12,5 DT », « -131,675 » → nombre (null si ce n'est pas un montant). */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[  \s]/g, "").replace(/(DT|TND|DTN|€|%)$/i, "").replace(/^[(]?([-−]?)/, "$1").replace(/[)]$/, "").replace("−", "-");
  if (!/^-?[\d.,']+$/.test(s) || !/\d/.test(s)) return null;
  s = s.replace(/'/g, "");
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    s = s.replace(dec === "." ? /,/g : /\./g, "").replace(dec, ".");
  } else if (lastComma >= 0) {
    if ((s.match(/,/g) ?? []).length > 1) s = s.replace(/,/g, "");
    else s = s.replace(",", ".");
  } else if ((s.match(/\./g) ?? []).length > 1) {
    s = s.replace(/\./g, "");
  }
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** « 26/11/2026 », « 20.11.2026 », « 5-1-26 » → « 2026-11-26 » (ou null). */
export function parseDate(raw: string): string | null {
  const m = /(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{2,4})/.exec(raw);
  if (!m) return null;
  const d = Number(m[1]);
  const mo = Number(m[2]);
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || y < 2000 || y > 2100) return null;
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Matricule fiscal tunisien : 1234567A/A/M/000 (variantes avec espaces ou sans la clé). */
const MF = /\b(\d{6,8})\s?([A-Z])?\s?\/\s?([A-Z])\s?\/\s?(?:([A-Z])\s?\/\s?)?(\d{3})\b/;
const mfOf = (text: string) => {
  const m = MF.exec(text.toUpperCase());
  return m ? [m[1] + (m[2] ?? ""), m[3], m[4], m[5]].filter(Boolean).join("/") : null;
};

/* ─── Lignes de texte ──────────────────────────────────────────────── */

/** Regroupe les mots en lignes (même hauteur) puis en cellules (mots proches). */
export function toRows(pages: PdfTextItem[][]): Row[] {
  const rows: Row[] = [];
  pages.forEach((items, page) => {
    const words = items.filter((i) => i.str.trim()).sort((a, b) => b.y - a.y || a.x - b.x);
    const lines: PdfTextItem[][] = [];
    for (const w of words) {
      const line = lines.find((l) => Math.abs(l[0].y - w.y) <= Math.max(2, Math.min(l[0].fontSize, w.fontSize) * 0.45));
      if (line) line.push(w);
      else lines.push([w]);
    }
    for (const l of lines) {
      l.sort((a, b) => a.x - b.x);
      const cells: Cell[] = [];
      for (const w of l) {
        const prev = cells[cells.length - 1];
        const gap = prev ? w.x - prev.right : Infinity;
        if (prev && gap < Math.max(3, w.fontSize * 0.9)) {
          prev.text += (gap > w.fontSize * 0.15 ? " " : "") + w.str.trim();
          prev.right = Math.max(prev.right, w.x + w.width);
        } else cells.push({ text: w.str.trim(), x: w.x, right: w.x + w.width, fontSize: w.fontSize });
      }
      rows.push({ page, y: l[0].y, cells, text: cells.map((c) => c.text).join("  ") });
    }
  });
  return rows;
}

/* ─── Tableau des articles ─────────────────────────────────────────── */

type Col = "reference" | "description" | "quantity" | "unitPrice" | "discount" | "vat" | "lineTotal";
// « (?!\p{L}) » plutôt que « \b » : \b ne reconnaît pas la fin d'un mot accentué (« Qté »).
const END = String.raw`(?!\p{L})`;
const COLS: [Col, RegExp][] = [
  ["quantity", new RegExp(String.raw`^(qt[ée]s?\.?|quantit[ée]s?|qty|nbre|nombre)${END}`, "iu")],
  ["unitPrice", new RegExp(String.raw`^(p\.?\s?u\.?|prix|pu${END}|unit)`, "iu")],
  ["discount", new RegExp(String.raw`^(rem(ise)?\.?${END}|r\.?\s?%|disc)`, "iu")],
  ["vat", new RegExp(String.raw`^(t\.?v\.?a|taxe)`, "iu")],
  ["lineTotal", new RegExp(String.raw`^(total|montant|mt\.?${END}|net)`, "iu")],
  ["description", new RegExp(String.raw`^(d[ée]signation|description|libell[ée]|produit|article|d[ée]sign\.?)`, "iu")],
  ["reference", new RegExp(String.raw`^(r[ée]f(\.|[ée]rence)?${END}|r[ée]f\.|code|art\.?${END}|n°\s?art)`, "iu")],
];
const colOf = (t: string): Col | null => COLS.find(([, re]) => re.test(t.trim()))?.[0] ?? null;
const STOP = /^(sous[-\s]?total|total|montant|net\s*(h\.?t|[àa]\s*payer)|arr[êe]t[ée]|tva\b|timbre|remise\s*(globale|\(|sur)|conditions|r[èe]glement|mode de paiement|cachet|signature)/i;

export function findTable(rows: Row[]) {
  for (let i = 0; i < rows.length; i++) {
    const kinds = rows[i].cells.map((c) => colOf(c.text));
    const set = new Set(kinds.filter(Boolean));
    if (set.has("description") && (set.has("quantity") || set.has("unitPrice") || set.has("lineTotal")) && set.size >= 3) {
      const header = rows[i].cells.map((c, k) => ({ kind: kinds[k], x: c.x, right: c.right, center: (c.x + c.right) / 2 })).filter((h): h is { kind: Col; x: number; right: number; center: number } => !!h.kind);
      return { index: i, header };
    }
  }
  return null;
}

/* ─── Analyse complète ─────────────────────────────────────────────── */

export function parseInvoiceText(pages: PdfTextItem[][]): ExtractedInvoice | null {
  const rows = toRows(pages);
  const all = rows.map((r) => r.text).join("\n");
  if (all.replace(/\s/g, "").length < 40) return null; // PDF scanné (image) : pas de texte exploitable
  const warnings: string[] = ["Lecture automatique du texte du PDF (sans IA) : vérifiez chaque champ avant d'enregistrer."];

  // En-tête du tableau et lignes d'articles.
  const table = findTable(rows);
  const lines: ExtractedInvoice["lines"] = [];
  let endIndex = rows.length;
  if (table) {
    const { header } = table;
    const sorted = [...header].sort((a, b) => a.x - b.x);
    const textCol = (c: Cell): Col => {
      // Texte : colonne dont le début est le plus proche à gauche du début de la cellule.
      let best = sorted[0];
      for (const h of sorted) if (h.x <= c.x + 4) best = h;
      return best.kind;
    };
    const numCol = (c: Cell): Col => {
      // Nombre (souvent aligné à droite) : colonne la plus proche par le centre ou le bord droit.
      const center = (c.x + c.right) / 2;
      return [...header].sort((a, b) => Math.min(Math.abs(a.center - center), Math.abs(a.right - c.right)) - Math.min(Math.abs(b.center - center), Math.abs(b.right - c.right)))[0].kind;
    };
    for (let i = table.index + 1; i < rows.length; i++) {
      const r = rows[i];
      if (r.page !== rows[table.index].page && findTable([r])) continue; // en-tête répété sur la page suivante
      if (STOP.test(r.cells[0]?.text ?? "") || (r.cells.length <= 2 && STOP.test(r.text))) { endIndex = i; break; }
      const v: Partial<Record<Col, string>> = {};
      for (const c of r.cells) {
        const isNum = parseAmount(c.text) != null;
        const k = isNum ? numCol(c) : textCol(c);
        // Un nombre ne va jamais dans la désignation, sauf si c'est la seule colonne texte libre.
        const kind = isNum && (k === "description" || k === "reference") ? k : k;
        v[kind] = v[kind] ? `${v[kind]} ${c.text}` : c.text;
      }
      const nums = (["quantity", "unitPrice", "lineTotal"] as Col[]).filter((k) => v[k] && parseAmount(v[k]!) != null);
      const desc = v.description?.trim();
      if (!nums.length) {
        // Suite de la désignation sur une deuxième ligne.
        if (desc && lines.length && !v.reference) { lines[lines.length - 1].description += ` ${desc}`; continue; }
        if (lines.length) { endIndex = i; break; }
        continue;
      }
      if (!desc && !v.reference) continue;
      const qty = v.quantity ? parseAmount(v.quantity) : null;
      const pu = v.unitPrice ? parseAmount(v.unitPrice) : null;
      const total = v.lineTotal ? parseAmount(v.lineTotal) : null;
      lines.push({
        reference: v.reference?.trim() || null,
        manufacturerRef: null,
        brand: null,
        description: desc || v.reference!.trim(),
        quantity: qty,
        unitPriceHT: pu ?? (total != null && qty ? Math.round((total / qty) * 1000) / 1000 : null),
        discountRate: v.discount ? parseAmount(v.discount) : null,
        vatRate: v.vat ? parseAmount(v.vat) : null,
        lineTotalHT: total,
      });
    }
  } else {
    warnings.push("Tableau des articles non reconnu : ajoutez les lignes à la main.");
  }

  // Totaux (après le tableau) : dernier montant de la ligne.
  const after = rows.slice(endIndex);
  const lastNum = (r: Row) => {
    for (let k = r.cells.length - 1; k >= 0; k--) { const n = parseAmount(r.cells[k].text); if (n != null) return n; }
    return null;
  };
  const find = (re: RegExp) => after.find((r) => re.test(r.text));
  const vatRows = after.filter((r) => /^\s*(t\.?v\.?a|tva)\b/i.test(r.cells[0]?.text ?? ""));
  const netHT = find(/net\s*h\.?\s*t/i);
  const totHT = find(/(total|montant)\s*h\.?\s*t/i);
  const ttc = find(/net\s*[àa]\s*payer|total\s*t\.?\s*t\.?\s*c|montant\s*t\.?\s*t\.?\s*c|total\s*[àa]\s*payer|net\s*ttc/i);
  const stamp = find(/timbre/i);
  const globalDiscount = find(/^remise\b|remise\s*(globale|\()/i);
  const totals = {
    totalHT: (netHT && lastNum(netHT)) ?? (totHT && lastNum(totHT)) ?? null,
    totalVAT: vatRows.length ? Math.round(vatRows.reduce((s, r) => s + (lastNum(r) ?? 0), 0) * 1000) / 1000 : null,
    stampDuty: stamp ? lastNum(stamp) : null,
    totalTTC: ttc ? lastNum(ttc) : null,
  };
  // Remise globale « Remise (5 %) » : appliquée à chaque ligne sans remise propre.
  const gd = globalDiscount ? /(\d+(?:[.,]\d+)?)\s*%/.exec(globalDiscount.text) : null;
  if (gd) {
    const rate = parseAmount(gd[1])!;
    for (const l of lines) if (l.discountRate == null) l.discountRate = rate;
    warnings.push(`Remise globale de ${rate} % appliquée à chaque ligne.`);
  }
  // Taux de TVA unique indiqué dans les totaux (« TVA (19 %) ») si le tableau n'a pas de colonne TVA.
  const vatRates = vatRows.map((r) => /(\d{1,2})(?:[.,]\d+)?\s*%/.exec(r.text)?.[1]).filter(Boolean).map(Number);
  if (vatRates.length === 1) for (const l of lines) if (l.vatRate == null) l.vatRate = vatRates[0];

  // En-tête : rangées au-dessus du tableau.
  const top = table ? rows.slice(0, table.index) : rows.slice(0, Math.min(rows.length, 30));
  const topText = top.map((r) => r.text);
  const numM =
    topText.map((t) => /(?:facture|invoice)\s*(?:n[°ºo]\.?|num[ée]ro|no\.?)\s*[:#]?\s*([A-Z0-9][\w\-/.]{2,})/i.exec(t)).find(Boolean) ??
    topText.map((t) => /\bN[°º]\s*(?:de\s+facture)?\s*[:#]?\s*([A-Z0-9][\w\-/.]{2,})/i.exec(t)).find(Boolean);
  const invoiceNumber = numM && !parseDate(numM[1]) ? numM[1] : null;
  const dueRow = top.find((r) => /[ée]ch[ée]ance/i.test(r.text) && parseDate(r.text));
  const dateRow = top.find((r) => /\bdate\b/i.test(r.text) && !/[ée]ch[ée]ance/i.test(r.text) && parseDate(r.text)) ?? top.find((r) => parseDate(r.text) && r !== dueRow);

  // Fournisseur = émetteur. Bloc « Émetteur / Fournisseur », sinon le plus grand texte en haut de page
  // (hors « FACTURE »), en écartant le bloc du client (« Facturé à », « Client »).
  const CLIENT = /^(factur[ée]\s*[àa]|client|destinataire|adress[ée]\s*[àa]|livr[ée]\s*[àa])/i;
  const clientBlock = top.find((r) => r.cells.some((c) => CLIENT.test(c.text)));
  const clientX = clientBlock?.cells.find((c) => CLIENT.test(c.text))?.x ?? null;
  const inClient = (c: Cell, r: Row) => clientBlock != null && clientX != null && Math.abs(c.x - clientX) < 60 && r.y <= clientBlock.y && r.page === clientBlock.page;
  const emitterLabel = top.find((r) => /^(é|e)metteur|^fournisseur|^vendeur|^from\b/i.test(r.cells[0]?.text ?? ""));
  let supplierName: string | null = null;
  let supplierRowIdx = -1;
  if (emitterLabel) {
    const i = top.indexOf(emitterLabel);
    const next = top.slice(i + 1).find((r) => r.cells.some((c) => Math.abs(c.x - emitterLabel.cells[0].x) < 30));
    const cell = next?.cells.find((c) => Math.abs(c.x - emitterLabel.cells[0].x) < 30);
    if (cell) { supplierName = cell.text; supplierRowIdx = top.indexOf(next!); }
  }
  if (!supplierName) {
    let best: { c: Cell; i: number } | null = null;
    top.forEach((r, i) => r.cells.forEach((c) => {
      if (/factur|invoice|^date|^n[°º]/i.test(c.text) || parseAmount(c.text) != null || c.text.length < 3 || inClient(c, r)) return;
      if (!best || c.fontSize > best.c.fontSize + 0.5) best = { c, i };
    }));
    if (best) { supplierName = (best as { c: Cell }).c.text; supplierRowIdx = (best as { i: number }).i; }
    warnings.push("Fournisseur déduit de l'en-tête du document : vérifiez-le.");
  }
  // Matricule fiscal du fournisseur : premier MF hors bloc client.
  let taxId: string | null = null;
  for (const r of top) for (const c of r.cells) {
    const mf = mfOf(c.text);
    if (mf && !inClient(c, r) && !taxId) taxId = mf;
  }
  // Adresse : ligne sous le nom du fournisseur qui ressemble à une adresse.
  let address: string | null = null;
  if (supplierRowIdx >= 0) {
    const x0 = top[supplierRowIdx].cells[0].x;
    for (const r of top.slice(supplierRowIdx + 1, supplierRowIdx + 6)) {
      const c = r.cells.find((cc) => Math.abs(cc.x - x0) < 40);
      if (c && /\b(rue|av\.?|avenue|route|zone|z\.?\s?i\.?|km|bp|cit[ée]|r[ée]sidence|tunis|sfax|sousse|nabeul|bizerte|monastir|gab[èe]s|ariana|ben arous|\d{4})\b/i.test(c.text) && !mfOf(c.text)) {
        address = c.text.replace(/^adresse\s*:\s*/i, "");
        break;
      }
    }
  }

  const docType: ExtractedInvoice["documentType"] = /\bavoir\b/i.test(all) ? "credit_note" : /proforma|pro-forma|\bdevis\b/i.test(all.slice(0, 600)) ? "proforma" : /bon de livraison/i.test(all.slice(0, 600)) && !/facture/i.test(all.slice(0, 600)) ? "delivery_note" : "invoice";
  if (!invoiceNumber) warnings.push("Numéro de facture non trouvé.");
  if (table && !lines.length) warnings.push("Aucune ligne d'article lue dans le tableau.");

  return {
    supplier: { name: supplierName, taxId, address, phone: null },
    invoiceNumber,
    issueDate: dateRow ? parseDate(dateRow.text) : null,
    dueDate: dueRow ? parseDate(dueRow.text.slice(dueRow.text.search(/[ée]ch[ée]ance/i))) : null,
    documentType: docType,
    lines,
    totals,
    amountPaid: null,
    paymentMethod: /virement/i.test(all) ? "transfer" : /ch[èe]que/i.test(all) ? "check" : /esp[èe]ces/i.test(all) ? "cash" : null,
    warnings,
  };
}
