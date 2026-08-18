import { appDataDir, join } from '@tauri-apps/api/path';
import { exists, readDir, readTextFile, remove, type DirEntry } from '@tauri-apps/plugin-fs';

import { atomicWriteWithBackup } from '@/utils/atomicFs';
import type { ProjectGraph } from '../domain/types';
import type { ProjectManagementRepository } from './ProjectManagementRepository';
import {
  parsePersistedProjectManagementData,
  serializePersistedProjectManagementData,
} from './projectManagementPersistence';

const DATA_DIRECTORY = 'project-management';
const DATA_FILENAME = 'project-management.json';
const BACKUP_PREFIX = `.${DATA_FILENAME}.backup.`;

export interface ProjectManagementFileSystem {
  appDataDir(): Promise<string>;
  join(...paths: string[]): Promise<string>;
  exists(path: string): Promise<boolean>;
  readTextFile(path: string): Promise<string>;
  readDir(path: string): Promise<readonly Pick<DirEntry, 'name'>[]>;
  remove(path: string): Promise<void>;
  atomicWriteWithBackup(path: string, content: string): Promise<{ backupPath: string | null }>;
}

const defaultFileSystem: ProjectManagementFileSystem = {
  appDataDir,
  join,
  exists,
  readTextFile,
  readDir,
  remove: (path) => remove(path),
  atomicWriteWithBackup,
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Versioned JSON persistence for the single V1 ProjectGraph aggregate. */
export class JsonProjectManagementRepository implements ProjectManagementRepository {
  private readonly fileSystem: ProjectManagementFileSystem;
  private operationQueue: Promise<void> = Promise.resolve();
  private loadWarning: string | null = null;
  private readOnlyAfterRecovery = false;

  constructor(fileSystem: ProjectManagementFileSystem = defaultFileSystem) {
    this.fileSystem = fileSystem;
  }

  getLoadWarning(): string | null {
    return this.loadWarning;
  }

  async load(): Promise<ProjectGraph | null> {
    return this.enqueue(async () => {
      this.loadWarning = null;
      this.readOnlyAfterRecovery = false;
      const { dataPath, directory } = await this.paths();
      if (!(await this.fileSystem.exists(dataPath))) return null;
      try {
        return parsePersistedProjectManagementData(
          await this.fileSystem.readTextFile(dataPath),
        ).graph;
      } catch (primaryError: unknown) {
        const recovered = await this.loadNewestValidBackup(directory);
        if (recovered) {
          this.readOnlyAfterRecovery = true;
          this.loadWarning = [
            'The current Project Management data could not be loaded.',
            `A last-known-good backup is open read-only. ${errorMessage(primaryError)}`,
          ].join(' ');
          return recovered;
        }
        throw new Error(
          `Project Management persistence error. The original file was preserved. ${errorMessage(primaryError)}`,
          { cause: primaryError },
        );
      }
    });
  }

  async save(graph: ProjectGraph): Promise<void> {
    return this.enqueue(async () => {
      if (this.readOnlyAfterRecovery) {
        throw new Error(
          'Project Management is read-only because it was recovered from backup; the corrupted original was preserved.',
        );
      }
      const { dataPath, directory } = await this.paths();
      const result = await this.fileSystem.atomicWriteWithBackup(
        dataPath,
        serializePersistedProjectManagementData(graph),
      );
      if (result.backupPath) await this.keepOnlyNewestBackup(directory, result.backupPath);
    });
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation, operation);
    this.operationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private async paths() {
    const root = await this.fileSystem.appDataDir();
    const directory = await this.fileSystem.join(root, DATA_DIRECTORY);
    return { directory, dataPath: await this.fileSystem.join(directory, DATA_FILENAME) };
  }

  private async backupPaths(directory: string): Promise<string[]> {
    let entries: readonly Pick<DirEntry, 'name'>[];
    try {
      entries = await this.fileSystem.readDir(directory);
    } catch {
      return [];
    }
    const names = entries
      .map((entry) => entry.name)
      .filter((name): name is string => typeof name === 'string' && name.startsWith(BACKUP_PREFIX))
      .sort((left, right) => right.localeCompare(left));
    return Promise.all(names.map((name) => this.fileSystem.join(directory, name)));
  }

  private async loadNewestValidBackup(directory: string): Promise<ProjectGraph | null> {
    for (const backupPath of await this.backupPaths(directory)) {
      try {
        return parsePersistedProjectManagementData(
          await this.fileSystem.readTextFile(backupPath),
        ).graph;
      } catch {
        // Preserve unreadable files and continue toward older backups.
      }
    }
    return null;
  }

  private async keepOnlyNewestBackup(directory: string, newestBackupPath: string): Promise<void> {
    for (const backupPath of await this.backupPaths(directory)) {
      if (backupPath === newestBackupPath) continue;
      try {
        await this.fileSystem.remove(backupPath);
      } catch {
        // Retention cleanup must not turn a durable save into a failure.
      }
    }
  }
}
