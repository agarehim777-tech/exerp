import { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import DataTable from '../shared/ui/DataTable.jsx';
import ModuleLink from '../shared/ui/ModuleLink.jsx';
import { Tabs } from '../shared/ui/primitives.jsx';
import { PageQueryProvider, usePageQuery } from '../shared/hooks/usePageQuery.jsx';
import { pathForRecord } from '../config/routes.js';

function QueryExample() {
  const [query, update] = usePageQuery({ tab: 'accounts', order: '', q: '' });
  const location = useLocation();
  return <>
    <output data-testid="location">{location.pathname + location.search}</output>
    <output data-testid="record">{query.order}</output>
    <Tabs items={[["accounts", "Hesablar"], ["expenses", "Xərclər"]]} value={query.tab} onChange={tab => update({ tab })} />
    <button onClick={() => update({ order: 'record-2' })}>Open record</button>
    <button onClick={() => update({ order: '' })}>Close record</button>
  </>;
}

it('restores URL state, preserves filters and follows browser back/forward', async () => {
  const router = createMemoryRouter([{ path: '*', element: <PageQueryProvider><QueryExample /></PageQueryProvider> }], { initialEntries: ['/maliyye/kassa?tab=expenses&q=icar%C9%99&order=record-1'] });
  render(<RouterProvider router={router} />);
  expect(screen.getByRole('tab', { name: 'Xərclər' })).toHaveAttribute('aria-selected', 'true');
  expect(screen.getByTestId('record')).toHaveTextContent('record-1');
  fireEvent.click(screen.getByText('Open record'));
  await waitFor(() => expect(router.state.location.search).toContain('order=record-2'));
  expect(new URLSearchParams(router.state.location.search).get('q')).toBe('icarə');
  await act(() => router.navigate(-1));
  expect(screen.getByTestId('record')).toHaveTextContent('record-1');
  await act(() => router.navigate(1));
  expect(screen.getByTestId('record')).toHaveTextContent('record-2');
  fireEvent.click(screen.getByText('Close record'));
  await waitFor(() => expect(router.state.location.search).not.toContain('order='));
  expect(router.state.location.search).toContain('tab=expenses');
});

it('clears record/filter state on a tenant change but retains deep links on first load', async () => {
  function Tenants() {
    const [scope, setScope] = useState('A');
    return <><button onClick={() => setScope('B')}>Switch tenant</button><PageQueryProvider scope={scope}><QueryExample /></PageQueryProvider></>;
  }
  const router = createMemoryRouter([{ path: '*', element: <Tenants /> }], { initialEntries: ['/satis/sifarisler?order=A-order'] });
  render(<RouterProvider router={router} />);
  expect(screen.getByTestId('record')).toHaveTextContent('A-order');
  fireEvent.click(screen.getByText('Switch tenant'));
  await waitFor(() => expect(router.state.location.search).toBe(''));
  expect(screen.getByTestId('record')).toBeEmptyDOMElement();
});

it('keeps modified clicks native and encodes record URLs', () => {
  const select = vi.fn();
  render(<ModuleLink to={pathForRecord('credits', 'id/with space')} onSelect={select}>Credit</ModuleLink>);
  const link = screen.getByRole('link', { name: 'Credit' });
  expect(link).toHaveAttribute('href', '/kredit?credit=id%2Fwith+space');
  fireEvent.click(link, { ctrlKey: true });
  fireEvent.click(link, { metaKey: true });
  expect(select).not.toHaveBeenCalled();
  fireEvent.click(link);
  expect(select).toHaveBeenCalledOnce();
});

it('supports keyboard tabs without adding every tab to the tab order', () => {
  function Example() {
    const [value, setValue] = useState('a');
    return <Tabs items={[["a", "First"], ["b", "Second"], ["c", "Third"]]} value={value} onChange={setValue} />;
  }
  render(<Example />);
  const first = screen.getByRole('tab', { name: 'First' });
  first.focus();
  fireEvent.keyDown(first, { key: 'ArrowRight' });
  expect(screen.getByRole('tab', { name: 'Second' })).toHaveFocus();
  expect(first).toHaveAttribute('tabindex', '-1');
  fireEvent.keyDown(document.activeElement, { key: 'End' });
  expect(screen.getByRole('tab', { name: 'Third' })).toHaveAttribute('aria-selected', 'true');
  fireEvent.keyDown(document.activeElement, { key: 'Home' });
  expect(first).toHaveFocus();
});

it('keeps empty headers, explicit numeric alignment and keyboard row actions', () => {
  const columns = [{ key: 'name', label: 'Name' }, { key: 'amount', label: 'Amount', align: 'right', mobileHidden: true }];
  const select = vi.fn();
  const view = render(<DataTable columns={columns} rows={[]} label="Registry" />);
  expect(screen.getAllByRole('columnheader')).toHaveLength(2);
  expect(screen.getByRole('region', { name: 'Registry' })).toHaveAttribute('tabindex', '0');
  view.rerender(<DataTable columns={columns} rows={[{ name: <button>Action</button>, amount: '1,000.00' }]} onRowClick={select} />);
  expect(screen.getByText('1,000.00')).toHaveClass('is-numeric', 'mobile-hidden');
  fireEvent.click(screen.getByText('Action'));
  expect(select).not.toHaveBeenCalled();
  fireEvent.keyDown(screen.getAllByRole('row')[1], { key: 'Enter' });
  expect(select).toHaveBeenCalledOnce();
});
