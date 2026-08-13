import { StrictMode } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/i18n';
import type { ProjectManagementState } from '@/project-management/state';
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
    expect(screen.getByRole('status')).toHaveTextContent('Initializing project management…');
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

  it('renders initialization failure instead of the ready empty state', () => {
    runtime.state = {
      ...runtime.state,
      initializationStatus: 'error',
      error: 'Repository load failed',
    };
    render(<ProjectManagementWorkspace />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'Project management could not be initialized.',
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
