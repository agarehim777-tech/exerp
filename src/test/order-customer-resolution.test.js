import { expect, it } from 'vitest';
import { resolveOrderCustomer } from '../shared/lib/orderCustomer.js';

const ALI_1 = { id: '11111111-1111-4111-8111-111111111111', name: 'Əli Məmmədov', notes: '__crm_meta__:{"fin_code":"5ABC123"}' };
const ALI_2 = { id: '22222222-2222-4222-8222-222222222222', name: 'Əli Məmmədov', tax_id: '7DEF456' };
const LALA = { id: '33333333-3333-4333-8333-333333333333', name: 'Lalə Həsənova' };
const customers = [ALI_1, ALI_2, LALA];

it('picks the selected customer by id even when another customer has the same name', () => {
  expect(resolveOrderCustomer({ customerId: ALI_2.id, name: 'Əli Məmmədov' }, customers)).toBe(ALI_2);
  expect(resolveOrderCustomer({ customerId: ALI_1.id, name: 'Əli Məmmədov' }, customers)).toBe(ALI_1);
});

it('keeps a database id that is outside the loaded page', () => {
  const id = '44444444-4444-4444-8444-444444444444';
  expect(resolveOrderCustomer({ customerId: id }, customers)).toEqual({ id });
});

it('falls back to the FIN, then to a unique name', () => {
  expect(resolveOrderCustomer({ fin: '5abc123', name: 'Əli Məmmədov' }, customers)).toBe(ALI_1);
  expect(resolveOrderCustomer({ fin: '7DEF456' }, customers)).toBe(ALI_2);
  expect(resolveOrderCustomer({ name: ' lalə həsənova ' }, customers)).toBe(LALA);
});

it('refuses to guess between customers with the same name or an unknown one', () => {
  expect(resolveOrderCustomer({ name: 'Əli Məmmədov' }, customers)).toBeNull();
  expect(resolveOrderCustomer({ name: 'Naməlum' }, customers)).toBeNull();
  expect(resolveOrderCustomer({}, customers)).toBeNull();
});
