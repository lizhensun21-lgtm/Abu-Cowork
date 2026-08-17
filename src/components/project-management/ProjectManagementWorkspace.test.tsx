import { Profiler, StrictMode } from 'react';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setLanguage } from '@/i18n';
import type { ProjectManagementState } from '@/project-management/state';
import { projectMembershipId } from '@/project-management/domain';
import ProjectManagementWorkspace from './ProjectManagementWorkspace';

const runtime = vi.hoisted(() => ({
  initialize: vi.fn<() => Promise<void>>(),
  moveMilestone: vi.fn<() => Promise<void>>(),
  moveTimeline: vi.fn<() => Promise<void>>(),
  resizeTimeline: vi.fn<() => Promise<void>>(),
  updateProject: vi.fn<() => Promise<void>>(),
  updateTimeline: vi.fn<() => Promise<void>>(),
  updateMilestone: vi.fn<() => Promise<void>>(),
  createProject: vi.fn<() => Promise<void>>(),
  createTimeline: vi.fn<() => Promise<void>>(),
  createMilestone: vi.fn<() => Promise<void>>(),
  deleteProject: vi.fn<() => Promise<void>>(),
  deleteTimeline: vi.fn<() => Promise<void>>(),
  deleteMilestone: vi.fn<() => Promise<void>>(),
  addMember: vi.fn<() => Promise<void>>(),
  removeMember: vi.fn<() => Promise<void>>(),
  changeMemberRoles: vi.fn<() => Promise<void>>(),
  setManager: vi.fn<() => Promise<void>>(),
  selectorCalls: 0,
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
  moveProjectManagementMilestone: runtime.moveMilestone,
  moveProjectManagementTimeline: runtime.moveTimeline,
  resizeProjectManagementTimeline: runtime.resizeTimeline,
  updateProjectManagementProject: runtime.updateProject,
  updateProjectManagementTimeline: runtime.updateTimeline,
  updateProjectManagementMilestone: runtime.updateMilestone,
  createProjectManagementProject: runtime.createProject,
  createProjectManagementTimeline: runtime.createTimeline,
  createProjectManagementMilestone: runtime.createMilestone,
  deleteProjectManagementProject: runtime.deleteProject,
  deleteProjectManagementTimeline: runtime.deleteTimeline,
  deleteProjectManagementMilestone: runtime.deleteMilestone,
  addProjectManagementMember: runtime.addMember,
  removeProjectManagementMember: runtime.removeMember,
  changeProjectManagementMemberRoles: runtime.changeMemberRoles,
  setProjectManagementManager: runtime.setManager,
  useProjectManagementStore: <T,>(selector: (state: ProjectManagementState) => T) => {
    runtime.selectorCalls += 1;
    return selector(runtime.state);
  },
}));

describe('ProjectManagementWorkspace runtime bootstrap', () => {
  beforeEach(() => {
    setLanguage('en-US');
    runtime.initialize.mockReset().mockResolvedValue(undefined);
    runtime.moveMilestone.mockReset().mockResolvedValue(undefined);
    runtime.moveTimeline.mockReset().mockResolvedValue(undefined);
    runtime.resizeTimeline.mockReset().mockResolvedValue(undefined);
    runtime.updateProject.mockReset().mockResolvedValue(undefined);
    runtime.updateTimeline.mockReset().mockResolvedValue(undefined);
    runtime.updateMilestone.mockReset().mockResolvedValue(undefined);
    runtime.createProject.mockReset().mockResolvedValue(undefined);
    runtime.createTimeline.mockReset().mockResolvedValue(undefined);
    runtime.createMilestone.mockReset().mockResolvedValue(undefined);
    runtime.deleteProject.mockReset().mockResolvedValue(undefined);
    runtime.deleteTimeline.mockReset().mockResolvedValue(undefined);
    runtime.deleteMilestone.mockReset().mockResolvedValue(undefined);
    runtime.addMember.mockReset().mockResolvedValue(undefined);
    runtime.removeMember.mockReset().mockResolvedValue(undefined);
    runtime.changeMemberRoles.mockReset().mockResolvedValue(undefined);
    runtime.setManager.mockReset().mockResolvedValue(undefined);
    runtime.selectorCalls = 0;
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

  it('renders a ready ProjectGraph with real relationships and the CRUD entry', () => {
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
    expect(screen.getByTestId('project-manager-project-1')).toHaveTextContent('A');
    expect(screen.getByRole('img', { name: '1 / 1 milestones completed' })).toBeInTheDocument();
    expect(screen.getByTestId('project-timeline-workspace')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-bar-timeline-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create project' })).toBeInTheDocument();
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
    expect(screen.getByTestId('project-manager-project-1').querySelector('svg')).not.toBeNull();
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

  it('keeps create draft transient and discards it on cancel', () => {
    runtime.state = { ...runtime.state, initializationStatus: 'ready' };
    const originalGraph = runtime.state.graph;
    render(<ProjectManagementWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'Draft only' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(runtime.createProject).not.toHaveBeenCalled();
    expect(runtime.state.graph).toBe(originalGraph);
  });

  it('keeps 20-character Create input bounded, transient, and closable through both controls', async () => {
    const user = userEvent.setup();
    runtime.state = { ...runtime.state, initializationStatus: 'ready' };
    const originalGraph = runtime.state.graph;
    let subtreeCommits = 0;
    render(<Profiler id="project-management" onRender={() => { subtreeCommits += 1; }}><ProjectManagementWorkspace /></Profiler>);
    const initialSelectorCalls = runtime.selectorCalls;

    await user.click(screen.getByRole('button', { name: 'Create project' }));
    const commitsBeforeTyping = subtreeCommits;
    await user.type(screen.getByLabelText('Project'), '12345678901234567890');

    expect(screen.getByLabelText('Project')).toHaveValue('12345678901234567890');
    expect(subtreeCommits - commitsBeforeTyping).toBeLessThanOrEqual(20);
    expect(runtime.selectorCalls).toBe(initialSelectorCalls);
    expect(runtime.createProject).not.toHaveBeenCalled();
    expect(runtime.state.graph).toBe(originalGraph);
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('dialog', { name: 'Create project' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Create project' }));
    const dialog = screen.getByRole('dialog', { name: 'Create project' });
    await user.type(within(dialog).getByLabelText('Project'), 'Close remains active');
    await user.click(within(dialog).getByRole('button', { name: 'Create project' }));
    expect(screen.queryByRole('dialog', { name: 'Create project' })).not.toBeInTheDocument();
    expect(runtime.createProject).not.toHaveBeenCalled();
    expect(runtime.state.graph).toBe(originalGraph);
  });

  it('submits the two-step Project flow through the application command', async () => {
    runtime.state = { ...runtime.state, initializationStatus: 'ready' };
    render(<ProjectManagementWorkspace />);
    fireEvent.click(screen.getByRole('button', { name: 'Create project' }));
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'Created Project' } });
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-12-31' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(screen.getByText('The required YD timeline will be created automatically with the project dates.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(runtime.createProject).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Created Project', startDate: '2026-09-01', endDate: '2026-12-31', projectStatus: 'planning',
    })));
  });
});
