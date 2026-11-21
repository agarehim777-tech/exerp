// @vitest-environment node
import { readFileSync } from 'node:fs';
import { jsPDF } from 'jspdf';
import { describe, expect, it } from 'vitest';
import { buildReportPdf, registerPdfFonts } from '../shared/lib/reportDownload.js';
import { money } from '../services/format.js';

const font = (name) => readFileSync(new URL(`../assets/fonts/${name}`, import.meta.url)).toString('base64');
const fonts = { regular: font('NotoSans-Regular-az-subset.ttf'), bold: font('NotoSans-Bold-az-subset.ttf') };
const AZ_LETTERS = 'əƏıİşŞçÇöÖüÜğĞ₼€—–·…«»№';

describe('report PDF fonts', () => {
  it.each(['normal', 'bold'])('the embedded %s face has every Azerbaijani letter and ₼', (style) => {
    const doc = new jsPDF();
    registerPdfFonts(doc, fonts);
    doc.setFont('NotoSans', style);
    const codeMap = doc.getFont().metadata.cmap.unicode.codeMap;
    const missing = [...AZ_LETTERS].filter((char) => !codeMap[char.codePointAt(0)]);
    expect(missing).toEqual([]);
  });

  it('writes money and Azerbaijani text as glyph ids instead of Helvetica bytes', () => {
    const doc = buildReportPdf(jsPDF, fonts, {
      title: 'Aylıq satış hesabatı',
      period: 'Noyabr 2026',
      summary: [['Satış gəliri', money(1234.5)]],
      columns: ['Sifariş', 'Müştəri', 'Məbləğ'],
      rows: [['SO-1', 'Şəhla Əliyeva', money(99)]],
    });
    const textOps = doc.output().split('\n').filter((line) => /T[jJ]\s*$/.test(line));
    expect(textOps.length).toBeGreaterThan(5);
    // Helvetica wrote ₼ strings as "(\u00001\u0000.…¼) Tj"; the embedded font writes <hex glyph ids> Tj.
    for (const op of textOps) expect(op).toMatch(/^<[0-9a-f]+> Tj$/);
  });
});
