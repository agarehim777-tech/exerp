const safeFileName = (value) => String(value || "hesabat")
  .toLocaleLowerCase("az")
  .replace(/[əƏ]/g, "e").replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s")
  .replace(/[çÇ]/g, "c").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u").replace(/[ğĞ]/g, "g")
  .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

const pdfText = (value) => String(value ?? "—")
  .replace(/[əƏ]/g, "e").replace(/[ıİ]/g, "i").replace(/[şŞ]/g, "s")
  .replace(/[çÇ]/g, "c").replace(/[öÖ]/g, "o").replace(/[üÜ]/g, "u").replace(/[ğĞ]/g, "g");

export async function downloadReportPdf({ title, period, summary = [], columns = [], rows = [] }) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: columns.length > 5 ? "landscape" : "portrait" });
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
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(pdfText(title), margin, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text(`ExERP | Dovr: ${pdfText(period)} | ${new Date().toLocaleString("az-AZ")}`, margin, 21);
  y = 36;
  doc.setTextColor(25, 39, 36);

  if (summary.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Yekun gostriciler", margin, y);
    y += 7;
    doc.setFontSize(9);
    summary.forEach(([label, value]) => {
      ensurePage();
      doc.setFont("helvetica", "normal");
      doc.text(pdfText(label), margin, y);
      doc.setFont("helvetica", "bold");
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
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    columns.forEach((column, index) => doc.text(pdfText(column), margin + index * cellWidth + 1.5, y, { maxWidth: cellWidth - 3 }));
    y += 7;
    doc.setFont("helvetica", "normal");
    rows.forEach((row) => {
      ensurePage(8);
      row.forEach((value, index) => doc.text(pdfText(value), margin + index * cellWidth + 1.5, y, { maxWidth: cellWidth - 3 }));
      doc.setDrawColor(235, 238, 236);
      doc.line(margin, y + 2, width - margin, y + 2);
      y += 7;
    });
  }

  doc.setProperties({ title, subject: `${period} ExERP hesabatı`, creator: "ExERP" });
  doc.save(`${safeFileName(title)}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

export function downloadReportCsv({ title, columns = [], rows = [] }) {
  const escape = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(escape).join(";")).join("\n")}`;
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFileName(title)}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
