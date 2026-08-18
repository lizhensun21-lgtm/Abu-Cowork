import type { Person, ProjectGraph } from '../domain/types';
import {
  allocateProjectManagementId,
  defaultProjectManagementIdFactory,
  type ProjectManagementIdFactory,
} from './crudCommands';
import type { ProjectGraphMutation } from './projectGraphRuntime';

export class PersonMutationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PersonMutationConflictError';
  }
}

export interface CreatePersonCommand {
  readonly name: string;
  readonly title?: string;
}

export function createPerson(
  command: CreatePersonCommand,
  idFactory: ProjectManagementIdFactory = defaultProjectManagementIdFactory,
): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    const id = allocateProjectManagementId(
      'person',
      new Set(draft.persons.map((person) => person.id)),
      idFactory,
    );
    draft.persons.push({ id, name: command.name, title: command.title });
    return draft;
  };
}

export interface UpdatePersonCommand {
  readonly personId: string;
  readonly expected: Readonly<Pick<Person, 'name' | 'title'>>;
  readonly values: Readonly<Pick<Person, 'name' | 'title'>>;
}

export function updatePerson(command: UpdatePersonCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    const person = draft.persons.find((item) => item.id === command.personId);
    if (!person) {
      throw new PersonMutationConflictError(`Person no longer exists: ${command.personId}`);
    }
    if (person.name !== command.expected.name || person.title !== command.expected.title) {
      throw new PersonMutationConflictError(`Person changed before commit: ${command.personId}`);
    }
    person.name = command.values.name;
    person.title = command.values.title;
    return draft;
  };
}

export interface DeletePersonCommand {
  readonly personId: string;
}

export function deletePerson(command: DeletePersonCommand): ProjectGraphMutation {
  return (draft: ProjectGraph) => {
    if (!draft.persons.some((person) => person.id === command.personId)) {
      throw new PersonMutationConflictError(`Person no longer exists: ${command.personId}`);
    }
    const references = draft.projectMemberships.filter(
      (membership) => membership.personId === command.personId,
    );
    if (references.some((membership) => membership.status === 'active')) {
      throw new PersonMutationConflictError(
        'Person has active Project Memberships. Remove the member from related Projects first.',
      );
    }
    if (references.length) {
      throw new PersonMutationConflictError(
        'Person has historical Project Membership references and cannot be deleted in V1.',
      );
    }
    draft.persons = draft.persons.filter((person) => person.id !== command.personId);
    return draft;
  };
}
