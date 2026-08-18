import { fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLanguage } from '@/i18n';
import type { ProjectGraph } from '@/project-management/domain';
import {
  createProjectManagementPerson,
  deleteProjectManagementPerson,
  updateProjectManagementPerson,
} from '@/project-management/state';
import ProjectManagementPortalModules from './ProjectManagementPortalModules';

const fixture: ProjectGraph = {
  projects: [
    { id: 'p-a', name: 'Alpha', projectCode: 'A-01', projectStatus: 'active', startDate: '2026-07-01', endDate: '2026-11-30' },
    { id: 'p-b', name: 'Beta', projectStatus: 'planning', startDate: '2026-08-01', endDate: '2026-12-31' },
  ],
  projectTimelines: [
    { id: 'a-yd', projectId: 'p-a', lane: 'YD', name: 'Alpha YD', startDate: '2026-07-01', endDate: '2026-11-30', keyResources: ['OEM Lab'] },
    { id: 'b-yd', projectId: 'p-b', lane: 'YD', name: 'Beta YD', startDate: '2026-08-01', endDate: '2026-12-31', keyResources: ['OEM Lab'] },
  ],
  milestones: [
    { id: 'm-a', projectId: 'p-a', timelineId: 'a-yd', lane: 'YD', title: 'Design freeze', code: 'G2', date: '2026-08-17', status: 'in_progress' },
    { id: 'm-b', projectId: 'p-b', timelineId: 'b-yd', lane: 'YD', title: 'Kickoff', code: 'G0', date: '2026-08-17', status: 'completed' },
  ],
  persons: [{ id: 'person', name: 'Morgan', title: 'Program Lead' }],
  projectMemberships: [{ id: 'pm:3:p-a:6:person', projectId: 'p-a', personId: 'person', roles: ['project_manager'], status: 'active' }],
  projectTeams: [{ projectId: 'p-a' }, { projectId: 'p-b' }],
};
let currentFixture = fixture;

vi.mock('@/project-management/state', () => ({
  createProjectManagementPerson: vi.fn(() => Promise.resolve()),
  deleteProjectManagementPerson: vi.fn(() => Promise.resolve()),
  initializeProjectManagement: vi.fn(() => Promise.resolve()),
  updateProjectManagementMilestone: vi.fn(() => Promise.resolve()),
  updateProjectManagementPerson: vi.fn(() => Promise.resolve()),
  updateProjectManagementProject: vi.fn(() => Promise.resolve()),
  updateProjectManagementTimeline: vi.fn(() => Promise.resolve()),
  useProjectManagementStore: (selector: (state: unknown) => unknown) => selector({ graph: currentFixture, initializationStatus: 'ready', error: null }),
}));

describe('ProjectManagementPortalModules', () => {
  beforeEach(() => {
    setLanguage('en-US');
    currentFixture = fixture;
    vi.clearAllMocks();
  });

  it('shows the empty formal Person pool with a real create entry point', () => {
    currentFixture = { ...fixture, persons: [], projectMemberships: [] };
    render(<ProjectManagementPortalModules view="members" />);
    expect(screen.getByText('No members')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add member' })).toBeInTheDocument();
  });

  it('renders exact-date milestone stacks, navigates months, and opens formal drawers', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-08-17T12:00:00.000Z'));
    try {
      const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
      render(<ProjectManagementPortalModules view="calendar" />);
      const day = document.querySelector('[data-today="true"]');
      expect(day).not.toBeNull();
      expect(within(day as HTMLElement).getByRole('button', { name: /Design freeze/ })).toBeInTheDocument();
      expect(within(day as HTMLElement).getByRole('button', { name: /Kickoff/ })).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: 'Previous month' }));
      expect(screen.getByText('July 2026')).toBeInTheDocument();
      await user.click(screen.getByRole('button', { name: 'Today' }));
      expect(screen.getByText('August 2026')).toBeInTheDocument();

      await user.click(screen.getByRole('button', { name: /Design freeze/ }));
      expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Milestone details: Design freeze/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('searches and filters Ledger, then opens the Project drawer from a row', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="ledger" />);
    expect(screen.getByText('A-01')).toBeInTheDocument();
    await user.type(screen.getByPlaceholderText('Search project name or code'), 'Beta');
    expect(screen.queryByText('Alpha')).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Beta').closest('tr')!);
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Project details: Beta/);
  });

  it('groups formal resource text and navigates related Timeline and Project entities', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="resources" />);
    expect(screen.getByText('2 projects · 2 timelines')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Alpha YD Alpha · YD' }));
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Timeline details: Alpha YD/);
  });

  it('uses only the Person pool, presents active roles, and links member detail to Project', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="members" />);
    expect(screen.getByText('Morgan')).toBeInTheDocument();
    expect(screen.getByText('Project Manager')).toBeInTheDocument();
    expect(screen.queryByText(/Account/)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /Morgan/ }));
    const detail = screen.getByRole('complementary', { name: /Member details: Morgan/ });
    await user.click(within(detail).getByRole('button', { name: /Alpha/ }));
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Project details: Alpha/);
  });

  it('creates a formal Person from transient Members form state', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="members" />);
    await user.click(screen.getByRole('button', { name: 'Add member' }));
    const dialog = screen.getByRole('dialog', { name: 'Create person' });
    await user.type(within(dialog).getByLabelText('Name'), 'Taylor');
    await user.type(within(dialog).getByLabelText('Title (optional)'), 'Engineer');
    await user.click(within(dialog).getByRole('button', { name: 'Create person' }));
    expect(createProjectManagementPerson).toHaveBeenCalledOnce();
    expect(createProjectManagementPerson).toHaveBeenCalledWith({ name: 'Taylor', title: 'Engineer' });
  });

  it('edits a Person through the application command without account mapping', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="members" />);
    await user.click(screen.getByRole('button', { name: /Morgan/ }));
    await user.click(screen.getByRole('button', { name: 'Edit person' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit person' });
    const name = within(dialog).getByLabelText('Name');
    await user.clear(name);
    await user.type(name, 'Morgan Lee');
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));
    expect(updateProjectManagementPerson).toHaveBeenCalledWith({
      personId: 'person',
      expected: { name: 'Morgan', title: 'Program Lead' },
      values: { name: 'Morgan Lee', title: 'Program Lead' },
    });
    expect(createProjectManagementPerson).not.toHaveBeenCalledWith(expect.objectContaining({ accountId: expect.anything() }));
  });

  it('asks for confirmation before deleting a Person through the protected command', async () => {
    const user = userEvent.setup();
    render(<ProjectManagementPortalModules view="members" />);
    await user.click(screen.getByRole('button', { name: /Morgan/ }));
    await user.click(screen.getByRole('button', { name: 'Delete person' }));
    const dialog = screen.getByRole('dialog', { name: 'Delete person' });
    expect(within(dialog).getByText(/Project Membership references cannot be deleted/)).toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: 'Delete person' }));
    expect(deleteProjectManagementPerson).toHaveBeenCalledWith({ personId: 'person' });
  });
});
