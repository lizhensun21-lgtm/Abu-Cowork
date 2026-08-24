// @vitest-environment happy-dom

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { ProjectGraph } from '@/project-management/domain';
import type {
  UpdateMilestoneCommand,
  UpdateProjectCommand,
  UpdateProjectTimelineCommand,
} from '@/project-management/application';
import { TimelineRenderer } from '../timeline/TimelineRenderer';
import { ProjectManagementDrawer } from './ProjectManagementDrawer';

function graphFixture(): ProjectGraph {
  return {
    projects: [{ id: 'p1', name: 'Alpha', projectCode: 'A-1', projectStatus: 'active', startDate: '2026-01-01', endDate: '2026-12-31', description: 'Project description' }],
    projectTimelines: [
      { id: 'yd', projectId: 'p1', lane: 'YD', name: 'YD delivery', startDate: '2026-01-01', endDate: '2026-12-31', keyResources: ['Alex'] },
      { id: 'oem', projectId: 'p1', lane: 'OEM', name: 'OEM plan', startDate: '2026-03-01', endDate: '2026-10-01', keyResources: [] },
    ],
    milestones: [{ id: 'm1', projectId: 'p1', timelineId: 'yd', lane: 'YD', title: 'Gate', date: '2026-04-01', code: 'G1', status: 'at_risk', note: 'Watch' }],
    persons: [{ id: 'person', name: 'Alex' }, { id: 'available', name: 'Bo', title: 'Engineer' }],
    projectMemberships: [{ id: 'p1::person', projectId: 'p1', personId: 'person', roles: ['project_manager'], status: 'active' }],
    projectTeams: [{ projectId: 'p1' }],
  };
}

