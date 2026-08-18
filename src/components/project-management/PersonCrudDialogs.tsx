import { useRef, useState, type FormEvent } from 'react';
import { LoaderCircle, Save, Trash2 } from 'lucide-react';

import { CrudDialog, Field } from '@/components/project-management/ProjectManagementCrudDialogs';
import { useI18n } from '@/i18n';
import type {
  CreatePersonCommand,
  DeletePersonCommand,
  UpdatePersonCommand,
} from '@/project-management/application';
import type { Person } from '@/project-management/domain';

export function PersonEditorDialog({ person, onClose, onCreate, onUpdate }: {
  readonly person?: Person;
  readonly onClose: () => void;
  readonly onCreate: (command: CreatePersonCommand) => Promise<void>;
  readonly onUpdate: (command: UpdatePersonCommand) => Promise<void>;
}) {
  const { t } = useI18n();
  const [name, setName] = useState(person?.name ?? '');
  const [title, setTitle] = useState(person?.title ?? '');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const dialogTitle = person ? t.projectManagementPortal.editPerson : t.projectManagementPortal.createPerson;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    if (!name.trim()) {
      setError(t.projectManagementPortal.personNameRequired);
      return;
    }
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      const values = { name, title: title.trim() || undefined };
      if (person) {
        await onUpdate({
          personId: person.id,
          expected: { name: person.name, title: person.title },
          values,
        });
      } else {
        await onCreate(values);
      }
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.projectManagement.crudSaveError);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };

  return <CrudDialog
    title={dialogTitle}
    pending={pending}
    error={error}
    onClose={onClose}
    onSubmit={submit}
    footer={<footer>
      <button type="button" disabled={pending} onClick={onClose}>{t.common.cancel}</button>
      <button type="submit" className="is-primary" disabled={pending}>
        {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Save size={14} />}
        {person ? t.common.save : t.projectManagementPortal.createPerson}
      </button>
    </footer>}
  >
    <Field label={t.projectManagementPortal.personName}>
      <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
    </Field>
    <Field label={t.projectManagementPortal.personTitle}>
      <input value={title} onChange={(event) => setTitle(event.target.value)} />
    </Field>
  </CrudDialog>;
}

export function DeletePersonDialog({ person, onClose, onDelete }: {
  readonly person: Person;
  readonly onClose: () => void;
  readonly onDelete: (command: DeletePersonCommand) => Promise<void>;
}) {
  const { t } = useI18n();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (inFlight.current) return;
    inFlight.current = true;
    setPending(true);
    setError('');
    try {
      await onDelete({ personId: person.id });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : t.projectManagement.crudSaveError);
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  };
  return <CrudDialog
    title={t.projectManagementPortal.deletePersonTitle}
    pending={pending}
    error={error}
    onClose={onClose}
    onSubmit={submit}
    footer={<footer>
      <button type="button" disabled={pending} onClick={onClose}>{t.common.cancel}</button>
      <button type="submit" className="is-danger" disabled={pending}>
        {pending ? <LoaderCircle size={14} className="animate-spin" /> : <Trash2 size={14} />}
        {t.projectManagementPortal.deletePerson}
      </button>
    </footer>}
  >
    <p className="pm-person-delete-warning">{t.projectManagementPortal.deletePersonWarning}</p>
    <strong>{person.name}</strong>
  </CrudDialog>;
}
