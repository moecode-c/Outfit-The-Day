import ExcelJS from 'exceljs';
import type { Response } from 'express';
import * as path from 'path';
import PDFDocument from 'pdfkit';

/* ─────────────────────────── XLSX ─────────────────────────── */

export type Sheet = {
  name: string;
  header: string[];
  rows: (string | number | Date | null | undefined)[][];
  /** Column indexes holding EGP amounts (already in pounds, not piasters). */
  money?: number[];
};

/** One workbook, one worksheet per sheet: bold frozen header, EGP number format, sensible widths. */
export async function toXlsx(sheets: Sheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'OTD — Outfit The Day';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.slice(0, 31).replace(/[\\/?*[\]:]/g, ' '), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.addRow(s.header).font = { bold: true };
    for (const r of s.rows) ws.addRow(r.map((c) => c ?? ''));
    ws.columns.forEach((col, i) => {
      if (s.money?.includes(i)) col.numFmt = '#,##0.00';
      else if (s.rows.some((r) => r[i] instanceof Date)) col.numFmt = 'dd mmm yyyy';
      let w = 8;
      col.eachCell?.({ includeEmpty: false }, (c) => {
        const v = c.value;
        const len = v instanceof Date ? 10 : typeof v === 'string' || typeof v === 'number' ? String(v).length : 8;
        w = Math.max(w, len + 2);
      });
      col.width = Math.min(w, 60);
    });
    if (s.rows.length) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.header.length } };
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/* ─────────────────────────── PDF ─────────────────────────── */

const FONTS = path.join(__dirname, '..', '..', 'assets', 'fonts');
// Arabic, Arabic Supplement and Presentation Forms A/B (built from code points to keep the source ASCII).
const AR_RANGES = [
  [0x0600, 0x06ff],
  [0x0750, 0x077f],
  [0xfb50, 0xfdff],
  [0xfe70, 0xfefc],
]
  .map(([a, b]) => `${String.fromCharCode(a)}-${String.fromCharCode(b)}`)
  .join('');
const ARABIC = new RegExp(`[${AR_RANGES}]`);
const NOT_ARABIC = new RegExp(`[^${AR_RANGES}\\s]`, 'g');
const INK = '#0A0A0A';
const MUTED = '#525252';
const LINE = '#D4D4D4';

/** Arabic font has no ASCII glyphs: use Arabic-Indic digits and plain separators inside Arabic runs. */
const arabicSafe = (s: string) =>
  s
    .replace(/[0-9]/g, (d) => '٠١٢٣٤٥٦٧٨٩'[Number(d)])
    .replace(/[—–-]/g, '،')
    .replace(NOT_ARABIC, '')
    .replace(/\s+/g, ' ')
    .trim();

/** Prefer English; fall back to Arabic (rendered right-to-left with the Arabic font). */
export const pick = (v: any): string => (typeof v === 'string' ? v : (v?.en || v?.ar || '')).trim();

export type Col = { label: string; width: number; align?: 'left' | 'right' | 'center' };

/**
 * Small pdfkit wrapper in the site's editorial monochrome style: A4, hairline rules, Inter for
 * Latin text and IBM Plex Sans Arabic for Arabic runs.
 */
export class Pdf {
  readonly doc: PDFKit.PDFDocument;
  readonly left = 48;
  readonly right: number;
  private readonly chunks: Buffer[] = [];
  private readonly done: Promise<Buffer>;

  constructor(title: string) {
    this.doc = new PDFDocument({ size: 'A4', margin: 48, info: { Title: title, Author: 'OTD — Outfit The Day' }, bufferPages: true });
    this.doc.registerFont('latin', path.join(FONTS, 'inter-latin.ttf'));
    this.doc.registerFont('arabic', path.join(FONTS, 'plex-arabic-400.ttf'));
    this.doc.registerFont('arabic-bold', path.join(FONTS, 'plex-arabic-600.ttf'));
    this.doc.font('latin').fillColor(INK);
    this.right = this.doc.page.width - 48;
    this.doc.on('data', (c: Buffer) => this.chunks.push(c));
    this.done = new Promise((ok, fail) => {
      this.doc.on('end', () => ok(Buffer.concat(this.chunks)));
      this.doc.on('error', fail);
    });
  }

  get width() {
    return this.right - this.left;
  }

  /** Writes text at (x, y) within `width`, switching to the Arabic font for Arabic strings. */
  text(s: string | number, x: number, y: number, o: { width?: number; align?: 'left' | 'right' | 'center'; size?: number; color?: string; bold?: boolean } = {}) {
    const raw = String(s ?? '');
    const ar = ARABIC.test(raw);
    this.doc
      .font(ar ? (o.bold ? 'arabic-bold' : 'arabic') : 'latin')
      .fontSize(o.size ?? 9.5)
      .fillColor(o.color ?? INK)
      .text(ar ? arabicSafe(raw) : raw, x, y, { width: o.width, align: o.align ?? (ar ? 'right' : 'left'), lineBreak: !!o.width });
    return this.doc.y;
  }

