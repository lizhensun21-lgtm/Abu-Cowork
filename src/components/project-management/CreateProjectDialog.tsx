import { Check, LoaderCircle, Plus, Trash2 } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { useI18n } from '@/i18n';
import type { CreateProjectCommand } from '@/project-management/application';
import {
  LIFECYCLE_PHASES,
  MILESTONE_CODES,
  PROJECT_STATUSES,
  PROJECT_TYPES,
  type LifecyclePhase,
  type MilestoneCode,
  type Person,
  type ProjectRole,
  type ProjectStatus,
  type ProjectType,
  type TimelineLane,
} from '@/project-management/domain';

import { CrudDialog, Field } from './ProjectManagementCrudDialogs';

interface MilestoneDraft {
  readonly id: number;
  title: string;
  lane: TimelineLane;
  date: string;
  code: MilestoneCode | '';
  note: string;
}

interface MemberDraft {
  readonly personId: string;
  roles: ProjectRole[];
}

const MEMBER_ROLES = [
  'system_owner', 'software_owner', 'hardware_owner',
  'test_owner', 'oem_contact', 'tier1_contact',
] as const satisfies readonly ProjectRole[];

const lifecycleTranslationKeys = {
  concept: 'createLifecycleConcept',
  development: 'createLifecycleDevelopment',
  validation: 'createLifecycleValidation',
  production: 'createLifecycleProduction',
  maintenance: 'createLifecycleMaintenance',
} as const satisfies Record<LifecyclePhase, string>;