describe('Project Management Drawer shell', () => {
  it('does not expose mutation actions when opened without write callbacks', () => {
    render(<ProjectManagementDrawer graph={graphFixture()} target={{ kind: 'project', projectId: 'p1' }} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: 'Edit' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
  });
  it('opens one Project Drawer, keeps internal clicks open, and closes on outside pointer or Escape', () => {
    render(<TimelineRenderer graph={graphFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    expect(screen.getAllByTestId('pm-drawer')).toHaveLength(1);
    fireEvent.pointerDown(screen.getByTestId('pm-drawer'));
    expect(screen.getByTestId('pm-drawer')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('pm-drawer-backdrop'));
    expect(screen.queryByTestId('pm-drawer')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('pm-drawer')).not.toBeInTheDocument();
  });

  it('uses transient Project edit state, Cancel discards, validation blocks, and Save emits one command', async () => {
    const onUpdateProject = vi.fn<(command: UpdateProjectCommand) => Promise<void>>(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} onUpdateProject={onUpdateProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Project');
    fireEvent.change(name, { target: { value: 'Draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(within(screen.getByTestId('pm-drawer')).getByRole('heading', { name: 'Alpha' })).toBeInTheDocument();
    expect(onUpdateProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2027-01-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdateProject).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-02-01' } });
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'Saved' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUpdateProject).toHaveBeenCalledOnce());
    expect(onUpdateProject.mock.calls[0][0]).toMatchObject({
      projectId: 'p1', values: { name: 'Saved', startDate: '2026-02-01', endDate: '2026-12-31' },
    });
  });

  it('preserves an edit draft and blocks save when the entity changes externally', () => {
    const onUpdateProject = vi.fn<(command: UpdateProjectCommand) => Promise<void>>(async () => undefined);
    const graph = graphFixture();
    const { rerender } = render(<TimelineRenderer graph={graph} onUpdateProject={onUpdateProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.change(screen.getByLabelText('Project'), { target: { value: 'My draft' } });
    const changed = structuredClone(graph);
    changed.projects[0].description = 'External';
    rerender(<TimelineRenderer graph={changed} onUpdateProject={onUpdateProject} />);
    expect(screen.getByLabelText('Project')).toHaveValue('My draft');
    expect(screen.getByText(/changed while you were editing/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onUpdateProject).not.toHaveBeenCalled();
  });

  it('keeps the Drawer and draft open on save failure and prevents double submit while pending', async () => {
    let rejectSave: ((error: Error) => void) | undefined;
    const onUpdateProject = vi.fn<(command: UpdateProjectCommand) => Promise<void>>(
      () => new Promise<void>((_resolve, reject) => { rejectSave = reject; }),
    );
    render(<TimelineRenderer graph={graphFixture()} onUpdateProject={onUpdateProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const name = screen.getByLabelText('Project');
    fireEvent.change(name, { target: { value: 'Unsaved draft' } });
    const save = screen.getByRole('button', { name: 'Save' });
    fireEvent.click(save);
    fireEvent.click(save);
    expect(onUpdateProject).toHaveBeenCalledOnce();
    expect(name).toBeDisabled();
    rejectSave?.(new Error('repository failed'));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('repository failed'));
    expect(screen.getByTestId('pm-drawer')).toBeInTheDocument();
    expect(screen.getByLabelText('Project')).toHaveValue('Unsaved draft');
  });

  it('emits Timeline edits with readonly lane and unchanged relationship identity', async () => {
    const onUpdateTimeline = vi.fn<(command: UpdateProjectTimelineCommand) => Promise<void>>(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} onUpdateProjectTimeline={onUpdateTimeline} />);
    fireEvent.click(screen.getByRole('button', { name: 'OEM plan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    expect(screen.getByText('OEM')).toBeInTheDocument();
    expect(screen.queryByLabelText('Lane')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Start date'), { target: { value: '2026-06-01' } });
    fireEvent.change(screen.getByLabelText('End date'), { target: { value: '2026-06-01' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUpdateTimeline).toHaveBeenCalledOnce());
    expect(onUpdateTimeline.mock.calls[0][0]).toMatchObject({
      timelineId: 'oem', projectId: 'p1', startDate: '2026-06-01', endDate: '2026-06-01',
    });
  });

  it('emits Milestone date and Domain status edits with readonly relations', async () => {
    const onUpdateMilestone = vi.fn<(command: UpdateMilestoneCommand) => Promise<void>>(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} onUpdateMilestone={onUpdateMilestone} />);
    fireEvent.click(document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const drawer = screen.getByTestId('pm-drawer');
    fireEvent.change(within(drawer).getByLabelText('Planned date'), { target: { value: '2026-05-01' } });
    fireEvent.change(within(drawer).getByLabelText('Status'), { target: { value: 'blocked' } });
    fireEvent.click(within(drawer).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(onUpdateMilestone).toHaveBeenCalledOnce());
    expect(onUpdateMilestone.mock.calls[0][0]).toMatchObject({
      milestoneId: 'm1', projectId: 'p1', timelineId: 'yd',
      values: { date: '2026-05-01', status: 'blocked' },
    });
  });

  it('opens Timeline and Milestone Drawers from explicit entries and exposes only domain statuses', () => {
    render(<TimelineRenderer graph={graphFixture()} onUpdateMilestone={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'OEM plan' }));
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Timeline details/);
    expect(screen.getByText('OEM')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('pm-drawer-backdrop'));

    fireEvent.click(document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!);
    expect(screen.getByTestId('pm-drawer')).toHaveAccessibleName(/Milestone details/);
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    const drawer = screen.getByTestId('pm-drawer');
    const status = within(drawer).getByLabelText('Status');
    expect(within(status).getByRole('option', { name: 'At risk' })).toHaveValue('at_risk');
    expect(status).not.toContainHTML('current_focus');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Relationships' }));
    const relations = within(drawer).getByRole('region', { name: 'Relationships' });
    expect(within(relations).getByText('Alpha')).toBeInTheDocument();
    expect(within(relations).getByText('YD delivery')).toBeInTheDocument();
    expect(within(relations).queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('uses compact accordion sections, localized status labels, and natural readonly details', () => {
    render(<TimelineRenderer graph={graphFixture()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    const projectDrawer = screen.getByTestId('pm-drawer');
    expect(within(projectDrawer).getByRole('button', { name: 'Project overview' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(projectDrawer).getByRole('button', { name: 'Project information' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(projectDrawer).getByRole('button', { name: 'Team members' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(projectDrawer).getByRole('button', { name: 'Milestones' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(projectDrawer).queryByRole('textbox')).not.toBeInTheDocument();

    fireEvent.pointerDown(screen.getByTestId('pm-drawer-backdrop'));
    fireEvent.click(document.querySelector<HTMLElement>('[data-milestone-id="m1"]')!);
    const milestoneDrawer = screen.getByTestId('pm-drawer');
    expect(within(milestoneDrawer).getByText('At risk')).toBeInTheDocument();
    expect(within(milestoneDrawer).queryByText('at_risk')).not.toBeInTheDocument();
    expect(within(milestoneDrawer).getByRole('button', { name: 'Basic information' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(milestoneDrawer).getByRole('button', { name: 'Plan' })).toHaveAttribute('aria-expanded', 'true');
    expect(within(milestoneDrawer).getByRole('button', { name: 'Relationships' })).toHaveAttribute('aria-expanded', 'false');
    expect(within(milestoneDrawer).getByRole('button', { name: 'Notes' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('presents formal members and emits scoped Team commands without Account defaults', async () => {
    const onAddMember = vi.fn(async () => undefined);
    const onRemoveMember = vi.fn(async () => undefined);
    const onChangeMemberRoles = vi.fn(async () => undefined);
    const onSetProjectManager = vi.fn(async () => undefined);
    const graph = graphFixture();
    graph.projectMemberships.push({ id: 'p1::available', projectId: 'p1', personId: 'available', roles: ['member'], status: 'active' });
    graph.persons.push({ id: 'candidate', name: 'Casey' });
    render(<TimelineRenderer graph={graph} onAddMember={onAddMember} onRemoveMember={onRemoveMember} onChangeMemberRoles={onChangeMemberRoles} onSetProjectManager={onSetProjectManager} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    const drawer = screen.getByTestId('pm-drawer');
    fireEvent.click(within(drawer).getByRole('button', { name: 'Team members' }));
    expect(within(drawer).getAllByText('Alex').length).toBeGreaterThan(0);
    expect(within(drawer).getAllByText('A').length).toBeGreaterThan(0);

    fireEvent.click(within(drawer).getByRole('button', { name: 'Add member' }));
    fireEvent.change(within(drawer).getByLabelText('Available people'), { target: { value: 'candidate' } });
    fireEvent.click(within(drawer).getAllByRole('button', { name: 'Add member' }).at(-1)!);
    await waitFor(() => expect(onAddMember).toHaveBeenCalledWith({ projectId: 'p1', personId: 'candidate' }));

    fireEvent.change(within(drawer).getByLabelText('Change role: Alex'), { target: { value: 'test_owner' } });
    await waitFor(() => expect(onChangeMemberRoles).toHaveBeenCalledWith({ projectId: 'p1', personId: 'person', roles: ['project_manager', 'test_owner'] }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Set as Project Manager: Bo' }));
    await waitFor(() => expect(onSetProjectManager).toHaveBeenCalledWith({ projectId: 'p1', personId: 'available' }));
    fireEvent.click(within(drawer).getByRole('button', { name: 'Remove member: Alex' }));
    await waitFor(() => expect(onRemoveMember).toHaveBeenCalledWith({ projectId: 'p1', personId: 'person' }));
    expect(JSON.stringify(onAddMember.mock.calls)).not.toMatch(/account|currentUser|profile/i);
  });

  it('does not change Timeline viewport geometry while opening and closing a Drawer', () => {
    render(<TimelineRenderer graph={graphFixture()} />);
    const workspace = screen.getByTestId('project-timeline-workspace');
    const container = screen.getByTestId('timeline-scroll-container');
    const before = {
      start: workspace.dataset.timelineStartDate,
      end: workspace.dataset.timelineEndDate,
      scale: workspace.dataset.timelineScale,
    };
    container.scrollLeft = 240;
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(container.scrollLeft).toBe(240);
    expect({ start: workspace.dataset.timelineStartDate, end: workspace.dataset.timelineEndDate, scale: workspace.dataset.timelineScale }).toEqual(before);
  });

  it('confirms aggregate Project deletion with affected counts and closes the Drawer on success', async () => {
    const onDeleteProject = vi.fn(async () => undefined);
    render(<TimelineRenderer graph={graphFixture()} onDeleteProject={onDeleteProject} />);
    fireEvent.click(screen.getByRole('button', { name: 'Alpha' }));
    fireEvent.click(within(screen.getByTestId('pm-drawer')).getByRole('button', { name: 'Delete' }));
    expect(screen.getByText(/2 timelines, 1 milestones, and 1 team memberships/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole('button', { name: 'Delete' }).at(-1)!);
    await waitFor(() => expect(onDeleteProject).toHaveBeenCalledOnce());
    expect(onDeleteProject).toHaveBeenCalledWith({ projectId: 'p1' });
    expect(screen.queryByTestId('pm-drawer')).not.toBeInTheDocument();
  });
});
