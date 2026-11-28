import { describe, expect, it } from 'vitest';
import {
  buildOpeningImportTemplate, openingImportKinds, parseOpeningImportCsv, parseOpeningImportDate,
} from '../modules/onboarding/openingImportCsv.ts';
import { describeOpeningImportError } from '../services/openingImport.js';
import { openingCreditToLegacyOrder } from '../shared/adapters/erpShape.js';
import { buildAllCreditRecords } from '../shared/lib/creditRecordHelpers.ts';
import { getCreditSourceLabel } from '../shared/lib/credit.js';

describe('opening balance CSV', () => {
  it('ships a template per kind whose header and example parse back without errors', () => {
    for (const kind of /** @type {Array<keyof typeof openingImportKinds>} */ (Object.keys(openingImportKinds))) {
      const template = buildOpeningImportTemplate(kind);
      expect(template.startsWith('﻿')).toBe(true);
      const { rows, errors } = parseOpeningImportCsv(kind, template);
      expect(errors, kind).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(rows[0].line).toBe(2);
    }
  });

  it('reads credits with Azerbaijani dates and number formats', () => {
    const csv = 'Müqavilə nömrəsi;Müştəri FİN;İlkin ödəniş;Kreditə verilən məbləğ;Müddət (ay);İlk ödəniş tarixi;Ödənilmiş əsas borc\n'
      + 'K-1;5abc123;200;1.800,00;12;10.01.2026;750\n';
    expect(parseOpeningImportCsv('credits', csv)).toEqual({
      rows: [{ line: 2, contractNo: 'K-1', fin: '5abc123', initialPayment: 200, financed: 1800, termMonths: 12, firstDueDate: '2026-01-10', paidPrincipal: 750 }],
      errors: [],
    });
  });

  it('names each bad line before anything is sent', () => {
    const csv = 'Müqavilə nömrəsi;Müştəri FİN;Kreditə verilən məbləğ;Müddət (ay);İlk ödəniş tarixi;Ödənilmiş əsas borc\n'
      + 'K-1;;500;6;31.02.2026;0\n'
      + 'K-2;AAA1111;500;0.5;10.03.2026;500\n';
    const { errors } = parseOpeningImportCsv('credits', csv);
    expect(errors).toEqual([
      'Sətir 2: "İlk ödəniş tarixi" tarixi gg.aa.iiii formatında olmalıdır.',
      'Sətir 2: müştərinin FİN və ya VÖEN-i lazımdır.',
      'Sətir 3: müddət 1-120 ay arası tam ədəd olmalıdır.',
      'Sətir 3: kredit tam ödənilib, idxal etməyin.',
    ]);
    expect(parseOpeningImportCsv('customers', 'Telefon\n123\n').errors).toEqual(['CSV başlığında bu sütunlar yoxdur: Ad soyad / Şirkət.']);
    expect(parseOpeningImportCsv('cash_accounts', 'Kod;Ad;Növ\nK1;Kassa;kart\n').errors).toEqual(['Sətir 2: "Növ" kassa və ya bank olmalıdır.']);
    expect(parseOpeningImportCsv('cash_accounts', 'Kod;Ad;Növ\nK1;Kassa;Kassa\n').rows[0].type).toBe('cash');
  });

  it('accepts ISO and dotted dates only when they exist', () => {
    expect(parseOpeningImportDate('2026-02-28')).toBe('2026-02-28');
    expect(parseOpeningImportDate('5/3/2026')).toBe('2026-03-05');
    expect(parseOpeningImportDate('29.02.2026')).toBeNull();
    expect(parseOpeningImportDate('2026/02/01')).toBeNull();
  });

  it('turns server row errors into Azerbaijani messages with the line', () => {
    expect(describeOpeningImportError({ message: 'opening_import_invalid: line 7: customer not found (import customers first)' }))
      .toBe('Sətir 7: müştəri tapılmadı (əvvəlcə müştəriləri idxal edin).');
    expect(describeOpeningImportError({ message: 'opening_import_invalid: line 3: paid principal is not a number' }))
      .toBe('Sətir 3: paid principal rəqəm deyil.');
    expect(describeOpeningImportError({ message: 'permission_denied' })).toBe('Bu idxal üçün icazəniz yoxdur.');
  });
});

describe('opening-balance credits in the credit portfolio', () => {
  const contract = {
    id: 'c-1', customer_id: 'cu-1', contract_no: 'K-2024-15', principal: 1100, initial_payment: 100, required_initial: 100,
    term_months: 3, start_date: '2026-08-10', status: 'overdue', created_at: '2026-11-28T10:00:00Z',
    customer: { id: 'cu-1', name: 'Əli Məmmədov', fin: '5ABC123' },
    installments: [
      { id: 'i1', installment_no: 1, due_date: '2026-09-10', principal_due: 334, principal_paid: 334, status: 'paid' },
      { id: 'i2', installment_no: 2, due_date: '2026-10-10', principal_due: 334, principal_paid: 100, status: 'overdue' },
      { id: 'i3', installment_no: 3, due_date: '2026-11-10', principal_due: 332, principal_paid: 0, status: 'overdue' },
    ],
  };

  it('shows the imported contract as a credit without a sale-order link', () => {
    const [credit] = buildAllCreditRecords([openingCreditToLegacyOrder(contract)], []);
    expect(credit).toMatchObject({
      id: 'c-1', openingBalance: true, orderId: null, orderNo: null, createdFrom: 'Başlanğıc qalıq',
      customer: 'Əli Məmmədov', fin: '5ABC123', contractId: 'K-2024-15', total: 1100, months: 3,
      balance: 566, paidMonths: 1, status: 'Gecikmiş', startDate: '2026-08-10',
    });
    expect(credit.installments.map((row) => row.amount)).toEqual([0, 234, 332]);
    expect(getCreditSourceLabel(credit)).toBe('Başlanğıc qalıq');
  });
});
