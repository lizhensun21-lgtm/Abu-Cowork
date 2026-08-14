import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/i18n';
import type { ProjectManagementState } from '@/project-management/state';
import { projectMembershipId } from '@/project-management/domain';
import ProjectManagementWorkspace from './ProjectManagementWorkspace';

const runtime = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  state: {
    graph: {
      projects: [],
      projectTimelines: [],
      milestones: [],
      persons: [],
      projectMemberships: [],
      projectTeams: [],
    },
    initializationStatus: 'uninitialized',
    error: null,
  } as ProjectManagementState,
}));

vi.mock('@/project-management/state', () => ({
  initializeProjectManagement: runtime.initialize,
  useProjectManagementStore: <T,>(selector: (state: ProjectManagementState) => T) => (
    selector(runtime.state)
  ),
}));

describe('ProjectManagementWorkspace runtime bootstrap', () => {
  beforeEach(() => {
    setLanguage('en-US');
    runtime.initialize.mockReset().mockResolvedValue(undefined);
    runtime.state = {
      graph: {
        projects: [],
        projectTimelines: [],
        milestones: [],
        persons: [],
        projectMemberships: [],
        projectTeams: [],
      },
      initializationStatus: 'uninitialized',
      error: null,
    };
  });

  it('requests runtime initialization when mounted', () => {
    render(<ProjectManagementWorkspace />);
    expect(runtime.initialize).toHaveBeenCalledOnce();
    expect(screen.getByRole('status')).toHaveTextContent('Initializing project overview…');
  });

  it('remains safe when StrictMode repeats the mount effect', () => {
    render(
      <StrictMode>
        <ProjectManagementWorkspace />
      </StrictMode>,
    );
    expect(runtime.initialize).toHaveBeenCalledTimes(2);
  });

  it('renders the formal empty state when runtime is ready with zero projects', () => {
    runtime.state = { ...runtime.state, initializationStatus: 'ready' };
    render(<ProjectManagementWorkspace />);

    expect(screen.getByText('No projects yet')).toBeInTheDocument();
    expect(runtime.state.graph.projects).toEqual([]);
  });

  it('renders a ready ProjectGraph as a read-only project list with real relationships', () => {
    runtime.state = {
      ...runtime.state,
      initializationStatus: 'ready',
      graph: {
        projects: [{
          id: 'project-1', name: 'Apollo', projectCode: 'PM-001',
          projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31',
        }],
        projectTimelines: [{
          id: 'timeline-1', projectId: 'project-1', lane: 'YD', name: 'YD',
          startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [],
        }],
        milestones: [{
          id: 'milestone-1', projectId: 'project-1', timelineId: 'timeline-1', lane: 'YD',
          title: 'Gate', date: '2026-03-01', code: 'G0', status: 'completed',
        }],
        persons: [{ id: 'person-1', name: 'Alex Chen' }],
        projectMemberships: [{
          id: projectMembershipId('project-1', 'person-1'),
          projectId: 'project-1', personId: 'person-1',
          roles: ['project_manager'], status: 'active',
        }],
        projectTeams: [{ projectId: 'project-1' }],
      },
    };
    render(<ProjectManagementWorkspace />);

    const row = screen.getByTestId('project-list-row-timeline-1');
    expect(row).toHaveTextContent('Apollo');
    expect(screen.getByTestId('project-manager-project-1')).toHaveAttribute('title', 'Alex Chen');
    expect(screen.getByRole('img', { name: '1 / 1 milestones completed' })).toBeInTheDocument();
    expect(screen.getByTestId('project-timeline-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bar-timeline-1')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /create|edit|delete/i })).not.toBeInTheDocument();
  });

  it('renders missing optional Project values as an em dash without an owner fallback', () => {
    runtime.state = {
      ...runtime.state,
      initializationStatus: 'ready',
      graph: {
        ...runtime.state.graph,
        projects: [{
          id: 'project-1', name: 'No owner', projectStatus: 'planning',
          startDate: '2026-01-01', endDate: '2026-12-31',
        }],
        projectTimelines: [{
          id: 'timeline-1', projectId: 'project-1', lane: 'YD', name: 'YD',
          startDate: '2026-01-01', endDate: '2026-12-31', keyResources: [],
        }],
        projectTeams: [{ projectId: 'project-1', externalProjectManager: 'Legacy Lead' }],
      },
    };
    render(<ProjectManagementWorkspace />);

    const row = screen.getByTestId('project-list-row-timeline-1');
    expect(row).not.toHaveTextContent('Legacy Lead');
    expect(screen.getByTestId('project-manager-project-1')).toHaveAttribute('title', '—');
    expect(screen.getByRole('img', { name: 'No milestone data' })).toBeInTheDocument();
  });

  it('renders initialization failure instead of the ready empty state', () => {
    runtime.state = {
      ...runtime.state,
      initializationStatus: 'error',
      error: 'Repository load failed',
    };
    render(<ProjectManagementWorkspace />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project overview could not be initialized.',
    );
    expect(screen.getByText('Repository load failed')).toBeInTheDocument();
    expect(screen.queryByText('No projects yet')).not.toBeInTheDocument();
  });

  it('retries through the public initialization command', () => {
    runtime.state = { ...runtime.state, initializationStatus: 'error' };
    render(<ProjectManagementWorkspace />);
    expect(runtime.initialize).toHaveBeenCalledOnce();

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(runtime.initialize).toHaveBeenCalledTimes(2);
  });
});