  rule(y: number, weight = 0.5, color = LINE) {
    this.doc.moveTo(this.left, y).lineTo(this.right, y).lineWidth(weight).strokeColor(color).stroke();
  }

  /** Masthead: wordmark left, document title and meta lines right. Returns the y below it. */
  header(title: string, meta: string[]) {
    this.text('OTD', this.left, 48, { size: 30 });
    this.text('OUTFIT THE DAY', this.left, 84, { size: 7, color: MUTED });
    this.text(title.toUpperCase(), this.left, 48, { width: this.width, align: 'right', size: 8, color: MUTED });
    let y = 62;
    for (const m of meta) y = this.text(m, this.left, y, { width: this.width, align: 'right', size: 9.5 }) + 2;
    const bottom = Math.max(100, y + 6);
    this.rule(bottom, 1, INK);
    return bottom + 16;
  }

  /** Label/value block, e.g. "BILL TO" over a few lines. */
  block(label: string, lines: string[], x: number, y: number, width: number, align: 'left' | 'right' = 'left') {
    this.text(label.toUpperCase(), x, y, { width, align, size: 7, color: MUTED });
    let yy = y + 12;
    for (const l of lines.filter(Boolean)) yy = this.text(l, x, yy, { width, align }) + 2;
    return yy;
  }

  /** Simple table with hairlines; adds pages as needed and repeats the header. */
  table(cols: Col[], rows: (string | number)[][], y: number) {
    const total = cols.reduce((s, c) => s + c.width, 0);
    const xs: number[] = [];
    let x = this.left;
    for (const c of cols) {
      xs.push(x);
      x += (c.width / total) * this.width;
    }
    const w = (i: number) => (cols[i].width / total) * this.width - 6;
    const head = (yy: number) => {
      cols.forEach((c, i) => this.text(c.label.toUpperCase(), xs[i], yy, { width: w(i), align: c.align, size: 7, color: MUTED }));
      this.rule(yy + 12, 0.75, INK);
      return yy + 18;
    };
    y = head(y);
    for (const r of rows) {
      const h = Math.max(...r.map((c, i) => this.doc.font(ARABIC.test(String(c)) ? 'arabic' : 'latin').fontSize(9.5).heightOfString(String(c ?? ''), { width: w(i) })));
      if (y + h + 10 > this.doc.page.height - 64) {
        this.doc.addPage();
        y = head(48);
      }
      r.forEach((c, i) => this.text(c, xs[i], y, { width: w(i), align: cols[i].align }));
      y += h + 5;
      this.rule(y - 1);
      y += 5;
    }
    return y;
  }

  /** Right-aligned label → value lines; the last one emphasised with a heavy rule above. */
  totals(lines: [string, string][], y: number, emphasiseLast = true) {
    const x = this.left + this.width * 0.5;
    const w = this.width * 0.5;
    lines.forEach(([k, v], i) => {
      const last = emphasiseLast && i === lines.length - 1;
      if (last) {
        y += 4;
        this.doc.moveTo(x, y).lineTo(this.right, y).lineWidth(1).strokeColor(INK).stroke();
        y += 8;
      }
      this.text(k, x, y, { width: w / 2, size: last ? 12 : 9.5 });
      this.text(v, x + w / 2, y, { width: w / 2, align: 'right', size: last ? 12 : 9.5 });
      y += last ? 20 : 15;
    });
    return y;
  }

  /** Footer + page numbers on every page, then the finished bytes. */
  async finish(footer: string) {
    const range = this.doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      this.doc.switchToPage(i);
      const y = this.doc.page.height - 40;
      // Writing below the bottom margin would otherwise add a page.
      const m = this.doc.page.margins.bottom;
      this.doc.page.margins.bottom = 0;
      this.text(footer, this.left, y, { width: this.width - 60, size: 7, color: MUTED });
      this.text(`${i + 1} / ${range.count}`, this.left, y, { width: this.width, align: 'right', size: 7, color: MUTED });
      this.doc.page.margins.bottom = m;
    }
    this.doc.end();
    return this.done;
  }
}

/* ─────────────────────────── HTTP ─────────────────────────── */

export const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;

/** Sends a generated file as a download (private, never cached by shared caches). */
export function sendDownload(res: Response, body: Buffer, kind: keyof typeof MIME, filename: string) {
  res.setHeader('Content-Type', MIME[kind]);
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/[^\w.-]+/g, '-')}.${kind}"`);
  res.setHeader('Content-Length', String(body.length));
  res.setHeader('Cache-Control', 'private, no-store');
  res.end(body);
}
