import { act, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { useModuleNavigation } from '../shared/hooks/useModuleNavigation';

describe('module navigation', () => {
  it('normalizes a historical URL while preserving its selected record', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/sifarisler?order=ORD-12']}>{children}</MemoryRouter>;
    const { result } = renderHook(useModuleNavigation, { wrapper });
    await waitFor(() => expect(result.current.location.pathname).toBe('/satis/sifarisler'));
    expect(result.current.active).toBe('sales');
    expect(result.current.location.search).toBe('?order=ORD-12');
  });

  it('clears previous record selection when changing modules', async () => {
    const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/kredit?credit=KRD-12']}>{children}</MemoryRouter>;
    const { result } = renderHook(useModuleNavigation, { wrapper });
    act(() => result.current.setActive('hr'));
    await waitFor(() => expect(result.current.active).toBe('hr'));
    expect(result.current.location.pathname).toBe('/hr/emekdaslar');
    expect(result.current.location.search).toBe('');
  });
});