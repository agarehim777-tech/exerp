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
