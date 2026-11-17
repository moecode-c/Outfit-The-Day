import { Pdf, pick, Sheet, toXlsx } from '../common/exports';

/* Generated documents: customer order invoices, seller commission invoices and statements. */

// `|| 0` also turns −0 (e.g. "no payments" negated) into 0, so it never prints as "-0.00".
const pounds = (piasters: number) => (piasters ?? 0) / 100 || 0;
const money = (piasters: number) => `EGP ${pounds(piasters).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const signed = (piasters: number) => (piasters < 0 ? `−${money(-piasters)}` : money(piasters));
const day = (d: any) => (d ? new Date(d).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Africa/Cairo' }) : '');

export const ENTRY_LABEL: Record<string, string> = {
  COMMISSION: 'Commission',
  COUPON_CREDIT: 'Coupon credit',
  RETURN_REVERSAL: 'Return adjustment',
  PAYMENT: 'Payment',
  ADJUSTMENT: 'Adjustment',
};
const METHOD: Record<string, string> = { COD: 'Cash on delivery', INSTAPAY: 'InstaPay', CASH: 'Cash' };
const FOOTER = 'OTD — Outfit The Day · Generated ';

const sellerLines = (s: any) => [pick(s?.storeName), s?.ownerName, s?.email, s?.phone, s?.businessAddress, s?.taxNumber ? `Tax no. ${s.taxNumber}` : ''];

/** Customer invoice for a whole order: one section per brand, since each brand ships and bills separately. */
export async function orderInvoicePdf(o: any): Promise<Buffer> {
  const pdf = new Pdf(`Invoice ${o.number}`);
  let y = pdf.header('Invoice', [o.number, day(o.createdAt)]);
  const a = o.address ?? {};
  const half = pdf.width / 2 - 12;
  const y1 = pdf.block('Deliver to', [a.fullName, [a.building, a.street, a.area, a.city].filter(Boolean).join(', '), pick(a.governorateName ?? a.governorate?.name), a.phone], pdf.left, y, half);
  const methods = [...new Set((o.subOrders ?? []).map((s: any) => METHOD[s.paymentMethod] ?? s.paymentMethod))] as string[];
  const y2 = pdf.block('Payment', methods, pdf.left + half + 24, y, half, 'right');
  y = Math.max(y1, y2) + 18;

  for (const s of o.subOrders ?? []) {
    if (y > pdf.doc.page.height - 200) {
      pdf.doc.addPage();
      y = 48;
    }
    pdf.text(`${pick(s.seller?.storeName)}  ·  ${s.number}`.toUpperCase(), pdf.left, y, { size: 8 });
    y += 16;
    y = pdf.table(
      [{ label: 'Item', width: 5 }, { label: 'Colour / size', width: 2.4 }, { label: 'Qty', width: 0.8, align: 'center' }, { label: 'Unit', width: 1.6, align: 'right' }, { label: 'Total', width: 1.6, align: 'right' }],
      (s.items ?? []).map((i: any) => [pick(i.title), [pick(i.colorName), i.size].filter(Boolean).join(' · '), i.qty, money(i.unitPrice), money(i.lineTotal)]),
      y,
    );
    const lines: [string, string][] = [['Items', money(s.itemsTotal)], ['Shipping', money(s.shippingFee)]];
    if (s.couponShare > 0) lines.push(['Coupon', `−${money(s.couponShare)}`]);
    lines.push([`Brand total`, money(s.total)]);
    y = pdf.totals(lines, y + 4) + 14;
  }

  const t = o.totals ?? {};
  const grand: [string, string][] = [['Items', money(t.items)], ['Shipping', money(t.shipping)]];
  if (t.coupon > 0) grand.push([`Coupon${o.coupon?.code ? ` (${o.coupon.code})` : ''}`, `−${money(t.coupon)}`]);
  grand.push(['Order total', money(t.total)]);
  if (y > pdf.doc.page.height - 140) {
    pdf.doc.addPage();
    y = 48;
  }
  pdf.rule(y, 1, '#0A0A0A');
  pdf.totals(grand, y + 12);
  return pdf.finish(FOOTER + day(new Date()) + ' · Prices in Egyptian pounds');
}

/** Commission invoice for one billing period (seller hub + admin). */
export async function commissionInvoicePdf({ invoice: i, entries, seller }: { invoice: any; entries: any[]; seller: any }): Promise<Buffer> {
  const pdf = new Pdf(`Commission invoice ${i.number}`);
  let y = pdf.header('Commission invoice', [i.number, `${day(i.periodStart)} – ${day(i.periodEnd)}`, `Due ${day(i.dueAt)}`, `Status: ${i.status}`]);
  y = pdf.block('Billed to', sellerLines(seller), pdf.left, y, pdf.width / 2) + 18;
  y = pdf.table(
    [{ label: 'Date', width: 1.6 }, { label: 'Entry', width: 2.2 }, { label: 'Order', width: 2 }, { label: 'Note', width: 3 }, { label: 'Amount', width: 1.8, align: 'right' }],
    entries.map((e) => [day(e.createdAt), ENTRY_LABEL[e.type] ?? e.type, e.subOrder?.number ?? '', e.note ?? '', signed(e.amount)]),
    y,
  );
  pdf.totals(
    [
      ['Opening balance', signed(i.openingBalance ?? 0)],
      ['This period', signed(i.periodTotal ?? 0)],
      ['Paid', money(i.paid ?? 0)],
      ['Amount due', money(Math.max(0, (i.amountDue ?? 0) - (i.paid ?? 0)))],
    ],
    y + 8,
  );
  return pdf.finish(FOOTER + day(new Date()) + ' · Positive amounts are owed to OTD; negative amounts are credits to the brand');
}

type Statement = { balance: number; totals: { commission: number; couponCredits: number; reversals: number; paid: number }; entries: any[]; invoices: any[]; payments: any[] };

/** Account statement: balance, totals, every ledger entry, invoices and payments. */
export async function statementPdf(seller: any, st: Statement): Promise<Buffer> {
  const pdf = new Pdf(`Statement ${pick(seller.storeName)}`);
  let y = pdf.header('Account statement', [pick(seller.storeName), `As of ${day(new Date())}`]);
  y = pdf.block('Brand', sellerLines(seller), pdf.left, y, pdf.width / 2);
  y = pdf.totals(
    [
      ['Commission', money(st.totals.commission)],
      ['Coupon credits', `−${money(st.totals.couponCredits)}`],
      ['Return adjustments', signed(st.totals.reversals)],
      ['Paid', `−${money(st.totals.paid)}`],
      [st.balance >= 0 ? 'Balance owed to OTD' : 'Credit owed to brand', money(Math.abs(st.balance))],
    ],
    y + 12,
  );
  pdf.text('LEDGER', pdf.left, y + 12, { size: 8 });
  y = pdf.table(
    [{ label: 'Date', width: 1.6 }, { label: 'Entry', width: 2.2 }, { label: 'Order', width: 2 }, { label: 'Note', width: 3 }, { label: 'Amount', width: 1.8, align: 'right' }],
    st.entries.map((e) => [day(e.createdAt), ENTRY_LABEL[e.type] ?? e.type, e.subOrder?.number ?? '', e.note ?? '', signed(e.amount)]),
    y + 28,
  );
  if (st.invoices.length) {
    if (y > pdf.doc.page.height - 160) {
      pdf.doc.addPage();
      y = 48;
    }
    pdf.text('INVOICES', pdf.left, y + 12, { size: 8 });
    y = pdf.table(
      [{ label: 'Invoice', width: 2 }, { label: 'Period', width: 3.4 }, { label: 'Due', width: 1.8 }, { label: 'Status', width: 1.4 }, { label: 'Amount due', width: 1.8, align: 'right' }, { label: 'Paid', width: 1.8, align: 'right' }],
      st.invoices.map((i) => [i.number, `${day(i.periodStart)} – ${day(i.periodEnd)}`, day(i.dueAt), i.status, money(i.amountDue), money(i.paid)]),
      y + 28,
    );
  }
  if (st.payments.length) {
    if (y > pdf.doc.page.height - 160) {
      pdf.doc.addPage();
      y = 48;
    }
    pdf.text('PAYMENTS', pdf.left, y + 12, { size: 8 });
    pdf.table(
      [{ label: 'Date', width: 1.6 }, { label: 'Method', width: 1.6 }, { label: 'Reference', width: 3 }, { label: 'Status', width: 1.6 }, { label: 'Amount', width: 1.8, align: 'right' }],
      st.payments.map((p) => [day(p.createdAt), METHOD[p.method] ?? p.method, p.referenceNo ?? p.receiptNo ?? '', p.status, money(p.amount)]),
      y + 28,
    );
  }
  return pdf.finish(FOOTER + day(new Date()) + ' · Positive amounts are owed to OTD; negative amounts are credits to the brand');
}

/** Same statement as a workbook: Summary, Ledger, Invoices and Payments sheets (amounts in EGP). */
export function statementXlsx(seller: any, st: Statement): Promise<Buffer> {
  const sheets: Sheet[] = [
    {
      name: 'Summary',
      header: ['Item', 'EGP'],
      money: [1],
      rows: [
        ['Brand', pick(seller.storeName)],
        ['As of', new Date().toISOString().slice(0, 10)],
        ['Commission', pounds(st.totals.commission)],
        ['Coupon credits', -pounds(st.totals.couponCredits)],
        ['Return adjustments', pounds(st.totals.reversals)],
        ['Paid', -pounds(st.totals.paid)],
        ['Balance (positive = owed to OTD)', pounds(st.balance)],
      ],
    },
    {
      name: 'Ledger',
      header: ['Date', 'Entry', 'Order', 'Note', 'Amount (EGP)', 'Invoiced'],
      money: [4],
      rows: st.entries.map((e) => [new Date(e.createdAt), ENTRY_LABEL[e.type] ?? e.type, e.subOrder?.number ?? '', e.note ?? '', pounds(e.amount), e.invoice ? 'yes' : '']),
    },
    {
      name: 'Invoices',
      header: ['Invoice', 'Period start', 'Period end', 'Due', 'Status', 'Opening (EGP)', 'Period (EGP)', 'Amount due (EGP)', 'Paid (EGP)'],
      money: [5, 6, 7, 8],
      rows: st.invoices.map((i) => [i.number, new Date(i.periodStart), new Date(i.periodEnd), new Date(i.dueAt), i.status, pounds(i.openingBalance), pounds(i.periodTotal), pounds(i.amountDue), pounds(i.paid)]),
    },
    {
      name: 'Payments',
      header: ['Date', 'Method', 'Reference', 'Status', 'Amount (EGP)'],
      money: [4],
      rows: st.payments.map((p) => [new Date(p.createdAt), METHOD[p.method] ?? p.method, p.referenceNo ?? p.receiptNo ?? '', p.status, pounds(p.amount)]),
    },
  ];
  return toXlsx(sheets);
}
