import { useRef, useState, type FormEvent, type ReactNode } from 'react';
import { Check, LoaderCircle, X } from 'lucide-react';

import { useI18n } from '@/i18n';
import type {
  CreateMilestoneCommand,
  CreateProjectTimelineCommand,
} from '@/project-management/application';
import {
  MILESTONE_CODES,
  MILESTONE_STATUSES,
  type MilestoneCode,
  type MilestoneStatus,
} from '@/project-management/domain';

type Translations = ReturnType<typeof useI18n>['t'];
function milestoneStatusLabel(status: MilestoneStatus, t: Translations) {
  return { unknown: t.projectManagement.drawerStatusUnknown, not_started: t.projectManagement.drawerStatusNotStarted, in_progress: t.projectManagement.drawerStatusInProgress, completed: t.projectManagement.drawerStatusCompleted, at_risk: t.projectManagement.drawerStatusAtRisk, delayed: t.projectManagement.drawerStatusDelayed, blocked: t.projectManagement.drawerStatusBlocked, paused: t.projectManagement.drawerStatusPaused }[status];
}

export function CrudDialog({ title, pending, error, children, onClose, onSubmit, footer, className }: {
  title: string; pending: boolean; error: string; children: ReactNode;
  onClose: () => void; onSubmit: (event: FormEvent) => void; footer?: ReactNode; className?: string;
}) {
  const { t } = useI18n();
  return <div className="pm-crud-backdrop" onPointerDown={(event) => { if (event.target === event.currentTarget && !pending) onClose(); }}>
    <section className={`pm-crud-dialog${className ? ` ${className}` : ''}`} role="dialog" aria-modal="true" aria-label={title} data-no-timeline-pan>
      <header><h2>{title}</h2><button type="button" aria-label={`${title} — ${t.projectManagement.crudCancel}`} disabled={pending} onClick={onClose}><X size={16} /></button></header>
      <form onSubmit={onSubmit}>
        <div className="pm-crud-dialog__body">{children}{error ? <p className="pm-crud-dialog__error" role="alert">{error}</p> : null}</div>
        {footer ?? <footer><button type="button" disabled={pending} onClick={onClose}>{t.projectManagement.crudCancel}</button><button type="submit" className="is-primary" disabled={pending}>{pending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}{pending ? t.projectManagement.crudSaving : t.projectManagement.crudCreate}</button></footer>}
      </form>
    </section>
  </div>;
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="pm-crud-field"><span>{label}</span>{children}</label>;
}

export function CreateTimelineDialog({ projectId, legalLanes, defaultDates, onClose, onCreate }: {
  projectId: string; legalLanes: readonly ('OEM' | 'Tier1')[]; defaultDates: { startDate: string; endDate: string };
  onClose: () => void; onCreate: (command: CreateProjectTimelineCommand) => Promise<void>;
}) {
  const { t } = useI18n(); const [lane, setLane] = useState<'OEM' | 'Tier1'>(legalLanes[0] ?? 'OEM');
  const [name, setName] = useState<string>(legalLanes[0] ?? ''); const [startDate, setStartDate] = useState(defaultDates.startDate); const [endDate, setEndDate] = useState(defaultDates.endDate);
  const [resources, setResources] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const inFlight = useRef(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (inFlight.current) return; if (!name.trim() || startDate > endDate) { setError(t.projectManagement.crudInvalidInput); return; }
    inFlight.current = true; setPending(true); try { await onCreate({ projectId, lane, name, startDate, endDate, keyResources: resources.split(',').map((item) => item.trim()).filter(Boolean) }); } catch (cause) { setError(cause instanceof Error ? cause.message : t.projectManagement.crudSaveError); } finally { inFlight.current = false; setPending(false); } };
  return <CrudDialog title={t.projectManagement.addTimeline} pending={pending} error={error} onClose={onClose} onSubmit={submit}>
    <Field label={t.projectManagement.drawerLane}><select value={lane} onChange={(event) => { const value = event.target.value as 'OEM' | 'Tier1'; setLane(value); setName(value); }}>{legalLanes.map((value) => <option key={value}>{value}</option>)}</select></Field>
    <Field label={t.projectManagement.drawerName}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
    <div className="pm-crud-grid"><Field label={t.projectManagement.startDate}><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label={t.projectManagement.endDate}><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field></div>
    <Field label={t.projectManagement.drawerKeyResources}><input value={resources} onChange={(event) => setResources(event.target.value)} /></Field>
  </CrudDialog>;
}

export function CreateMilestoneDialog({ projectId, timelineId, defaultDate, onClose, onCreate }: { projectId: string; timelineId: string; defaultDate: string; onClose: () => void; onCreate: (command: CreateMilestoneCommand) => Promise<void> }) {
  const { t } = useI18n(); const [title, setTitle] = useState(''); const [date, setDate] = useState(defaultDate); const [code, setCode] = useState<MilestoneCode | ''>(''); const [status, setStatus] = useState<MilestoneStatus>('not_started'); const [note, setNote] = useState(''); const [pending, setPending] = useState(false); const [error, setError] = useState(''); const inFlight = useRef(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); if (inFlight.current) return; if (!title.trim() || !date) { setError(t.projectManagement.crudInvalidInput); return; } inFlight.current = true; setPending(true); try { await onCreate({ projectId, timelineId, title, date, code, status, note: note.trim() || undefined }); } catch (cause) { setError(cause instanceof Error ? cause.message : t.projectManagement.crudSaveError); } finally { inFlight.current = false; setPending(false); } };
  return <CrudDialog title={t.projectManagement.addMilestone} pending={pending} error={error} onClose={onClose} onSubmit={submit}>
    <Field label={t.projectManagement.drawerTitle}><input autoFocus value={title} onChange={(event) => setTitle(event.target.value)} /></Field>
    <div className="pm-crud-grid"><Field label={t.projectManagement.drawerCode}><select value={code} onChange={(event) => setCode(event.target.value as MilestoneCode | '')}><option value="">—</option>{MILESTONE_CODES.map((value) => <option key={value}>{value}</option>)}</select></Field><Field label={t.projectManagement.projectStatus}><select value={status} onChange={(event) => setStatus(event.target.value as MilestoneStatus)}>{MILESTONE_STATUSES.map((value) => <option key={value}>{milestoneStatusLabel(value, t)}</option>)}</select></Field></div>
    <Field label={t.projectManagement.plannedDate}><input type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field><Field label={t.projectManagement.drawerNote}><textarea value={note} onChange={(event) => setNote(event.target.value)} /></Field>
  </CrudDialog>;
}
