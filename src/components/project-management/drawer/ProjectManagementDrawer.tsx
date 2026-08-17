import {
  useEffect, useMemo, useState,
  type CSSProperties, type FormEvent, type ReactNode,
} from 'react';
import { Box, Check, ChevronDown, ChevronRight, Crown, Edit3, GitBranch, Plus, Trash2, X } from 'lucide-react';

import { useI18n } from '@/i18n';
import {
  membershipRolePresentation, personInitial,
  type AddProjectMemberCommand, type ChangeProjectMemberRolesCommand,
  type RemoveProjectMemberCommand, type SetProjectManagerCommand,
  type UpdateMilestoneCommand, type UpdateProjectCommand, type UpdateProjectTimelineCommand,
} from '@/project-management/application';
import {
  MILESTONE_CODES, MILESTONE_STATUSES, PROJECT_ROLES, PROJECT_STATUSES,
  type MilestoneCode, type MilestoneStatus, type ProjectGraph, type ProjectRole, type ProjectStatus,
} from '@/project-management/domain';
import { MilestoneDiamond } from '../timeline/MilestoneDiamond';
import {
  getMilestoneStatusStyle, getMilestoneVisualStatus, milestoneStatusStyleToCssVariables,
} from '../timeline/milestoneVisualStatus';
import {
  projectManagementDrawerTargetKey, selectProjectManagementDrawerData,
  type ProjectManagementDrawerData, type ProjectManagementDrawerTarget,
} from './projectManagementDrawerData';

type DrawerDraft =
  | { kind: 'project'; name: string; projectCode: string; startDate: string; endDate: string; projectStatus: ProjectStatus; description: string }
  | { kind: 'timeline'; name: string; startDate: string; endDate: string; keyResources: string }
  | { kind: 'milestone'; title: string; code: MilestoneCode | ''; date: string; status: MilestoneStatus | ''; note: string };

type Translations = ReturnType<typeof useI18n>['t'];

function draftFor(data: ProjectManagementDrawerData): DrawerDraft {
  if (data.kind === 'project') return {
    kind: 'project', name: data.project.name, projectCode: data.project.projectCode ?? '',
    startDate: data.project.startDate, endDate: data.project.endDate,
    projectStatus: data.project.projectStatus, description: data.project.description ?? '',
  };
  if (data.kind === 'timeline') return {
    kind: 'timeline', name: data.timeline.name, startDate: data.timeline.startDate,
    endDate: data.timeline.endDate, keyResources: data.timeline.keyResources.join(', '),
  };
  return {
    kind: 'milestone', title: data.milestone.title, code: data.milestone.code,
    date: data.milestone.date, status: data.milestone.status ?? '', note: data.milestone.note ?? '',
  };
}

function dataRevision(data: ProjectManagementDrawerData) { return JSON.stringify(draftFor(data)); }
function optionalText(value: string) { return value.trim() || undefined; }

function projectStatusLabel(status: ProjectStatus, t: Translations) {
  return {
    planning: t.projectManagement.statusPlanning,
    active: t.projectManagement.statusActive,
    paused: t.projectManagement.statusPaused,
    closed: t.projectManagement.statusClosed,
    cancelled: t.projectManagement.statusCancelled,
  }[status];
}

function milestoneStatusLabel(status: MilestoneStatus, t: Translations) {
  return {
    unknown: t.projectManagement.drawerStatusUnknown,
    not_started: t.projectManagement.drawerStatusNotStarted,
    in_progress: t.projectManagement.drawerStatusInProgress,
    completed: t.projectManagement.drawerStatusCompleted,
    at_risk: t.projectManagement.drawerStatusAtRisk,
    delayed: t.projectManagement.drawerStatusDelayed,
    blocked: t.projectManagement.drawerStatusBlocked,
    paused: t.projectManagement.drawerStatusPaused,
  }[status];
}

function Detail({ label, children }: { label: string; children?: ReactNode }) {
  const value = children === undefined || children === null || children === '' ? '—' : children;
  return <div className="pm-drawer__detail"><dt>{label}</dt><dd>{value}</dd></div>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="pm-drawer__field"><span>{label}</span>{children}</label>;
}

