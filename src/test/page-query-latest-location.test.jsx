import { act, fireEvent, render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { afterEach, expect, it } from 'vitest';
import { PageQueryProvider, usePageQuery } from '../shared/hooks/usePageQuery.jsx';

function SearchBox() {
  const [query, update] = usePageQuery({ q: '' });
  return <input aria-label="Axtarış" value={query.q} onChange={(event) => update({ q: event.target.value }, { replace: true })} />;
}

afterEach(() => window.history.replaceState(null, '', '/'));

it('writes the page query onto the current URL even before the router has committed it', () => {
  window.history.replaceState(null, '', '/satis?order=O-1');
  render(<BrowserRouter><PageQueryProvider scope="tenant-a"><SearchBox /></PageQueryProvider></BrowserRouter>);
  // A sidebar click moved the browser to the credits module; BrowserRouter commits that inside a
  // transition, so the router can still report /satis when the user starts typing.
  act(() => window.history.pushState(null, '', '/kreditler'));
  fireEvent.change(screen.getByLabelText('Axtarış'), { target: { value: 'İN-1005' } });
  expect(window.location.pathname).toBe('/kreditler');
  expect(new URLSearchParams(window.location.search).get('q')).toBe('İN-1005');
});

it('keeps the router basename when it resolves the current URL', () => {
  window.history.replaceState(null, '', '/app/satis');
  render(<BrowserRouter basename="/app"><PageQueryProvider scope="tenant-a"><SearchBox /></PageQueryProvider></BrowserRouter>);
  act(() => window.history.pushState(null, '', '/app/kreditler?size=25'));
  fireEvent.change(screen.getByLabelText('Axtarış'), { target: { value: 'abc' } });
  expect(window.location.pathname).toBe('/app/kreditler');
  expect(window.location.search).toBe('?size=25&q=abc');
});
