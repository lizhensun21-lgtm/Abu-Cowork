import { describe, expect, it } from 'vitest';

import { createProject, deleteMilestone, deleteProject } from '../application/crudCommands';
import { moveMilestone } from '../application/milestoneCommands';
import { updateProject } from '../application/projectCommands';
import { createPerson, deletePerson, updatePerson } from '../application/personCommands';
import { commitProjectGraphMutation } from '../application/projectGraphRuntime';
import { setProjectManager } from '../application/teamCommands';
import { projectMembershipId } from '../domain/projectMembership';
import type { ProjectGraph } from '../domain/types';
import {
  JsonProjectManagementRepository,
  type ProjectManagementFileSystem,
} from './JsonProjectManagementRepository';
import {
  parsePersistedProjectManagementData,
  serializePersistedProjectManagementData,
} from './projectManagementPersistence';

function graph(name = 'Alpha'): ProjectGraph {
  return {
    projects: [{
      id: 'p1', name, projectCode: 'A-1', startDate: '2026-01-01', endDate: '2026-12-31',
      projectStatus: 'active', lifecyclePhase: 'development', description: 'Production graph',
      priority: 'high', customer: 'Customer', vehicleModel: 'V1', productCategory: 'Head unit',
      productModel: 'HU-1', projectType: 'development', softwarePlatform: 'Linux',
      hardwarePlatform: 'ARM', baseSoftware: 'Base', smtSupplier: 'Supplier', note: 'Project note',
    }],
    projectTimelines: [{
      id: 't1', projectId: 'p1', lane: 'YD', name, startDate: '2026-01-01',
      endDate: '2026-12-31', keyResources: ['Bench A', 'Engineer'],
    }],
    milestones: [{
      id: 'm1', projectId: 'p1', timelineId: 't1', lane: 'YD', title: 'Gate',
      date: '2026-03-01', code: 'G1', status: 'at_risk', note: 'Milestone note',
    }],
    persons: [{ id: 'person-a', name: 'Alex', title: 'Lead' }, { id: 'person-b', name: 'Bo' }],
    projectMemberships: [
      { id: projectMembershipId('p1', 'person-a'), projectId: 'p1', personId: 'person-a', roles: ['project_manager'], status: 'active', joinedAt: '2026-01-01' },
      { id: projectMembershipId('p1', 'person-b'), projectId: 'p1', personId: 'person-b', roles: ['software_owner'], status: 'active' },
    ],
    projectTeams: [{ projectId: 'p1', externalProjectManager: 'External owner' }],
  };
}

class MemoryFileSystem implements ProjectManagementFileSystem {
  readonly files = new Map<string, string>();
  failAtomicWrite = false;
  activeWrites = 0;
  maxActiveWrites = 0;
  private backupSequence = 0;

  async appDataDir() { return '/app-data/com.abu.app.electron-dev'; }
  async join(...paths: string[]) { return paths.join('/').replace(/\/+/g, '/'); }
  async exists(path: string) { return this.files.has(path); }
  async readTextFile(path: string) {
    const value = this.files.get(path);
    if (value === undefined) throw new Error(`ENOENT: ${path}`);
    return value;
  }
  async readDir(directory: string) {
    const prefix = `${directory}/`;
    return [...this.files.keys()]
      .filter((path) => path.startsWith(prefix) && !path.slice(prefix.length).includes('/'))
      .map((path) => ({ name: path.slice(prefix.length) }));
  }
  async remove(path: string) { this.files.delete(path); }
  async atomicWriteWithBackup(path: string, content: string) {
    this.activeWrites += 1;
    this.maxActiveWrites = Math.max(this.maxActiveWrites, this.activeWrites);
    await Promise.resolve();
    try {
      if (this.failAtomicWrite) throw new Error('atomic write failed');
      let backupPath: string | null = null;
      const previous = this.files.get(path);
      if (previous !== undefined) {
        this.backupSequence += 1;
        backupPath = `${path.slice(0, path.lastIndexOf('/') + 1)}.${path.slice(path.lastIndexOf('/') + 1)}.backup.${String(this.backupSequence).padStart(4, '0')}`;
        this.files.set(backupPath, previous);
      }
      this.files.set(path, content);
      return { backupPath };
    } finally {
      this.activeWrites -= 1;
    }
  }
}