function DrawerSection({ sectionKey, title, defaultExpanded, children }: {
  sectionKey: string; title: string; defaultExpanded: boolean; children: ReactNode;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const contentId = `${sectionKey}-content`;
  return <section className="pm-drawer-section" data-testid={`pm-drawer-section-${sectionKey}`}>
    <button type="button" className="pm-drawer-section__trigger" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((current) => !current)}>
      {expanded ? <ChevronDown size={15} aria-hidden="true" /> : <ChevronRight size={15} aria-hidden="true" />}
      <span>{title}</span>
    </button>
    {expanded ? <div id={contentId} className="pm-drawer-section__content" role="region" aria-label={title}>{children}</div> : null}
  </section>;
}

function ProjectStatusValue({ status }: { status: ProjectStatus }) {
  const { t } = useI18n();
  return <span className={`pm-drawer-status pm-drawer-status--${status}`}>{projectStatusLabel(status, t)}</span>;
}

function MilestoneStatusValue({ status }: { status?: MilestoneStatus }) {
  const { t } = useI18n();
  return status
    ? <span className={`pm-drawer-status pm-drawer-status--${status}`}>{milestoneStatusLabel(status, t)}</span>
    : <span>—</span>;
}

function EntityIcon({ data }: { data: ProjectManagementDrawerData }) {
  if (data.kind === 'project') return <Box size={17} aria-hidden="true" />;
  if (data.kind === 'timeline') return <GitBranch size={17} aria-hidden="true" />;
  const visualStatus = getMilestoneVisualStatus(data.milestone.status);
  return <MilestoneDiamond className="pm-drawer__milestone-icon" style={milestoneStatusStyleToCssVariables(getMilestoneStatusStyle(visualStatus)) as CSSProperties} />;
}

function MilestoneList({ data }: { data: Extract<ProjectManagementDrawerData, { kind: 'project' | 'timeline' }> }) {
  const { t } = useI18n();
  if (data.milestones.length === 0) return <p className="pm-drawer__empty">{t.projectManagement.drawerNoMilestones}</p>;
  return <div className="pm-drawer__milestone-list">{data.milestones.map((milestone) => <div className="pm-drawer__milestone-row" key={milestone.id}>
    <span>{milestone.code || '—'}</span><strong>{milestone.title}</strong><time>{milestone.date}</time>
  </div>)}</div>;
}

