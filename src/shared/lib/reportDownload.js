import { csvCell } from "./csvCell.js";
import { toLocalIsoDate, formatDateTime } from "../../services/date.js";
import notoSansRegularUrl from "../../assets/fonts/NotoSans-Regular-az-subset.ttf?url";
import notoSansBoldUrl from "../../assets/fonts/NotoSans-Bold-az-subset.ttf?url";

// jsPDF's built-in Helvetica has no ə, Ə, ı, ş or ₼. Any string with ₼ (every money() value) was written
// as two-byte text and printed as stray boxes and "¼". The PDF embeds a Noto Sans subset instead, so
// text prints as written (see src/assets/fonts/README.md).
const PDF_FONT = "NotoSans";

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

async function fetchFont(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`PDF şrifti yüklənmədi (${response.status}).`);
  return toBase64(await response.arrayBuffer());
}

/** @param {{ addFileToVFS: (name: string, data: string) => unknown, addFont: (file: string, family: string, style: string) => unknown }} doc */
export function registerPdfFonts(doc, { regular, bold }) {
  doc.addFileToVFS("NotoSans-Regular.ttf", regular);
  doc.addFont("NotoSans-Regular.ttf", PDF_FONT, "normal");
  doc.addFileToVFS("NotoSans-Bold.ttf", bold);
  doc.addFont("NotoSans-Bold.ttf", PDF_FONT, "bold");
}

const safeFileName = (value) => String(value || "hesabat")
  .toLocaleLowerCase("az")
  .replace(/[əƏ]/g, "e").replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s")
  .replace(/[çÇ]/g, "c").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u").replace(/[ğĞ]/g, "g")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const pdfText = (value) => String(value ?? "—");

export async function downloadReportPdf(payload, { isCurrent = () => true } = {}) {
  const [{ jsPDF }, regular, bold] = await Promise.all([import("jspdf"), fetchFont(notoSansRegularUrl), fetchFont(notoSansBoldUrl)]);
  if (!isCurrent()) return false;
  const doc = buildReportPdf(jsPDF, { regular, bold }, payload);
  if (!isCurrent()) return false;
  doc.save(`${safeFileName(payload.title)}-${toLocalIsoDate()}.pdf`);
  return true;
}

/**
 * Lays out the report; fonts are base64 TTF data for registerPdfFonts.
 * @param {any} JsPdf
 * @param {{ regular: string, bold: string }} fonts
 * @param {{ title: string, period: string, summary?: any[], columns?: any[], rows?: any[][] }} payload
 */
export function buildReportPdf(JsPdf, fonts, { title, period, summary = [], columns = [], rows = [] }) {
  const doc = new JsPdf({ unit: "mm", format: "a4", orientation: columns.length > 5 ? "landscape" : "portrait" });
  registerPdfFonts(doc, fonts);
  const width = doc.internal.pageSize.getWidth();
  const height = doc.internal.pageSize.getHeight();
  const margin = 14;
  let y = 16;

  const ensurePage = (needed = 8) => {
    if (y + needed <= height - 14) return;
    doc.addPage();
    y = 16;
  };

  doc.setFillColor(7, 94, 75);
  doc.rect(0, 0, width, 28, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont(PDF_FONT, "bold");
  doc.setFontSize(18);
  doc.text(pdfText(title), margin, 13);
  doc.setFont(PDF_FONT, "normal");
  doc.setFontSize(9);
  doc.text(`ExERP | Dövr: ${pdfText(period)} | ${formatDateTime(new Date())}`, margin, 21);
  y = 36;
  doc.setTextColor(25, 39, 36);

  if (summary.length) {
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(11);
    doc.text("Yekun göstəricilər", margin, y);
    y += 7;
    doc.setFontSize(9);
    summary.forEach(([label, value]) => {
      ensurePage();
      doc.setFont(PDF_FONT, "normal");
      doc.text(pdfText(label), margin, y);
      doc.setFont(PDF_FONT, "bold");
      doc.text(pdfText(value), width - margin, y, { align: "right" });
      doc.setDrawColor(225, 230, 227);
      doc.line(margin, y + 2, width - margin, y + 2);
      y += 7;
    });
    y += 3;
  }

  if (columns.length) {
    const usableWidth = width - margin * 2;
    const cellWidth = usableWidth / columns.length;
    ensurePage(14);
    doc.setFillColor(236, 241, 239);
    doc.rect(margin, y - 5, usableWidth, 8, "F");
    doc.setFont(PDF_FONT, "bold");
    doc.setFontSize(7.5);
    columns.forEach((column, index) => doc.text(pdfText(column), margin + index * cellWidth + 1.5, y, { maxWidth: cellWidth - 3 }));
    y += 7;
    doc.setFont(PDF_FONT, "normal");
    rows.forEach((row) => {
      ensurePage(8);
      row.forEach((value, index) => doc.text(pdfText(value), margin + index * cellWidth + 1.5, y, { maxWidth: cellWidth - 3 }));
      doc.setDrawColor(235, 238, 236);
      doc.line(margin, y + 2, width - margin, y + 2);
      y += 7;
    });
  }

  doc.setProperties({ title, subject: `${period} ExERP hesabatı`, creator: "ExERP" });
  return doc;
}

export function downloadReportCsv({ title, columns = [], rows = [] }) {
  const escape = (value) => csvCell(value);
  const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(escape).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(title)}-${toLocalIsoDate()}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