const dataPath = '/app-data/com.abu.app.electron-dev/project-management/project-management.json';

describe('Project Management persistence format', () => {
  it('roundtrips the complete V1 graph envelope without losing metadata', () => {
    const source = graph();
    const content = serializePersistedProjectManagementData(source, '2026-08-17T00:00:00.000Z');
    expect(JSON.parse(content)).toMatchObject({ formatVersion: 1, savedAt: '2026-08-17T00:00:00.000Z' });
    expect(parsePersistedProjectManagementData(content).graph).toEqual(source);
  });

  it('rejects malformed JSON, unsupported versions, and invalid relations', () => {
    expect(() => parsePersistedProjectManagementData('{')).toThrow('malformed JSON');
    expect(() => parsePersistedProjectManagementData(JSON.stringify({ formatVersion: 2, savedAt: '2026-08-17T00:00:00.000Z', graph: graph() }))).toThrow('Unsupported');
    const invalid = graph();
    invalid.milestones[0].timelineId = 'missing';
    expect(() => serializePersistedProjectManagementData(invalid)).toThrow('failed validation');
  });
});

describe('JsonProjectManagementRepository', () => {
  it('treats a missing file as an empty first launch', async () => {
    await expect(new JsonProjectManagementRepository(new MemoryFileSystem()).load()).resolves.toBeNull();
  });

  it('survives a real repository-instance restart with Graph A equal to Graph B', async () => {
    const fileSystem = new MemoryFileSystem();
    await new JsonProjectManagementRepository(fileSystem).save(graph());
    await expect(new JsonProjectManagementRepository(fileSystem).load()).resolves.toEqual(graph());
  });

  it('roundtrips Person create/edit, Project PM membership, and unused Person deletion', async () => {
    const fileSystem = new MemoryFileSystem();
    let repository = new JsonProjectManagementRepository(fileSystem);
    let current: ProjectGraph = {
      projects: [], projectTimelines: [], milestones: [], persons: [],
      projectMemberships: [], projectTeams: [],
    };

    await commitProjectGraphMutation(
      repository, current, createPerson({ name: 'Morgan', title: 'Lead' }, () => 'person-morgan'),
    );
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.persons).toEqual([{ id: 'person-morgan', name: 'Morgan', title: 'Lead' }]);

    await commitProjectGraphMutation(repository, current, updatePerson({
      personId: 'person-morgan',
      expected: { name: 'Morgan', title: 'Lead' },
      values: { name: 'Morgan Lee', title: 'Program Lead' },
    }));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.persons[0]).toMatchObject({ name: 'Morgan Lee', title: 'Program Lead' });

    const ids = ['project-1', 'timeline-1'];
    await commitProjectGraphMutation(repository, current, createProject({
      name: 'Person-backed Project', startDate: '2026-09-01', endDate: '2027-01-31',
      projectStatus: 'planning', projectManagerId: 'person-morgan',
      initialMembers: [{ personId: 'person-morgan', roles: [] }],
    }, () => ids.shift() ?? 'unused'));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.projectMemberships).toEqual([expect.objectContaining({
      personId: 'person-morgan', roles: ['project_manager'], status: 'active',
    })]);

    current = await commitProjectGraphMutation(
      repository, current, createPerson({ name: 'Unused' }, () => 'person-unused'),
    );
    await commitProjectGraphMutation(
      repository, current, deletePerson({ personId: 'person-unused' }),
    );
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.persons.map((person) => person.id)).toEqual(['person-morgan']);
    expect(current.projects).toHaveLength(1);
  });

  it('preserves the primary on atomic failure and leaves the caller graph unchanged', async () => {
    const fileSystem = new MemoryFileSystem();
    const repository = new JsonProjectManagementRepository(fileSystem);
    await repository.save(graph('Before'));
    const before = fileSystem.files.get(dataPath);
    fileSystem.failAtomicWrite = true;
    await expect(repository.save(graph('After'))).rejects.toThrow('atomic write failed');
    expect(fileSystem.files.get(dataPath)).toBe(before);
  });

  it('recovers the latest valid backup read-only while preserving a corrupted primary', async () => {
    const fileSystem = new MemoryFileSystem();
    const repository = new JsonProjectManagementRepository(fileSystem);
    await repository.save(graph('Known good'));
    await repository.save(graph('Newest'));
    fileSystem.files.set(dataPath, '{corrupted');

    const restarted = new JsonProjectManagementRepository(fileSystem);
    await expect(restarted.load()).resolves.toEqual(graph('Known good'));
    expect(restarted.getLoadWarning()).toContain('last-known-good backup');
    await expect(restarted.save(graph('Must not overwrite'))).rejects.toThrow('read-only');
    expect(fileSystem.files.get(dataPath)).toBe('{corrupted');
  });

  it('throws a clear error without overwriting malformed data when no backup exists', async () => {
    const fileSystem = new MemoryFileSystem();
    fileSystem.files.set(dataPath, '{bad');
    await expect(new JsonProjectManagementRepository(fileSystem).load()).rejects.toThrow('original file was preserved');
    expect(fileSystem.files.get(dataPath)).toBe('{bad');
  });

  it('serializes concurrent saves in call order', async () => {
    const fileSystem = new MemoryFileSystem();
    const repository = new JsonProjectManagementRepository(fileSystem);
    await Promise.all([repository.save(graph('A')), repository.save(graph('B'))]);
    expect(fileSystem.maxActiveWrites).toBe(1);
    await expect(new JsonProjectManagementRepository(fileSystem).load()).resolves.toEqual(graph('B'));
  });

  it('persists create, edit, milestone move/delete, manager change, and aggregate delete across restarts', async () => {
    const fileSystem = new MemoryFileSystem();
    let repository = new JsonProjectManagementRepository(fileSystem);
    let current = graph();
    await repository.save(current);

    const allocated = ['p2', 't2', 'm2'];
    await commitProjectGraphMutation(repository, current, createProject({
      name: 'Beta', startDate: '2027-01-01', endDate: '2027-12-31', projectStatus: 'planning',
      projectManagerId: 'person-b',
      initialMembers: [{ personId: 'person-a', roles: [] }],
      initialMilestones: [{ lane: 'YD', title: 'Kickoff', date: '2027-02-01', code: 'G0' }],
    }, () => allocated.shift() ?? 'unused'));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.projects.some((project) => project.id === 'p2')).toBe(true);
    expect(current.projectTeams.filter((team) => team.projectId === 'p2')).toEqual([{ projectId: 'p2' }]);
    expect(current.projectMemberships.filter((membership) => membership.projectId === 'p2')).toEqual([
      expect.objectContaining({ personId: 'person-a', roles: ['member'], status: 'active' }),
      expect.objectContaining({ personId: 'person-b', roles: ['project_manager'], status: 'active' }),
    ]);

    const beta = current.projects.find((project) => project.id === 'p2')!;
    current = await commitProjectGraphMutation(repository, current, updateProject({
      projectId: 'p2',
      expected: { name: beta.name, projectCode: beta.projectCode, startDate: beta.startDate, endDate: beta.endDate, projectStatus: beta.projectStatus, description: beta.description },
      values: { name: 'Beta edited', startDate: '2027-01-02', endDate: '2027-11-30', projectStatus: 'active', description: 'Persisted edit' },
    }));
    await commitProjectGraphMutation(repository, current, moveMilestone({
      milestoneId: 'm2', projectId: 'p2', timelineId: 't2', expectedDate: '2027-02-01', date: '2027-03-04',
    }));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.projects.find((project) => project.id === 'p2')).toMatchObject({ name: 'Beta edited', description: 'Persisted edit' });
    expect(current.milestones.find((milestone) => milestone.id === 'm2')?.date).toBe('2027-03-04');

    current = await commitProjectGraphMutation(repository, current, setProjectManager({ projectId: 'p1', personId: 'person-b' }));
    await commitProjectGraphMutation(repository, current, deleteMilestone({ milestoneId: 'm2', projectId: 'p2', timelineId: 't2' }));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.projectMemberships.find((membership) => membership.personId === 'person-b')?.roles).toContain('project_manager');
    expect(current.milestones.some((milestone) => milestone.id === 'm2')).toBe(false);

    await commitProjectGraphMutation(repository, current, deleteProject({ projectId: 'p2' }));
    repository = new JsonProjectManagementRepository(fileSystem);
    current = (await repository.load())!;
    expect(current.projects.some((project) => project.id === 'p2')).toBe(false);
    expect(current.projectTimelines.some((timeline) => timeline.projectId === 'p2')).toBe(false);
  });
});
