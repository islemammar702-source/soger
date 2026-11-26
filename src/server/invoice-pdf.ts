import "server-only";
import { extractTextItems } from "unpdf";
import { parseInvoiceText } from "@/lib/invoice-pdf-parse";
import type { ExtractedInvoice } from "./invoice-ai";

/** Lecture gratuite (sans IA) d'un PDF contenant du texte. null si le PDF est un scan ou illisible. */
export async function readPdfInvoice(data: Buffer): Promise<ExtractedInvoice | null> {
  try {
    const r = await extractTextItems(new Uint8Array(data));
    const pages = r.items.slice(0, 10).map((p) => p.map((i) => ({ str: i.str, x: i.x, y: i.y, width: i.width, fontSize: i.fontSize })));
    return parseInvoiceText(pages);
  } catch (e) {
    console.error("readPdfInvoice", e);
    return null;
  }
}
