import { useMemo, useState } from 'react';
import { FileJson, ShieldCheck, TriangleAlert, Wrench } from 'lucide-react';
import { open as openDialog, save as saveDialog } from '@tauri-apps/plugin-dialog';
import { readTextFile, stat, writeTextFile } from '@tauri-apps/plugin-fs';

import { useI18n } from '@/i18n';
import type { CreateMilestoneCommand, CreateProjectCommand, MoveMilestoneCommand } from '@/project-management/application';
import {
  addMeetingMilestone,
  addMeetingProject,
  buildMeetingSession,
  createMeetingMaintenanceState,
  discardMeetingChanges,
  filterMeetingGraph,
  meetingMaintenanceGraph,
  MeetingSnapshotValidationError,
  moveMeetingMilestone,
  prepareMeetingExport,
  type MeetingFilter,
  type MeetingMaintenanceState,
  type MeetingSession,
} from '@/project-management/meeting';
import { TimelineRenderer } from '../timeline/TimelineRenderer';

type MeetingMode = 'readonly' | 'maintenance';
const MAX_MEETING_FILE_BYTES = 25 * 1024 * 1024;

export default function MeetingWorkspace() {
  const { t } = useI18n();
  const [session, setSession] = useState<MeetingSession | null>(null);
  const [maintenance, setMaintenance] = useState<MeetingMaintenanceState | null>(null);
  const [mode, setMode] = useState<MeetingMode>('readonly');
  const [filter, setFilter] = useState<MeetingFilter>('report-month');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');

  const workingGraph = useMemo(
    () => maintenance ? meetingMaintenanceGraph(maintenance) : session?.graph ?? null,
    [maintenance, session],
  );
  const visibleGraph = useMemo(
    () => workingGraph && session
      ? filterMeetingGraph(workingGraph, session.reportMonth, filter)
      : null,
    [filter, session, workingGraph],
  );

  const confirmDiscard = () => !maintenance?.dirty || window.confirm(t.meeting.confirmDiscard);

  const selectFile = async () => {
    if (!confirmDiscard()) return;
    const selected = await openDialog({ multiple: false, directory: false, filters: [{ name: 'Abu Meeting JSON', extensions: ['json'] }] });
    if (typeof selected !== 'string') return;
    try {
      if (!selected.toLowerCase().endsWith('.json')) throw new Error(t.meeting.unsupportedFile);
      const metadata = await stat(selected);
      if (metadata.size > MAX_MEETING_FILE_BYTES) throw new Error(t.meeting.unsupportedFile);
      const text = await readTextFile(selected);
      const next = buildMeetingSession(JSON.parse(text) as unknown);
      setSession(next);
      setMaintenance(null);
      setMode('readonly');
      setFilter('report-month');
      setFileName(selected.split(/[\\/]/).pop() ?? selected);
      setError('');
    } catch (cause) {
      setError(cause instanceof SyntaxError
        ? `${t.meeting.invalidFile}: JSON`
        : cause instanceof MeetingSnapshotValidationError
          ? `${t.meeting.invalidFile}: ${cause.message}`
          : cause instanceof Error && cause.message === t.meeting.unsupportedFile
            ? cause.message
            : t.meeting.fileReadError);
    }
  };

  const enterMaintenance = () => {
    if (!session) return;
    setMaintenance(createMeetingMaintenanceState(session.snapshot));
    setMode('maintenance');
  };

  const leaveMaintenance = () => {
    if (!confirmDiscard()) return;
    setMaintenance(null);
    setMode('readonly');
  };

  const closeMeeting = () => {
    if (!confirmDiscard()) return;
    setSession(null); setMaintenance(null); setMode('readonly'); setFileName(''); setError('');
  };

  const mutate = async (mutation: (state: MeetingMaintenanceState) => MeetingMaintenanceState) => {
    if (!maintenance || mode !== 'maintenance') throw new Error('Meeting is read only');
    setMaintenance(mutation(maintenance));
  };
  const createProject = (command: CreateProjectCommand) => mutate((state) => addMeetingProject(state, command));
  const createMilestone = (command: CreateMilestoneCommand) => mutate((state) => addMeetingMilestone(state, command));
  const moveMilestone = (command: MoveMilestoneCommand) => mutate((state) => moveMeetingMilestone(state, command));

  const exportVersion = async (status: 'draft' | 'final') => {
    if (!maintenance) return;
    const prepared = prepareMeetingExport(maintenance, status);
    const path = await saveDialog({ defaultPath: prepared.fileName, filters: [{ name: 'Abu Meeting JSON', extensions: ['json'] }] });
    if (!path) return;
    await writeTextFile(path, prepared.contents);
    const next = buildMeetingSession(prepared.snapshot);
    setSession(next);
    setMaintenance(createMeetingMaintenanceState(prepared.snapshot));
    setFileName(path.split(/[\\/]/).pop() ?? path);
    setError('');
  };

  if (!session || !visibleGraph) {
    return (
      <section data-meeting-workspace className="flex h-full flex-col items-center justify-center px-8 text-center" aria-label={t.meeting.title}>
        <FileJson className="h-10 w-10 text-[var(--abu-clay)]" strokeWidth={1.4} aria-hidden="true" />
        <h1 className="mt-4 text-title font-semibold text-[var(--abu-text-primary)]">{t.meeting.title}</h1>
        <p className="mt-2 max-w-md text-body text-[var(--abu-text-muted)]">{t.meeting.emptyDescription}</p>
        <button type="button" className="mt-5 rounded-lg bg-[var(--abu-clay)] px-4 py-2 text-body font-medium text-white" onClick={() => { void selectFile(); }}>{t.meeting.selectFile}</button>
        {error ? <p className="mt-4 max-w-lg text-body text-[var(--abu-danger)]" role="alert"><TriangleAlert className="mr-1 inline h-4 w-4" />{error}</p> : null}
      </section>
    );
  }

  const toolbar = (
    <div className="meeting-toolbar-controls" role="group" aria-label={t.meeting.title}>
      <select aria-label={t.meeting.title} value={filter} onChange={(event) => setFilter(event.target.value as MeetingFilter)}>
        <option value="report-month">{t.meeting.reportMonthMilestones}</option>
        <option value="all">{t.meeting.allProjects}</option>
      </select>
      <span className="meeting-mode-badge">{mode === 'readonly' ? <ShieldCheck size={13} /> : <Wrench size={13} />}{mode === 'readonly' ? t.meeting.readOnly : t.meeting.maintenance}</span>
    </div>
  );

  return (
    <section data-meeting-workspace className="flex h-full min-h-0 flex-col">
      <div className="meeting-commandbar">
        <span title={fileName}>{fileName}</span>
        <span>{t.meeting.reportMonth}: {session.reportMonth}</span>
        {maintenance?.dirty ? <strong>{t.meeting.dirty}</strong> : null}
        <div className="meeting-commandbar__actions">
          {mode === 'readonly' ? <button type="button" onClick={enterMaintenance}>{t.meeting.enterMaintenance}</button> : (
            <>
              <button type="button" onClick={() => { void exportVersion('draft'); }}>{t.meeting.exportDraft}</button>
              <button type="button" onClick={() => { void exportVersion('final'); }}>{t.meeting.exportFinal}</button>
              {maintenance?.dirty ? <button type="button" onClick={() => setMaintenance(discardMeetingChanges(maintenance))}>{t.meeting.discardChanges}</button> : null}
              <button type="button" onClick={leaveMaintenance}>{t.meeting.exitMaintenance}</button>
            </>
          )}
          <button type="button" onClick={() => { void selectFile(); }}>{t.meeting.changeFile}</button>
          <button type="button" onClick={closeMeeting}>{t.meeting.closeMeeting}</button>
        </div>
      </div>
      {error ? <div className="meeting-inline-error" role="alert">{error}</div> : null}
      <div className="min-h-0 flex-1">
        <TimelineRenderer
          key={fileName}
          graph={visibleGraph}
          workspaceTitle={session.snapshot.meeting.title}
          initialFocusDate={`${session.reportMonth}-15`}
          highlightedMonth={session.reportMonth}
          toolbarLeading={toolbar}
          onMoveMilestone={mode === 'maintenance' ? moveMilestone : undefined}
          onCreateProject={mode === 'maintenance' ? createProject : undefined}
          onCreateMilestone={mode === 'maintenance' ? createMilestone : undefined}
        />
      </div>
    </section>
  );
}