export function ProjectManagementDrawer({ graph, target, onClose, onUpdateProject, onUpdateTimeline, onUpdateMilestone, onAddMember, onRemoveMember, onChangeMemberRoles, onSetProjectManager, onAddTimeline, onAddMilestone, onRequestDelete }: {
  readonly graph: Readonly<ProjectGraph>;
  readonly target: ProjectManagementDrawerTarget;
  readonly onClose: () => void;
  readonly onUpdateProject?: (command: UpdateProjectCommand) => Promise<void>;
  readonly onUpdateTimeline?: (command: UpdateProjectTimelineCommand) => Promise<void>;
  readonly onUpdateMilestone?: (command: UpdateMilestoneCommand) => Promise<void>;
  readonly onAddMember?: (command: AddProjectMemberCommand) => Promise<void>;
  readonly onRemoveMember?: (command: RemoveProjectMemberCommand) => Promise<void>;
  readonly onChangeMemberRoles?: (command: ChangeProjectMemberRolesCommand) => Promise<void>;
  readonly onSetProjectManager?: (command: SetProjectManagerCommand) => Promise<void>;
  readonly onAddTimeline?: (projectId: string) => void;
  readonly onAddMilestone?: (projectId: string, timelineId: string) => void;
  readonly onRequestDelete?: (target: ProjectManagementDrawerTarget) => void;
}) {
  const { t } = useI18n();
  const data = useMemo(() => selectProjectManagementDrawerData(graph, target), [graph, target]);
  const canEdit = Boolean(onUpdateProject || onUpdateTimeline || onUpdateMilestone);
  const targetKey = projectManagementDrawerTargetKey(target);
  const [draft, setDraft] = useState<DrawerDraft | null>(null);
  const [baselineRevision, setBaselineRevision] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { setDraft(null); setBaselineRevision(''); setPending(false); setError(''); }, [targetKey]);
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || pending) return;
      event.preventDefault(); onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, pending]);

  if (!data) return null;
  const currentRevision = dataRevision(data);
  const externallyChanged = Boolean(draft && baselineRevision !== currentRevision);
  const beginEdit = () => { setDraft(draftFor(data)); setBaselineRevision(currentRevision); setError(''); };
  const cancelEdit = () => { if (!pending) { setDraft(null); setError(''); } };

  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!draft || pending) return;
    if (externallyChanged) { setError(t.projectManagement.drawerExternalChange); return; }
    setError(''); setPending(true);
    try {
      if (data.kind === 'project' && draft.kind === 'project' && onUpdateProject) {
        if (!draft.name.trim() || draft.startDate > draft.endDate) throw new Error(t.projectManagement.drawerInvalidInput);
        await onUpdateProject({ projectId: data.project.id, expected: data.project, values: {
          name: draft.name, projectCode: optionalText(draft.projectCode), startDate: draft.startDate,
          endDate: draft.endDate, projectStatus: draft.projectStatus, description: optionalText(draft.description),
        } });
      } else if (data.kind === 'timeline' && draft.kind === 'timeline' && onUpdateTimeline) {
        if (!draft.name.trim() || draft.startDate > draft.endDate) throw new Error(t.projectManagement.drawerInvalidInput);
        await onUpdateTimeline({ timelineId: data.timeline.id, projectId: data.timeline.projectId,
          expectedStartDate: data.timeline.startDate, expectedEndDate: data.timeline.endDate,
          expectedName: data.timeline.name, expectedKeyResources: data.timeline.keyResources,
          name: draft.name, startDate: draft.startDate, endDate: draft.endDate,
          keyResources: draft.keyResources.split(',').map((item) => item.trim()).filter(Boolean),
        });
      } else if (data.kind === 'milestone' && draft.kind === 'milestone' && onUpdateMilestone) {
        if (!draft.title.trim()) throw new Error(t.projectManagement.drawerInvalidInput);
        await onUpdateMilestone({ milestoneId: data.milestone.id, projectId: data.milestone.projectId,
          timelineId: data.milestone.timelineId, expected: data.milestone,
          values: { title: draft.title, code: draft.code, date: draft.date,
            status: draft.status || undefined, note: optionalText(draft.note) },
        });
      }
      setDraft(null);
    } catch (saveError: unknown) {
      setError(saveError instanceof Error ? saveError.message : t.projectManagement.drawerSaveError);
    } finally { setPending(false); }
  };

  const title = data.kind === 'project' ? data.project.name : data.kind === 'timeline' ? data.timeline.name : data.milestone.title;
  const kindLabel = data.kind === 'project' ? t.projectManagement.drawerProject : data.kind === 'timeline' ? t.projectManagement.drawerTimeline : t.projectManagement.drawerMilestone;
  return <div className="pm-drawer-backdrop" data-testid="pm-drawer-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <aside className="pm-drawer" data-testid="pm-drawer" data-project-management-drawer data-no-timeline-pan aria-label={`${kindLabel}: ${title}`} onPointerDown={(event) => event.stopPropagation()}>
      <header className="pm-drawer__header">
        <div className="pm-drawer__identity"><span className={`pm-drawer__entity-icon pm-drawer__entity-icon--${data.kind}`}><EntityIcon data={data} /></span><h2 title={title}>{title}</h2></div>
        {!draft && canEdit ? <button type="button" className="pm-drawer__edit" onClick={beginEdit}><Edit3 size={14} aria-hidden="true" />{t.projectManagement.drawerEdit}</button> : null}
      </header>
      <div className="pm-drawer__body">{draft ? <form onSubmit={save} className="pm-drawer__form">
        <DrawerEditSections key={`${targetKey}:edit`} data={data} draft={draft} pending={pending} onChange={setDraft} />
        {externallyChanged ? <p className="pm-drawer__warning" role="status">{t.projectManagement.drawerExternalChange}</p> : null}
        {error ? <p className="pm-drawer__error" role="alert">{error}</p> : null}
        <footer className="pm-drawer__actions"><button type="button" disabled={pending} onClick={cancelEdit}><X size={13} />{t.projectManagement.drawerCancel}</button><button type="submit" className="is-primary" disabled={pending}><Check size={13} />{pending ? t.projectManagement.drawerSaving : t.projectManagement.drawerSave}</button></footer>
      </form> : <DrawerView key={`${targetKey}:view`} data={data} onAddMember={onAddMember} onRemoveMember={onRemoveMember} onChangeMemberRoles={onChangeMemberRoles} onSetProjectManager={onSetProjectManager} />}</div>
      {!draft ? <footer className="pm-drawer__secondary-actions">
        {data.kind === 'project' && onAddTimeline && graph.projectTimelines.filter((item) => item.projectId === data.project.id && item.lane !== 'YD').length < 2 ? <button type="button" onClick={() => onAddTimeline(data.project.id)}>{t.projectManagement.addTimeline}</button> : null}
        {data.kind === 'timeline' && onAddMilestone ? <button type="button" onClick={() => onAddMilestone(data.project.id, data.timeline.id)}>{t.projectManagement.addMilestone}</button> : null}
        {data.kind === 'timeline' && data.timeline.lane === 'YD' ? <button type="button" disabled title={t.projectManagement.ydDeleteProhibited}>{t.projectManagement.deleteAction}</button> : onRequestDelete ? <button type="button" className="is-danger" onClick={() => onRequestDelete(target)}>{t.projectManagement.deleteAction}</button> : null}
      </footer> : null}
    </aside>
  </div>;
}

