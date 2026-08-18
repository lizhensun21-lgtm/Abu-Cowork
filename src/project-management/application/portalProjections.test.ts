import { describe, expect, it } from 'vitest';

import { projectMembershipId, type ProjectGraph } from '../domain';
import {
  selectCalendarEvents, selectLedgerRows, selectMemberRows, selectResourceRows,
} from './portalProjections';

function graph(): ProjectGraph {
  return {
    projects: [
      { id: 'p-b', name: 'Beta', projectCode: 'B-02', projectStatus: 'planning', startDate: '2026-08-01', endDate: '2026-12-31' },
      { id: 'p-a', name: 'Alpha', projectCode: 'A-01', projectStatus: 'active', startDate: '2026-07-01', endDate: '2026-11-30' },
    ],
    projectTimelines: [
      { id: 'b-yd', projectId: 'p-b', lane: 'YD', name: 'Beta YD', startDate: '2026-08-01', endDate: '2026-12-31', keyResources: [' OEM   Lab ', ''] },
      { id: 'a-yd', projectId: 'p-a', lane: 'YD', name: 'Alpha YD', startDate: '2026-07-01', endDate: '2026-11-30', keyResources: ['OEM Lab', 'Bench A'] },
      { id: 'a-oem', projectId: 'p-a', lane: 'OEM', name: 'Alpha OEM', startDate: '2026-08-01', endDate: '2026-10-31', keyResources: ['oem lab'] },
    ],
    milestones: [
      { id: 'm-2', projectId: 'p-a', timelineId: 'a-yd', lane: 'YD', title: 'Design freeze', code: 'G2', date: '2026-08-17', status: 'in_progress' },
      { id: 'm-1', projectId: 'p-b', timelineId: 'b-yd', lane: 'YD', title: 'Kickoff', code: 'G0', date: '2026-08-17', status: 'completed' },
      { id: 'm-3', projectId: 'p-a', timelineId: 'a-oem', lane: 'OEM', title: 'OEM review', code: 'G3', date: '2026-09-01', status: 'at_risk' },
    ],
    persons: [
      { id: 'person-pm', name: 'Morgan', title: 'Program Lead' },
      { id: 'person-member', name: 'Alex', title: 'Engineer' },
      { id: 'person-retained', name: 'Retained Person' },
    ],
    projectMemberships: [
      { id: projectMembershipId('p-a', 'person-pm'), projectId: 'p-a', personId: 'person-pm', roles: ['project_manager'], status: 'active' },
      { id: projectMembershipId('p-b', 'person-pm'), projectId: 'p-b', personId: 'person-pm', roles: ['member'], status: 'active' },
      { id: projectMembershipId('p-a', 'person-member'), projectId: 'p-a', personId: 'person-member', roles: ['software_owner'], status: 'active' },
      { id: projectMembershipId('p-b', 'person-member'), projectId: 'p-b', personId: 'person-member', roles: ['member'], status: 'inactive' },
    ],
    projectTeams: [{ projectId: 'p-a' }, { projectId: 'p-b' }],
  };
}

describe('Calendar projection', () => {
  it('keeps exact UTC calendar dates, same-day stacks, relations and status', () => {
    const source = graph();
    const rows = selectCalendarEvents(source);
    expect(rows.filter((row) => row.date === '2026-08-17')).toHaveLength(2);
    expect(rows[0]).toMatchObject({ date: '2026-08-17', projectName: 'Alpha', timelineName: 'Alpha YD', status: 'in_progress' });
    expect(rows[1]).toMatchObject({ date: '2026-08-17', projectName: 'Beta', timelineName: 'Beta YD', status: 'completed' });
  });

  it('filters only the derived view and never mutates the graph', () => {
    const source = graph(); const before = structuredClone(source);
    expect(selectCalendarEvents(source, { projectId: 'p-a', lane: 'OEM', status: 'at_risk' }).map((row) => row.milestoneId)).toEqual(['m-3']);
    expect(source).toEqual(before);
  });
});

describe('Ledger projection', () => {
  it('lists all projects with formal PM, lanes and milestone counts', () => {
    const rows = selectLedgerRows(graph());
    expect(rows.map((row) => row.name)).toEqual(['Alpha', 'Beta']);
    expect(rows[0]).toMatchObject({ code: 'A-01', projectManagerName: 'Morgan', milestoneCount: 2, lanes: ['YD', 'OEM'] });
    expect(rows[1]).toMatchObject({ milestoneCount: 1, lanes: ['YD'] });
    expect(rows[1].projectManagerName).toBeUndefined();
  });

  it('searches name/code, filters status and sorts deterministically without mutation', () => {
    const source = graph(); const before = structuredClone(source);
    expect(selectLedgerRows(source, { query: 'beta' }).map((row) => row.projectId)).toEqual(['p-b']);
    expect(selectLedgerRows(source, { query: 'A-01' }).map((row) => row.projectId)).toEqual(['p-a']);
    expect(selectLedgerRows(source, { status: 'planning' }).map((row) => row.projectId)).toEqual(['p-b']);
    expect(selectLedgerRows(source, { sort: 'startDate', direction: 'desc' }).map((row) => row.projectId)).toEqual(['p-b', 'p-a']);
    expect(source).toEqual(before);
  });
});

describe('Resources projection', () => {
  it('normalizes free text, groups uses, excludes blanks and exposes no fake metrics', () => {
    const source = graph(); const before = structuredClone(source);
    const rows = selectResourceRows(source);
    const oemLab = rows.find((row) => row.key === 'oem lab');
    expect(oemLab?.projects).toHaveLength(2);
    expect(oemLab?.timelines).toHaveLength(3);
    expect(rows.map((row) => row.name)).toEqual(['Bench A', 'OEM Lab']);
    expect(oemLab).not.toHaveProperty('utilization');
    expect(oemLab).not.toHaveProperty('capacity');
    expect(source).toEqual(before);
  });
});

describe('Members projection', () => {
  it('lists only Person entities, counts active memberships and retains unassigned people', () => {
    const rows = selectMemberRows(graph());
    expect(rows.map((row) => row.name)).toEqual(['Alex', 'Morgan', 'Retained Person']);
    expect(rows.find((row) => row.name === 'Alex')?.projects).toHaveLength(1);
    expect(rows.find((row) => row.name === 'Morgan')?.projects).toHaveLength(2);
    expect(rows.find((row) => row.name === 'Morgan')?.projects.find((project) => project.projectId === 'p-a')?.isProjectManager).toBe(true);
    expect(rows.find((row) => row.name === 'Retained Person')?.projects).toEqual([]);
  });

  it('searches formal fields and does not infer an Account or mutate the graph', () => {
    const source = graph(); const before = structuredClone(source);
    expect(selectMemberRows(source, 'program lead').map((row) => row.personId)).toEqual(['person-pm']);
    expect(selectMemberRows({ ...source, persons: [] })).toEqual([]);
    expect(source).toEqual(before);
  });
});
