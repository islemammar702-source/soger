import type { InvoiceDraft } from "@/server/admin/supplier-invoices";

/** Brouillon vide d'une facture fournisseur (saisie manuelle). */
export const emptyInvoiceDraft = (stampDuty: number): InvoiceDraft => ({
  supplier: { id: null, name: "", taxId: "", address: "", how: null },
  externalRef: "",
  issueDate: new Date().toISOString().slice(0, 10),
  dueDate: "",
  stampDuty,
  amountPaid: 0,
  paymentMethod: "transfer",
  printed: null,
  documentType: null,
  warnings: [],
  lines: [],
});