function DrawerEditSections({ data, draft, pending, onChange }: { data: ProjectManagementDrawerData; draft: DrawerDraft; pending: boolean; onChange: (draft: DrawerDraft) => void }) {
  const { t } = useI18n();
  if (data.kind === 'project' && draft.kind === 'project') return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="project-overview" title={t.projectManagement.drawerSectionOverview} defaultExpanded><Field label={t.projectManagement.drawerDescription}><textarea value={draft.description} disabled={pending} onChange={(event) => onChange({ ...draft, description: event.target.value })} /></Field></DrawerSection>
    <DrawerSection sectionKey="project-information" title={t.projectManagement.drawerSectionInformation} defaultExpanded><div className="pm-drawer__field-grid">
      <Field label={t.projectManagement.projectName}><input value={draft.name} disabled={pending} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field>
      <Field label={t.projectManagement.projectCode}><input value={draft.projectCode} disabled={pending} onChange={(event) => onChange({ ...draft, projectCode: event.target.value })} /></Field>
      <Field label={t.projectManagement.startDate}><input type="date" value={draft.startDate} disabled={pending} onChange={(event) => onChange({ ...draft, startDate: event.target.value })} /></Field>
      <Field label={t.projectManagement.endDate}><input type="date" value={draft.endDate} disabled={pending} onChange={(event) => onChange({ ...draft, endDate: event.target.value })} /></Field>
    </div><Field label={t.projectManagement.projectStatus}><select value={draft.projectStatus} disabled={pending} onChange={(event) => onChange({ ...draft, projectStatus: event.target.value as ProjectStatus })}>{PROJECT_STATUSES.map((status) => <option key={status} value={status}>{projectStatusLabel(status, t)}</option>)}</select></Field></DrawerSection>
    <DrawerSection sectionKey="project-team" title={t.projectManagement.drawerSectionTeam} defaultExpanded={false}><Detail label={t.projectManagement.projectManager}>{data.projectManager?.name}</Detail></DrawerSection>
    <DrawerSection sectionKey="project-milestones" title={t.projectManagement.drawerSectionMilestones} defaultExpanded={false}><MilestoneList data={data} /></DrawerSection>
  </div>;
  if (data.kind === 'timeline' && draft.kind === 'timeline') return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="timeline-basic" title={t.projectManagement.drawerSectionBasicInformation} defaultExpanded><Field label={t.projectManagement.drawerName}><input value={draft.name} disabled={pending} onChange={(event) => onChange({ ...draft, name: event.target.value })} /></Field><Detail label={t.projectManagement.drawerLane}>{data.timeline.lane}</Detail><Field label={t.projectManagement.drawerKeyResources}><input value={draft.keyResources} disabled={pending} onChange={(event) => onChange({ ...draft, keyResources: event.target.value })} /></Field></DrawerSection>
    <DrawerSection sectionKey="timeline-plan" title={t.projectManagement.drawerSectionPlan} defaultExpanded><div className="pm-drawer__field-grid"><Field label={t.projectManagement.startDate}><input type="date" value={draft.startDate} disabled={pending} onChange={(event) => onChange({ ...draft, startDate: event.target.value })} /></Field><Field label={t.projectManagement.endDate}><input type="date" value={draft.endDate} disabled={pending} onChange={(event) => onChange({ ...draft, endDate: event.target.value })} /></Field></div></DrawerSection>
    <DrawerSection sectionKey="timeline-relations" title={t.projectManagement.drawerSectionRelations} defaultExpanded={false}><Detail label={t.projectManagement.drawerProject}>{data.project.name}</Detail></DrawerSection>
    <DrawerSection sectionKey="timeline-milestones" title={t.projectManagement.drawerSectionMilestones} defaultExpanded={false}><MilestoneList data={data} /></DrawerSection>
  </div>;
  if (data.kind !== 'milestone' || draft.kind !== 'milestone') return null;
  return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="milestone-basic" title={t.projectManagement.drawerSectionBasicInformation} defaultExpanded><div className="pm-drawer__field-grid"><Field label={t.projectManagement.drawerCode}><select value={draft.code} disabled={pending} onChange={(event) => onChange({ ...draft, code: event.target.value as MilestoneCode | '' })}><option value="">—</option>{MILESTONE_CODES.map((code) => <option key={code}>{code}</option>)}</select></Field><Field label={t.projectManagement.projectStatus}><select value={draft.status} disabled={pending} onChange={(event) => onChange({ ...draft, status: event.target.value as MilestoneStatus | '' })}><option value="">—</option>{MILESTONE_STATUSES.map((status) => <option key={status} value={status}>{milestoneStatusLabel(status, t)}</option>)}</select></Field></div><Field label={t.projectManagement.drawerTitle}><input value={draft.title} disabled={pending} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></Field></DrawerSection>
    <DrawerSection sectionKey="milestone-plan" title={t.projectManagement.drawerSectionPlan} defaultExpanded><Field label={t.projectManagement.plannedDate}><input type="date" value={draft.date} disabled={pending} onChange={(event) => onChange({ ...draft, date: event.target.value })} /></Field></DrawerSection>
    <DrawerSection sectionKey="milestone-relations" title={t.projectManagement.drawerSectionRelations} defaultExpanded={false}><Detail label={t.projectManagement.drawerProject}>{data.project.name}</Detail><Detail label={t.projectManagement.drawerTimeline}>{data.timeline.name}</Detail></DrawerSection>
    <DrawerSection sectionKey="milestone-notes" title={t.projectManagement.drawerSectionNotes} defaultExpanded={false}><Field label={t.projectManagement.drawerNote}><textarea value={draft.note} disabled={pending} onChange={(event) => onChange({ ...draft, note: event.target.value })} /></Field></DrawerSection>
  </div>;
}

