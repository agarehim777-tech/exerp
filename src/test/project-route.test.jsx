import { render, screen } from '@testing-library/react';
import { expect, it } from 'vitest';
import { moduleFromPath, moduleRoutes, pathForModule } from '../config/routes.js';
import { navItems } from '../data.js';
import { pageMeta } from '../config/page-meta.js';
import { ProjectsPage } from '../modules/projects/ProjectsPage.jsx';

it('exposes the existing ROI screen through a consistent navigation and route contract', () => {
  expect(moduleRoutes.projects).toBe('/layiheler');
  expect(moduleFromPath('/layiheler')).toBe('projects');
  expect(pathForModule('projects')).toBe('/layiheler');
  expect(navItems.find(item => item.id === 'projects')).toMatchObject({ label: 'Layihə ROI', group: 'analytics' });
  expect(pageMeta.projects.action).toBe('ROI export');
  render(<ProjectsPage projects={[]} />);
  expect(screen.getByTestId('project-roi-control-panel')).toBeVisible();
  expect(screen.getByText('Layihə və kampaniya ROI')).toBeVisible();
});

it('explains an empty portfolio instead of showing zero cards and empty tables', () => {
  render(<ProjectsPage projects={[]} />);
  expect(screen.getByText(/Satış sifarişi və ya xərc yaranan kimi/)).toBeVisible();
  expect(screen.queryByText('Orta ROI')).toBeNull();
  expect(screen.queryByText('Axtarışa uyğun məlumat tapılmadı')).toBeNull();
});

it('shows one card row in Azerbaijani and folds collection and risk into it', () => {
  const project = {
    id: 'P1', name: 'Yaz kampaniyası', owner: 'Satış', start: '2026-03-01', end: '2026-05-31',
    budget: 1000, revenue: 2000, collected: 1500, orders: 4, collectionRate: 75, totalCost: 800,
    committedCost: 900, profit: 1200, projectedProfit: 1100, roi: 150, status: 'Rentabel', nextAction: 'Davam et',
    productCost: 600, approvedExpenseCost: 200, pendingExpenseCost: 100, budgetUsage: 90,
  };
  render(<ProjectsPage projects={[project]} />);
  expect(screen.getByTestId('project-roi-control-panel')).toBeVisible();
  for (const label of ['Gəlir', 'Xərc', 'Mənfəət', 'Orta ROI', 'Xərc bölgüsü', 'Son ROI hesabatı']) {
    expect(screen.getAllByText(label).length).toBeGreaterThan(0);
  }
  for (const english of ['Committed xərc', 'Report status', 'breakdown', 'Budget usage']) {
    expect(screen.queryByText(new RegExp(english, 'i'))).toBeNull();
  }
  expect(screen.getAllByText('Yaz kampaniyası')).toHaveLength(2);
});
