import { Component, useEffect, useMemo, useState, type ErrorInfo, type ReactNode } from 'react';
import {
  CalendarDays, ChevronLeft, ChevronRight, Pencil, Plus, Search, Trash2,
  TriangleAlert, UserRound, X,
} from 'lucide-react';

import {
  DeletePersonDialog,
  PersonEditorDialog,
} from '@/components/project-management/PersonCrudDialogs';
import { ProjectManagementDrawer } from '@/components/project-management/drawer/ProjectManagementDrawer';
import type { ProjectManagementDrawerTarget } from '@/components/project-management/drawer/projectManagementDrawerData';
import { useI18n } from '@/i18n';
import {
  membershipRolePresentation,
  personInitial,
  selectCalendarEvents,
  selectLedgerRows,
  selectMemberRows,
  selectResourceRows,
  type LedgerSort,
  type MemberRow,
} from '@/project-management/application';
import {
  MILESTONE_STATUSES, PROJECT_STATUSES, TIMELINE_LANES,
  type MilestoneStatus, type Person, type ProjectRole, type ProjectStatus, type TimelineLane,
} from '@/project-management/domain';
import {
  createProjectManagementPerson,
  deleteProjectManagementPerson,
  initializeProjectManagement,
  updateProjectManagementMilestone,
  updateProjectManagementPerson,
  updateProjectManagementProject,
  updateProjectManagementTimeline,
  useProjectManagementStore,
} from '@/project-management/state';
import '../projectOverview.css';
import './projectManagementPortalModules.css';

export type ProjectManagementModuleView = 'calendar' | 'ledger' | 'resources' | 'members';
type Translations = ReturnType<typeof useI18n>['t'];

const EMPTY_VALUE = '—';