function roleLabels(t: Translations): Record<ProjectRole, string> {
  return {
    project_manager: t.projectManagement.roleProjectManager,
    system_owner: t.projectManagement.roleSystemOwner,
    software_owner: t.projectManagement.roleSoftwareOwner,
    hardware_owner: t.projectManagement.roleHardwareOwner,
    test_owner: t.projectManagement.roleTestOwner,
    oem_contact: t.projectManagement.roleOemContact,
    tier1_contact: t.projectManagement.roleTier1Contact,
    member: t.projectManagement.roleMember,
  };
}

function TeamSection({ data, onAddMember, onRemoveMember, onChangeMemberRoles, onSetProjectManager }: {
  data: Extract<ProjectManagementDrawerData, { kind: 'project' }>;
  onAddMember?: (command: AddProjectMemberCommand) => Promise<void>;
  onRemoveMember?: (command: RemoveProjectMemberCommand) => Promise<void>;
  onChangeMemberRoles?: (command: ChangeProjectMemberRolesCommand) => Promise<void>;
  onSetProjectManager?: (command: SetProjectManagerCommand) => Promise<void>;
}) {
  const { t } = useI18n();
  const labels = roleLabels(t);
  const [adding, setAdding] = useState(false);
  const [selectedPersonId, setSelectedPersonId] = useState('');
  const [pendingAction, setPendingAction] = useState('');
  const [teamError, setTeamError] = useState('');
  const run = async (key: string, action: () => Promise<void>) => {
    if (pendingAction) return;
    setPendingAction(key); setTeamError('');
    try { await action(); } catch (cause) {
      setTeamError(cause instanceof Error ? cause.message : t.projectManagement.teamMutationFailed);
    } finally { setPendingAction(''); }
  };
  const managerId = data.projectManager?.id;
  return <div className="pm-team">
    <div className="pm-team__manager">
      <span className="pm-team__group-label">{t.projectManagement.projectManager}</span>
      {data.projectManager ? <div className="pm-team__member pm-team__member--manager">
        <span className="pm-team__avatar" aria-hidden="true">{personInitial(data.projectManager.name)}</span>
        <span className="pm-team__identity"><strong>{data.projectManager.name}</strong><small>{data.projectManager.title || labels.project_manager}</small></span>
      </div> : <span className="pm-team__unassigned">{t.projectManagement.unassigned}</span>}
    </div>
    <div className="pm-team__members">
      <span className="pm-team__group-label">{t.projectManagement.drawerSectionTeam}</span>
      {data.members.length ? data.members.map(({ person, membership }) => {
        const selectedRole = membership.roles.find((role) => role !== 'project_manager') ?? membership.roles[0];
        return <div className="pm-team__member" key={membership.id}>
          <span className="pm-team__avatar" aria-hidden="true">{personInitial(person.name)}</span>
          <span className="pm-team__identity"><strong>{person.name}</strong><small>{person.title || membership.roles.map((role) => membershipRolePresentation(role, labels)).join(' · ')}</small></span>
          {onChangeMemberRoles ? <select aria-label={`${t.projectManagement.changeRole}: ${person.name}`} value={selectedRole} disabled={Boolean(pendingAction)} onChange={(event) => {
            const role = event.target.value as ProjectRole;
            if (role === 'project_manager' && onSetProjectManager) {
              void run(`manager:${person.id}`, () => onSetProjectManager({ projectId: data.project.id, personId: person.id }));
              return;
            }
            const roles: ProjectRole[] = membership.roles.includes('project_manager')
              ? ['project_manager', role]
              : [role];
            void run(`role:${person.id}`, () => onChangeMemberRoles({ projectId: data.project.id, personId: person.id, roles }));
          }}>{PROJECT_ROLES.map((role) => <option key={role} value={role}>{membershipRolePresentation(role, labels)}</option>)}</select> : <span className="pm-team__role">{membership.roles.map((role) => membershipRolePresentation(role, labels)).join(' · ')}</span>}
          {person.id !== managerId && onSetProjectManager ? <button type="button" className="pm-team__icon-action" aria-label={`${t.projectManagement.setAsProjectManager}: ${person.name}`} title={t.projectManagement.setAsProjectManager} disabled={Boolean(pendingAction)} onClick={() => { void run(`manager:${person.id}`, () => onSetProjectManager({ projectId: data.project.id, personId: person.id })); }}><Crown size={14} /></button> : null}
          {onRemoveMember ? <button type="button" className="pm-team__icon-action is-danger" aria-label={`${t.projectManagement.removeMember}: ${person.name}`} title={t.projectManagement.removeMember} disabled={Boolean(pendingAction)} onClick={() => { void run(`remove:${person.id}`, () => onRemoveMember({ projectId: data.project.id, personId: person.id })); }}><Trash2 size={14} /></button> : null}
        </div>;
      }) : <p className="pm-drawer__empty">{t.projectManagement.drawerNoMembers}</p>}
      {adding ? <div className="pm-team__add-row">
        <select aria-label={t.projectManagement.availablePersons} value={selectedPersonId} disabled={Boolean(pendingAction)} onChange={(event) => setSelectedPersonId(event.target.value)}>
          <option value="">{t.projectManagement.selectPerson}</option>
          {data.availablePersons.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` · ${person.title}` : ''}</option>)}
        </select>
        <button type="button" disabled={!selectedPersonId || Boolean(pendingAction)} onClick={() => { void run('add', async () => { await onAddMember?.({ projectId: data.project.id, personId: selectedPersonId }); setSelectedPersonId(''); setAdding(false); }); }}>{t.projectManagement.addMember}</button>
        <button type="button" disabled={Boolean(pendingAction)} onClick={() => setAdding(false)}>{t.projectManagement.crudCancel}</button>
      </div> : onAddMember ? <button type="button" className="pm-team__add" disabled={!data.availablePersons.length || Boolean(pendingAction)} onClick={() => setAdding(true)}><Plus size={13} />{t.projectManagement.addMember}</button> : null}
      {adding && !data.availablePersons.length ? <p className="pm-drawer__empty">{t.projectManagement.noAvailablePersons}</p> : null}
      {teamError ? <p className="pm-drawer__error" role="alert">{teamError}</p> : null}
    </div>
  </div>;
}