export function CreateProjectDialog({
  persons,
  onClose,
  onCreate,
}: {
  persons: readonly Person[];
  onClose: () => void;
  onCreate: (command: CreateProjectCommand) => Promise<void>;
}) {
  const { t } = useI18n();
  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [lifecyclePhase, setLifecyclePhase] = useState<LifecyclePhase | ''>('');
  const [summary, setSummary] = useState('');
  const [priority, setPriority] = useState('');
  const [customer, setCustomer] = useState('');
  const [vehicleModel, setVehicleModel] = useState('');
  const [projectType, setProjectType] = useState<ProjectType | ''>('');
  const [projectManagerId, setProjectManagerId] = useState('');
  const [memberToAdd, setMemberToAdd] = useState('');
  const [initialMembers, setInitialMembers] = useState<MemberDraft[]>([]);
  const [milestones, setMilestones] = useState<MilestoneDraft[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const milestoneSequence = useRef(0);
  const inFlight = useRef(false);

  const availablePersons = persons.filter((person) => (
    !initialMembers.some((member) => member.personId === person.id)
  ));

  const roleLabel = (role: ProjectRole) => ({
    system_owner: t.projectManagement.roleSystemOwner,
    software_owner: t.projectManagement.roleSoftwareOwner,
    hardware_owner: t.projectManagement.roleHardwareOwner,
    test_owner: t.projectManagement.roleTestOwner,
    oem_contact: t.projectManagement.roleOemContact,
    tier1_contact: t.projectManagement.roleTier1Contact,
    project_manager: t.projectManagement.roleProjectManager,
    member: t.projectManagement.roleMember,
  })[role];

  const validateCore = () => Boolean(name.trim() && startDate && endDate && startDate <= endDate);
  const validatePlan = (drafts: readonly MilestoneDraft[]) => drafts.every((milestone) => (
    milestone.title.trim() && milestone.date && ['YD', 'OEM', 'Tier1'].includes(milestone.lane)
  ));

  const submitDraft = async (skipOptional: boolean) => {
    if (inFlight.current) return;
    const submittedMilestones = skipOptional ? [] : milestones;
    if (!validateCore() || !validatePlan(submittedMilestones)) {
      setError(t.projectManagement.crudInvalidInput);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onCreate({
        name: name.trim(),
        startDate,
        endDate,
        projectStatus: status,
        ...(lifecyclePhase ? { lifecyclePhase } : {}),
        ...(summary.trim() ? { summary: summary.trim() } : {}),
        ...(priority ? { priority } : {}),
        ...(customer.trim() ? { customer: customer.trim() } : {}),
        ...(vehicleModel.trim() ? { vehicleModel: vehicleModel.trim() } : {}),
        ...(projectType ? { projectType } : {}),
        ...(skipOptional || !projectManagerId ? {} : { projectManagerId }),
        initialMembers: skipOptional ? [] : initialMembers,
        initialMilestones: submittedMilestones.map(({ title, lane, date, code, note }) => ({
          title: title.trim(), lane, date, code, ...(note.trim() ? { note: note.trim() } : {}),
        })),
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.projectManagement.crudSaveError);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (step === 0) {
      if (!validateCore()) {
        setError(t.projectManagement.crudInvalidInput);
        return;
      }
      setError('');
      setStep(1);
      return;
    }
    void submitDraft(false);
  };

  const footer = <footer>
    <button type="button" disabled={pending} onClick={step === 0 ? onClose : () => setStep(0)}>
      {step === 0 ? t.projectManagement.crudCancel : t.projectManagement.createPrevious}
    </button>
    {step === 1 ? <button type="button" disabled={pending} onClick={() => { void submitDraft(true); }}>
      {t.projectManagement.createSkip}
    </button> : null}
    <button type="submit" className="is-primary" disabled={pending}>
      {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Check size={14} />}
      {pending
        ? t.projectManagement.crudSaving
        : step === 0 ? t.projectManagement.createNext : t.projectManagement.createProject}
    </button>
  </footer>;

  return <CrudDialog
    title={t.projectManagement.createProject}
    className="pm-create-project-dialog"
    pending={pending}
    error={error}
    onClose={onClose}
    onSubmit={handleSubmit}
    footer={footer}
  >
    <div className="pm-crud-steps" aria-label={t.projectManagement.createStepsLabel}>
      <span className={step === 0 ? 'is-current' : 'is-complete'}>{t.projectManagement.createStepCore}</span>
      <span className={step === 1 ? 'is-current' : ''}>{t.projectManagement.createStepPlan}</span>
    </div>
    {step === 0 ? <section className="pm-create-step" aria-label={t.projectManagement.createStepCore}>
      <p className="pm-crud-hint">{t.projectManagement.createSkeletonHelp}</p>
      <Field label={`${t.projectManagement.projectName} *`}><input autoFocus value={name} onChange={(event) => setName(event.target.value)} /></Field>
      <div className="pm-crud-grid">
        <Field label={`${t.projectManagement.projectStatus} *`}><select value={status} onChange={(event) => setStatus(event.target.value as ProjectStatus)}>{PROJECT_STATUSES.map((value) => <option key={value} value={value}>{({ planning: t.projectManagement.statusPlanning, active: t.projectManagement.statusActive, paused: t.projectManagement.statusPaused, closed: t.projectManagement.statusClosed, cancelled: t.projectManagement.statusCancelled })[value]}</option>)}</select></Field>
        <Field label={t.projectManagement.createLifecyclePhase}><select value={lifecyclePhase} onChange={(event) => setLifecyclePhase(event.target.value as LifecyclePhase | '')}><option value="">{t.projectManagement.createUnset}</option>{LIFECYCLE_PHASES.map((value) => <option key={value} value={value}>{t.projectManagement[lifecycleTranslationKeys[value]]}</option>)}</select></Field>
      </div>
      <div className="pm-crud-grid"><Field label={`${t.projectManagement.startDate} *`}><input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></Field><Field label={`${t.projectManagement.endDate} *`}><input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></Field></div>
      <Field label={t.projectManagement.createSummary}><input value={summary} onChange={(event) => setSummary(event.target.value)} /></Field>
      <div className="pm-crud-grid"><Field label={t.projectManagement.createPriority}><select value={priority} onChange={(event) => setPriority(event.target.value)}><option value="">{t.projectManagement.createUnset}</option><option value="low">{t.projectManagement.createPriorityLow}</option><option value="medium">{t.projectManagement.createPriorityMedium}</option><option value="high">{t.projectManagement.createPriorityHigh}</option></select></Field><Field label={t.projectManagement.createProjectType}><select value={projectType} onChange={(event) => setProjectType(event.target.value as ProjectType | '')}><option value="">{t.projectManagement.createUnset}</option>{PROJECT_TYPES.map((value) => <option key={value} value={value}>{value === 'development' ? t.projectManagement.createTypeDevelopment : t.projectManagement.createTypeMatching}</option>)}</select></Field></div>
      <div className="pm-crud-grid"><Field label={t.projectManagement.createCustomer}><input value={customer} onChange={(event) => setCustomer(event.target.value)} /></Field><Field label={t.projectManagement.createVehicleModel}><input value={vehicleModel} onChange={(event) => setVehicleModel(event.target.value)} /></Field></div>
    </section> : <section className="pm-create-step" aria-label={t.projectManagement.createStepPlan}>
      <p className="pm-crud-hint">{t.projectManagement.createPlanHelp}</p>
      {persons.length === 0 ? <p className="pm-create-person-empty" role="note">{t.projectManagement.createNoPersonsHelp}</p> : null}
      <Field label={t.projectManagement.createProjectManagerOptional}><select value={projectManagerId} onChange={(event) => setProjectManagerId(event.target.value)}><option value="">{persons.length ? t.projectManagement.createNoProjectManager : t.projectManagement.createNoPersonsOption}</option>{persons.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` — ${person.title}` : ''}</option>)}</select></Field>
      <section className="pm-create-section" aria-label={t.projectManagement.createInitialTeam}>
        <div className="pm-create-section__heading"><strong>{t.projectManagement.createInitialTeam}</strong><small>{t.projectManagement.createInitialTeamHelp}</small></div>
        {initialMembers.length === 0 ? <p className="pm-create-empty">{t.projectManagement.createNoInitialMembers}</p> : initialMembers.map((member) => {
          const person = persons.find((item) => item.id === member.personId);
          return <article key={member.personId} className="pm-create-member"><div><span><strong>{person?.name}</strong>{member.roles.length === 0 ? <small>{t.projectManagement.createDefaultMemberLabel}</small> : null}</span><button type="button" onClick={() => setInitialMembers((current) => current.filter((item) => item.personId !== member.personId))}>{t.projectManagement.removeMember}</button></div><div className="pm-create-role-grid">{MEMBER_ROLES.map((role) => <label key={role}><input type="checkbox" checked={member.roles.includes(role)} onChange={(event) => setInitialMembers((current) => current.map((item) => item.personId === member.personId ? { ...item, roles: event.target.checked ? [...item.roles, role] : item.roles.filter((value) => value !== role) } : item))} />{roleLabel(role)}</label>)}</div></article>;
        })}
        <div className="pm-create-add-row"><select aria-label={t.projectManagement.selectPerson} value={memberToAdd} onChange={(event) => setMemberToAdd(event.target.value)}><option value="">{availablePersons.length ? t.projectManagement.selectPerson : t.projectManagement.noAvailablePersons}</option>{availablePersons.map((person) => <option key={person.id} value={person.id}>{person.name}{person.title ? ` — ${person.title}` : ''}</option>)}</select><button type="button" disabled={!memberToAdd} onClick={() => { setInitialMembers((current) => [...current, { personId: memberToAdd, roles: [] }]); setMemberToAdd(''); }}><Plus size={14} />{t.projectManagement.addMember}</button></div>
      </section>
      <section className="pm-create-section" aria-label={t.projectManagement.createInitialMilestones}>
        <div className="pm-create-section__heading"><strong>{t.projectManagement.createInitialMilestones}</strong><button type="button" aria-label={t.projectManagement.createAddMilestone} onClick={() => { milestoneSequence.current += 1; setMilestones((current) => [...current, { id: milestoneSequence.current, title: '', lane: 'YD', date: '', code: '', note: '' }]); }}><Plus size={15} /></button></div>
        {milestones.length === 0 ? <p className="pm-create-empty">{t.projectManagement.createNoInitialMilestones}</p> : milestones.map((milestone, index) => <article key={milestone.id} className="pm-create-milestone"><div className="pm-create-milestone__heading"><strong>{t.projectManagement.createMilestoneNumber.replace('{number}', String(index + 1))}</strong><button type="button" aria-label={t.projectManagement.deleteAction} onClick={() => setMilestones((current) => current.filter((item) => item.id !== milestone.id))}><Trash2 size={14} /></button></div><div className="pm-crud-grid"><Field label={`${t.projectManagement.drawerName} *`}><input value={milestone.title} onChange={(event) => setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, title: event.target.value } : item))} /></Field><Field label={`${t.projectManagement.createTimelineRelation} *`}><select value={milestone.lane} onChange={(event) => setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, lane: event.target.value as TimelineLane } : item))}><option value="YD">{t.projectManagement.createYdInternal}</option><option value="OEM">OEM</option><option value="Tier1">Tier1</option></select></Field></div><div className="pm-crud-grid"><Field label={`${t.projectManagement.plannedDate} *`}><input type="date" value={milestone.date} onChange={(event) => setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, date: event.target.value } : item))} /></Field><Field label={t.projectManagement.createStageGate}><select value={milestone.code} onChange={(event) => setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, code: event.target.value as MilestoneCode | '' } : item))}><option value="">{t.projectManagement.createUnset}</option>{MILESTONE_CODES.map((code) => <option key={code}>{code}</option>)}</select></Field></div><Field label={t.projectManagement.drawerNote}><textarea value={milestone.note} onChange={(event) => setMilestones((current) => current.map((item) => item.id === milestone.id ? { ...item, note: event.target.value } : item))} /></Field></article>)}
      </section>
    </section>}
  </CrudDialog>;
}