class PortalModuleErrorBoundary extends Component<{
  readonly children: ReactNode;
  readonly fallback: ReactNode;
}, { readonly failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { /* Render the shared safe fallback. */ }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

function projectStatusLabel(status: ProjectStatus, t: Translations) {
  return {
    planning: t.projectManagement.statusPlanning,
    active: t.projectManagement.statusActive,
    paused: t.projectManagement.statusPaused,
    closed: t.projectManagement.statusClosed,
    cancelled: t.projectManagement.statusCancelled,
  }[status];
}

function milestoneStatusLabel(status: MilestoneStatus | undefined, t: Translations) {
  if (!status) return t.projectManagement.drawerStatusUnknown;
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

function PortalPage({ title, description, actions, children }: {
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return <section className="pm-portal-page">
    <header className="pm-portal-page__header">
      <div><h1>{title}</h1><p>{description}</p></div>
      {actions ? <div className="pm-portal-page__actions">{actions}</div> : null}
    </header>
    <div className="pm-portal-page__content">{children}</div>
  </section>;
}

function EmptyState({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <div className="pm-portal-empty">
    <span>{icon}</span><strong>{title}</strong><p>{description}</p>
  </div>;
}

function SearchField({ value, onChange, placeholder }: {
  value: string; onChange: (value: string) => void; placeholder: string;
}) {
  return <label className="pm-portal-search">
    <Search size={14} aria-hidden="true" />
    <span className="sr-only">{placeholder}</span>
    <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
  </label>;
}

function utcToday() { return new Date().toISOString().slice(0, 10); }
function monthKey(date: string) { return date.slice(0, 7); }
function shiftMonth(value: string, delta: number) {
  const [year, month] = value.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + delta, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}
function calendarDates(value: string) {
  const [year, month] = value.split('-').map(Number);
  const first = new Date(Date.UTC(year, month - 1, 1));
  const start = Date.UTC(year, month - 1, 1 - first.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => new Date(start + index * 86_400_000).toISOString().slice(0, 10));
}

function CalendarView({ onOpen }: { onOpen: (target: ProjectManagementDrawerTarget) => void }) {
  const { t, locale } = useI18n();
  const graph = useProjectManagementStore((state) => state.graph);
  const today = utcToday();
  const [visibleMonth, setVisibleMonth] = useState(() => monthKey(today));
  const [projectId, setProjectId] = useState('');
  const [lane, setLane] = useState('');
  const [status, setStatus] = useState('');
  const events = useMemo(() => selectCalendarEvents(graph, {
    ...(projectId ? { projectId } : {}),
    ...(lane ? { lane: lane as TimelineLane } : {}),
    ...(status ? { status: status as MilestoneStatus } : {}),
  }), [graph, lane, projectId, status]);
  const eventsByDate = useMemo(() => {
    const result = new Map<string, typeof events>();
    for (const event of events) result.set(event.date, [...(result.get(event.date) ?? []), event]);
    return result;
  }, [events]);
  const dates = calendarDates(visibleMonth);
  const monthLabel = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long', timeZone: 'UTC' })
    .format(new Date(`${visibleMonth}-01T00:00:00Z`));
  const weekdayLabels = Array.from({ length: 7 }, (_, day) => new Intl.DateTimeFormat(locale, {
    weekday: 'short', timeZone: 'UTC',
  }).format(new Date(Date.UTC(2026, 7, 16 + day))));

  return <PortalPage title={t.projectManagementPortal.calendar} description={t.projectManagementPortal.calendarDescription} actions={<>
    <button type="button" onClick={() => setVisibleMonth(monthKey(today))}>{t.projectManagement.today}</button>
    <div className="pm-calendar-month-nav">
      <button type="button" aria-label={t.projectManagementPortal.previousMonth} onClick={() => setVisibleMonth((month) => shiftMonth(month, -1))}><ChevronLeft size={15} /></button>
      <strong>{monthLabel}</strong>
      <button type="button" aria-label={t.projectManagementPortal.nextMonth} onClick={() => setVisibleMonth((month) => shiftMonth(month, 1))}><ChevronRight size={15} /></button>
    </div>
  </>}>
    <div className="pm-portal-filters" aria-label={t.projectManagementPortal.filters}>
      <select aria-label={t.projectManagementPortal.projectFilter} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
        <option value="">{t.projectManagementPortal.allProjects}</option>
        {graph.projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
      </select>
      <select aria-label={t.projectManagementPortal.laneFilter} value={lane} onChange={(event) => setLane(event.target.value)}>
        <option value="">{t.projectManagementPortal.allLanes}</option>
        {TIMELINE_LANES.map((item) => <option key={item}>{item}</option>)}
      </select>
      <select aria-label={t.projectManagementPortal.statusFilter} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">{t.projectManagementPortal.allMilestoneStatuses}</option>
        {MILESTONE_STATUSES.map((item) => <option key={item} value={item}>{milestoneStatusLabel(item, t)}</option>)}
      </select>
    </div>
    {graph.projects.length === 0 ? <EmptyState icon={<CalendarDays size={20} />} title={t.projectManagementPortal.calendarEmpty} description={t.projectManagementPortal.calendarEmptyDescription} /> : <div className="pm-calendar" data-testid="pm-calendar">
      <div className="pm-calendar__weekdays">{weekdayLabels.map((label) => <span key={label}>{label}</span>)}</div>
      <div className="pm-calendar__grid">{dates.map((date) => {
        const dayEvents = eventsByDate.get(date) ?? [];
        return <div key={date} className="pm-calendar__day" data-outside-month={monthKey(date) !== visibleMonth ? 'true' : 'false'} data-today={date === today ? 'true' : 'false'}>
          <time dateTime={date}>{Number(date.slice(-2))}</time>
          <div className="pm-calendar__events">{dayEvents.slice(0, 3).map((event) => <div key={event.milestoneId} className={`pm-calendar-event pm-calendar-event--${event.status ?? 'unknown'}`} title={`${event.projectName} · ${event.timelineName}`}>
            <button type="button" className="pm-calendar-event__milestone" onClick={() => onOpen({ kind: 'milestone', milestoneId: event.milestoneId })}><span>{event.code || EMPTY_VALUE}</span><strong>{event.title}</strong></button>
            <button type="button" className="pm-calendar-event__project" onClick={() => onOpen({ kind: 'project', projectId: event.projectId })}>{event.projectName} · {event.lane}</button>
            <i>{milestoneStatusLabel(event.status, t)}</i>
          </div>)}</div>
          {dayEvents.length > 3 ? <span className="pm-calendar__more">{t.projectManagementPortal.moreEvents.replace('{count}', String(dayEvents.length - 3))}</span> : null}
        </div>;
      })}</div>
    </div>}
  </PortalPage>;
}

function LedgerView({ onOpen }: { onOpen: (target: ProjectManagementDrawerTarget) => void }) {
  const { t } = useI18n();
  const graph = useProjectManagementStore((state) => state.graph);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('');
  const [sort, setSort] = useState<LedgerSort>('name');
  const rows = useMemo(() => selectLedgerRows(graph, { query, ...(status ? { status: status as ProjectStatus } : {}), sort }), [graph, query, sort, status]);
  return <PortalPage title={t.projectManagementPortal.ledger} description={t.projectManagementPortal.ledgerDescription}>
    <div className="pm-portal-filters">
      <SearchField value={query} onChange={setQuery} placeholder={t.projectManagementPortal.searchProjects} />
      <select aria-label={t.projectManagementPortal.statusFilter} value={status} onChange={(event) => setStatus(event.target.value)}>
        <option value="">{t.projectManagement.allStatuses}</option>
        {PROJECT_STATUSES.map((item) => <option key={item} value={item}>{projectStatusLabel(item, t)}</option>)}
      </select>
      <select aria-label={t.projectManagementPortal.sortBy} value={sort} onChange={(event) => setSort(event.target.value as LedgerSort)}>
        <option value="name">{t.projectManagement.projectName}</option><option value="startDate">{t.projectManagement.startDate}</option>
        <option value="endDate">{t.projectManagement.endDate}</option><option value="status">{t.projectManagement.projectStatus}</option>
      </select>
    </div>
    {rows.length === 0 ? <EmptyState icon={<CalendarDays size={20} />} title={t.projectManagementPortal.ledgerEmpty} description={query || status ? t.projectManagementPortal.noFilterResults : t.projectManagementPortal.ledgerEmptyDescription} /> : <div className="pm-ledger-wrap"><table className="pm-ledger">
      <thead><tr><th>{t.projectManagement.projectName}</th><th>{t.projectManagement.projectStatus}</th><th>{t.projectManagement.startDate}</th><th>{t.projectManagement.endDate}</th><th>{t.projectManagement.projectManager}</th><th>{t.projectManagementPortal.timelinePresence}</th><th>{t.projectManagement.milestones}</th></tr></thead>
      <tbody>{rows.map((row) => <tr key={row.projectId} tabIndex={0} onClick={() => onOpen({ kind: 'project', projectId: row.projectId })} onKeyDown={(event) => { if (event.key === 'Enter') onOpen({ kind: 'project', projectId: row.projectId }); }}>
        <td><strong>{row.name}</strong><small>{row.code || EMPTY_VALUE}</small></td><td><span className={`pm-status pm-status--${row.status}`}>{projectStatusLabel(row.status, t)}</span></td><td>{row.startDate || EMPTY_VALUE}</td><td>{row.endDate || EMPTY_VALUE}</td><td>{row.projectManagerName || EMPTY_VALUE}</td><td>{row.lanes.length ? row.lanes.join(' · ') : EMPTY_VALUE}</td><td>{row.milestoneCount}</td>
      </tr>)}</tbody>
    </table></div>}
  </PortalPage>;
}

function ResourcesView({ onOpen }: { onOpen: (target: ProjectManagementDrawerTarget) => void }) {
  const { t } = useI18n();
  const graph = useProjectManagementStore((state) => state.graph);
  const rows = useMemo(() => selectResourceRows(graph), [graph]);
  return <PortalPage title={t.projectManagementPortal.resources} description={t.projectManagementPortal.resourcesDescription}>
    {rows.length === 0 ? <EmptyState icon={<CalendarDays size={20} />} title={t.projectManagementPortal.resourcesEmpty} description={t.projectManagementPortal.resourcesEmptyDescription} /> : <div className="pm-resource-list">{rows.map((row) => <article key={row.key} className="pm-resource-row">
      <div className="pm-resource-row__identity"><strong>{row.name}</strong><span>{t.projectManagementPortal.resourceUsageSummary.replace('{projects}', String(row.projects.length)).replace('{timelines}', String(row.timelines.length))}</span></div>
      <div><small>{t.projectManagementPortal.relatedProjects}</small><div className="pm-entity-links">{row.projects.map((project) => <button type="button" key={project.projectId} onClick={() => onOpen({ kind: 'project', projectId: project.projectId })}>{project.projectName}</button>)}</div></div>
      <div><small>{t.projectManagementPortal.relatedTimelines}</small><div className="pm-entity-links">{row.timelines.map((timeline) => <button type="button" key={timeline.timelineId} onClick={() => onOpen({ kind: 'timeline', timelineId: timeline.timelineId })}>{timeline.timelineName}<span>{timeline.projectName} · {timeline.lane}</span></button>)}</div></div>
    </article>)}</div>}
  </PortalPage>;
}

function MemberDetail({ member, onClose, onOpen, onEdit, onDelete }: {
  member: MemberRow;
  onClose: () => void;
  onOpen: (target: ProjectManagementDrawerTarget) => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const labels = roleLabels(t);
  return <div className="pm-member-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><aside className="pm-member-detail" aria-label={`${t.projectManagementPortal.memberDetail}: ${member.name}`}>
    <header><div className="pm-member-avatar">{personInitial(member.name)}</div><div><span>{t.projectManagementPortal.memberDetail}</span><h2>{member.name}</h2><p>{member.title || EMPTY_VALUE}</p></div><button type="button" aria-label={t.common.close} onClick={onClose}><X size={16} /></button></header>
    <section><h3>{t.projectManagementPortal.activeProjects}</h3>{member.projects.length ? member.projects.map((project) => <button type="button" className="pm-member-project" key={project.projectId} onClick={() => onOpen({ kind: 'project', projectId: project.projectId })}><strong>{project.projectName}</strong><span>{project.roles.map((role) => membershipRolePresentation(role, labels)).join(' · ')}</span>{project.isProjectManager ? <i>{t.projectManagement.roleProjectManager}</i> : null}</button>) : <p className="pm-member-detail__empty">{t.projectManagementPortal.noActiveProjects}</p>}</section>
    <footer><button type="button" onClick={onEdit}><Pencil size={14} />{t.projectManagementPortal.editPerson}</button><button type="button" className="is-danger" onClick={onDelete}><Trash2 size={14} />{t.projectManagementPortal.deletePerson}</button></footer>
  </aside></div>;
}

function MembersView({ onOpen }: { onOpen: (target: ProjectManagementDrawerTarget) => void }) {
  const { t } = useI18n();
  const labels = roleLabels(t);
  const graph = useProjectManagementStore((state) => state.graph);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const rows = useMemo(() => selectMemberRows(graph, query), [graph, query]);
  const allMembers = useMemo(() => selectMemberRows(graph), [graph]);
  const selected = selectedId ? allMembers.find((member) => member.personId === selectedId) : undefined;
  const personById = (personId: string | null): Person | undefined => (
    personId ? graph.persons.find((person) => person.id === personId) : undefined
  );
  const editing = personById(editingId);
  const deleting = personById(deletingId);
  return <PortalPage
    title={t.projectManagementPortal.members}
    description={t.projectManagementPortal.membersDescription}
    actions={<button type="button" onClick={() => setCreating(true)}><Plus size={14} />{t.projectManagementPortal.addPerson}</button>}
  >
    <div className="pm-portal-filters"><SearchField value={query} onChange={setQuery} placeholder={t.projectManagementPortal.searchMembers} /></div>
    {rows.length === 0 ? <EmptyState icon={<UserRound size={20} />} title={t.projectManagementPortal.membersEmpty} description={query ? t.projectManagementPortal.noFilterResults : t.projectManagementPortal.membersEmptyDescription} /> : <div className="pm-member-list">{rows.map((member) => <button type="button" className="pm-member-row" key={member.personId} onClick={() => setSelectedId(member.personId)}>
      <span className="pm-member-avatar">{personInitial(member.name)}</span><span><strong>{member.name}</strong><small>{member.title || EMPTY_VALUE}</small></span><span><small>{t.projectManagementPortal.activeProjects}</small><strong>{member.projects.length}</strong></span><span><small>{t.projectManagementPortal.currentRoles}</small><strong>{member.roles.length ? member.roles.map((role) => membershipRolePresentation(role, labels)).join(' · ') : EMPTY_VALUE}</strong></span>
    </button>)}</div>}
    {selected ? <MemberDetail member={selected} onClose={() => setSelectedId(null)} onOpen={(target) => { setSelectedId(null); onOpen(target); }} onEdit={() => { setSelectedId(null); setEditingId(selected.personId); }} onDelete={() => { setSelectedId(null); setDeletingId(selected.personId); }} /> : null}
    {creating ? <PersonEditorDialog onClose={() => setCreating(false)} onCreate={createProjectManagementPerson} onUpdate={updateProjectManagementPerson} /> : null}
    {editing ? <PersonEditorDialog person={editing} onClose={() => setEditingId(null)} onCreate={createProjectManagementPerson} onUpdate={updateProjectManagementPerson} /> : null}
    {deleting ? <DeletePersonDialog person={deleting} onClose={() => setDeletingId(null)} onDelete={deleteProjectManagementPerson} /> : null}
  </PortalPage>;
}

export default function ProjectManagementPortalModules({ view }: { view: ProjectManagementModuleView }) {
  const { t } = useI18n();
  const status = useProjectManagementStore((state) => state.initializationStatus);
  const error = useProjectManagementStore((state) => state.error);
  const graph = useProjectManagementStore((state) => state.graph);
  const [drawerTarget, setDrawerTarget] = useState<ProjectManagementDrawerTarget | null>(null);
  useEffect(() => { void initializeProjectManagement().catch(() => undefined); }, []);
  if (status === 'uninitialized' || status === 'initializing') return <div className="pm-portal-runtime-state" role="status">{t.projectManagement.initializing}</div>;
  if (status === 'error') return <div className="pm-portal-runtime-state" role="alert"><TriangleAlert size={18} /><strong>{t.projectManagement.initializationError}</strong>{error ? <p>{error}</p> : null}<button type="button" onClick={() => { void initializeProjectManagement().catch(() => undefined); }}>{t.common.retry}</button></div>;
  const renderError = <div className="pm-portal-runtime-state" role="alert"><TriangleAlert size={18} /><strong>{t.projectManagement.initializationError}</strong></div>;
  return <div data-project-overview-workspace data-pm-portal-module={view} className="pm-portal-module-root">
    {error ? <div className="pm-portal-persistence-warning" role="alert"><TriangleAlert size={15} /><span><strong>{t.projectManagement.persistenceWarning}.</strong> {error}</span></div> : null}
    <PortalModuleErrorBoundary key={view} fallback={renderError}>{view === 'calendar' ? <CalendarView onOpen={setDrawerTarget} /> : view === 'ledger' ? <LedgerView onOpen={setDrawerTarget} /> : view === 'resources' ? <ResourcesView onOpen={setDrawerTarget} /> : <MembersView onOpen={setDrawerTarget} />}</PortalModuleErrorBoundary>
    {drawerTarget ? <ProjectManagementDrawer graph={graph} target={drawerTarget} onClose={() => setDrawerTarget(null)} onUpdateProject={updateProjectManagementProject} onUpdateTimeline={updateProjectManagementTimeline} onUpdateMilestone={updateProjectManagementMilestone} /> : null}
  </div>;
}
