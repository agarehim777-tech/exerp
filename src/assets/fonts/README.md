The PDF report export (shared/lib/reportDownload.js) embeds these fonts. jsPDF's built-in Helvetica has no ə, Ə, ı, ş or ₼ glyphs.

- NotoSans-Regular-az-subset.ttf, NotoSans-Bold-az-subset.ttf: Noto Sans (weights 400 and 700) from Google Fonts, licensed under the SIL Open Font License 1.1 (see OFL.txt).
- Each file is subset to printable ASCII plus the Azerbaijani letters (əƏıİşŞçÇöÖüÜğĞ), ₼, €, and the dashes, quotes and other punctuation a report uses: 216 glyphs, about 25 KB.
- They are loaded only when a report PDF is exported.

To support a new character in PDFs, download a new subset that includes it, replace the files, and add the character to src/test/report-pdf-fonts.test.js.