function DrawerView({ data, onAddMember, onRemoveMember, onChangeMemberRoles, onSetProjectManager }: {
  data: ProjectManagementDrawerData;
  onAddMember?: (command: AddProjectMemberCommand) => Promise<void>;
  onRemoveMember?: (command: RemoveProjectMemberCommand) => Promise<void>;
  onChangeMemberRoles?: (command: ChangeProjectMemberRolesCommand) => Promise<void>;
  onSetProjectManager?: (command: SetProjectManagerCommand) => Promise<void>;
}) {
  const { t } = useI18n();
  if (data.kind === 'project') return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="project-overview" title={t.projectManagement.drawerSectionOverview} defaultExpanded={false}><Detail label={t.projectManagement.drawerDescription}>{data.project.description}</Detail></DrawerSection>
    <DrawerSection sectionKey="project-information" title={t.projectManagement.drawerSectionInformation} defaultExpanded={false}><Detail label={t.projectManagement.projectCode}>{data.project.projectCode}</Detail><Detail label={t.projectManagement.projectStatus}><ProjectStatusValue status={data.project.projectStatus} /></Detail><Detail label={t.projectManagement.startDate}>{data.project.startDate}</Detail><Detail label={t.projectManagement.endDate}>{data.project.endDate}</Detail></DrawerSection>
    <DrawerSection sectionKey="project-team" title={t.projectManagement.drawerSectionTeam} defaultExpanded={false}><TeamSection data={data} onAddMember={onAddMember} onRemoveMember={onRemoveMember} onChangeMemberRoles={onChangeMemberRoles} onSetProjectManager={onSetProjectManager} /></DrawerSection>
    <DrawerSection sectionKey="project-milestones" title={t.projectManagement.drawerSectionMilestones} defaultExpanded><Detail label={t.projectManagement.drawerMilestoneCount}>{data.milestones.length}</Detail><MilestoneList data={data} /></DrawerSection>
    {data.project.note ? <DrawerSection sectionKey="project-notes" title={t.projectManagement.drawerSectionNotes} defaultExpanded><p className="pm-drawer__prose">{data.project.note}</p></DrawerSection> : null}
  </div>;
  if (data.kind === 'timeline') return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="timeline-basic" title={t.projectManagement.drawerSectionBasicInformation} defaultExpanded><Detail label={t.projectManagement.drawerName}>{data.timeline.name}</Detail><Detail label={t.projectManagement.drawerLane}>{data.timeline.lane}</Detail><Detail label={t.projectManagement.drawerKeyResources}>{data.timeline.keyResources.join(', ')}</Detail></DrawerSection>
    <DrawerSection sectionKey="timeline-plan" title={t.projectManagement.drawerSectionPlan} defaultExpanded><Detail label={t.projectManagement.startDate}>{data.timeline.startDate}</Detail><Detail label={t.projectManagement.endDate}>{data.timeline.endDate}</Detail></DrawerSection>
    <DrawerSection sectionKey="timeline-relations" title={t.projectManagement.drawerSectionRelations} defaultExpanded={false}><Detail label={t.projectManagement.drawerProject}>{data.project.name}</Detail></DrawerSection>
    <DrawerSection sectionKey="timeline-milestones" title={t.projectManagement.drawerSectionMilestones} defaultExpanded={false}><MilestoneList data={data} /></DrawerSection>
  </div>;
  return <div className="pm-drawer__sections">
    <DrawerSection sectionKey="milestone-basic" title={t.projectManagement.drawerSectionBasicInformation} defaultExpanded><Detail label={t.projectManagement.drawerCode}>{data.milestone.code}</Detail><Detail label={t.projectManagement.drawerTitle}>{data.milestone.title}</Detail><Detail label={t.projectManagement.projectStatus}><MilestoneStatusValue status={data.milestone.status} /></Detail></DrawerSection>
    <DrawerSection sectionKey="milestone-plan" title={t.projectManagement.drawerSectionPlan} defaultExpanded><Detail label={t.projectManagement.plannedDate}>{data.milestone.date}</Detail></DrawerSection>
    <DrawerSection sectionKey="milestone-relations" title={t.projectManagement.drawerSectionRelations} defaultExpanded={false}><Detail label={t.projectManagement.drawerProject}>{data.project.name}</Detail><Detail label={t.projectManagement.drawerTimeline}>{data.timeline.name}</Detail></DrawerSection>
    <DrawerSection sectionKey="milestone-notes" title={t.projectManagement.drawerSectionNotes} defaultExpanded={false}><p className="pm-drawer__prose">{data.milestone.note || '—'}</p></DrawerSection>
  </div>;
}
