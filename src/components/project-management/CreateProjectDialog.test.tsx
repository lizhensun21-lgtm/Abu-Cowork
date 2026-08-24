// @vitest-environment happy-dom

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { setLanguage } from '@/i18n';
import type { Person } from '@/project-management/domain';

import { CreateProjectDialog } from './CreateProjectDialog';

const persons: Person[] = [
  { id: 'person-a', name: '王静', title: '系统工程师' },
  { id: 'person-b', name: '陈宇', title: '项目经理' },
];

function completeSkeleton() {
  fireEvent.change(screen.getByLabelText('项目名称 *'), { target: { value: 'Parity Project' } });
  fireEvent.change(screen.getByLabelText('开始日期 *'), { target: { value: '2026-09-01' } });
  fireEvent.change(screen.getByLabelText('结束日期 *'), { target: { value: '2027-03-31' } });
  fireEvent.click(screen.getByRole('button', { name: '下一步' }));
}

describe('CreateProjectDialog Abu-Web parity contract', () => {
  beforeEach(() => setLanguage('zh-CN'));

  it('uses the two-step Web flow without OEM/Tier1 checkboxes or the I7 shortcut', () => {
    render(<CreateProjectDialog persons={persons} onClose={vi.fn()} onCreate={vi.fn()} />);
    expect(screen.getByLabelText('1. 项目骨架')).toBeInTheDocument();
    expect(screen.getByLabelText('生命周期阶段')).toHaveValue('');
    expect(screen.queryByText('初始 YD 里程碑（可选）')).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'OEM' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Tier1' })).not.toBeInTheDocument();

    completeSkeleton();
    expect(screen.getByLabelText('2. 初始计划与负责人')).toBeInTheDocument();
    expect(screen.getByText('未添加里程碑；创建后也可继续完善计划。')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '跳过并创建' })).toBeInTheDocument();
  });

  it('submits full Milestone and formal Person/Membership drafts in one command', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateProjectDialog persons={persons} onClose={vi.fn()} onCreate={onCreate} />);
    completeSkeleton();

    fireEvent.change(screen.getByLabelText('项目负责人（选填）'), { target: { value: 'person-b' } });
    fireEvent.change(screen.getByLabelText('选择人员'), { target: { value: 'person-a' } });
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));
    fireEvent.click(screen.getByRole('checkbox', { name: '系统负责人' }));
    fireEvent.click(screen.getByRole('button', { name: '新增里程碑' }));

    const milestone = screen.getByText('里程碑 1').closest('article');
    expect(milestone).not.toBeNull();
    const row = within(milestone!);
    fireEvent.change(row.getByLabelText('名称 *'), { target: { value: 'Supplier gate' } });
    fireEvent.change(row.getByLabelText('所属计划 *'), { target: { value: 'Tier1' } });
    fireEvent.change(row.getByLabelText('计划日期 *'), { target: { value: '2026-11-15' } });
    fireEvent.change(row.getByLabelText('阶段门'), { target: { value: 'G2' } });
    fireEvent.change(row.getByLabelText('备注'), { target: { value: 'Review' } });
    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));

    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Parity Project',
      projectManagerId: 'person-b',
      initialMembers: [{ personId: 'person-a', roles: ['system_owner'] }],
      initialMilestones: [{
        title: 'Supplier gate', lane: 'Tier1', date: '2026-11-15', code: 'G2', note: 'Review',
      }],
    }));
  });

  it('makes Milestones and Team optional through Skip and create', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateProjectDialog persons={persons} onClose={vi.fn()} onCreate={onCreate} />);
    completeSkeleton();
    fireEvent.click(screen.getByRole('button', { name: '跳过并创建' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      initialMembers: [], initialMilestones: [],
    }));
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('projectManagerId');
  });

  it('explains an empty formal Person pool and still creates without PM or members', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateProjectDialog persons={[]} onClose={vi.fn()} onCreate={onCreate} />);
    completeSkeleton();

    expect(screen.getByRole('note')).toHaveTextContent('当前没有正式 Person 资料');
    expect(screen.getByLabelText('项目负责人（选填）')).toHaveDisplayValue('暂无可选人员（可不指定）');
    expect(screen.getByLabelText('选择人员')).toHaveDisplayValue('暂无可选人员');
    expect(screen.getByRole('button', { name: '添加成员' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      initialMembers: [], initialMilestones: [],
    }));
    expect(onCreate.mock.calls[0][0]).not.toHaveProperty('projectManagerId');
  });

  it('lists only formal Persons and prevents selecting the same initial member twice', async () => {
    const onCreate = vi.fn().mockResolvedValue(undefined);
    render(<CreateProjectDialog persons={persons} onClose={vi.fn()} onCreate={onCreate} />);
    completeSkeleton();

    const manager = screen.getByLabelText('项目负责人（选填）');
    expect(within(manager).getAllByRole('option').map((option) => option.getAttribute('value')))
      .toEqual(['', 'person-a', 'person-b']);
    fireEvent.change(manager, { target: { value: 'person-a' } });

    const picker = screen.getByLabelText('选择人员');
    fireEvent.change(picker, { target: { value: 'person-a' } });
    fireEvent.click(screen.getByRole('button', { name: '添加成员' }));
    expect(within(picker).queryByRole('option', { name: /王静/ })).not.toBeInTheDocument();
    expect(within(picker).getByRole('option', { name: /陈宇/ })).toBeInTheDocument();
    expect(screen.getByText('普通成员')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: '新建项目' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledOnce());
    expect(onCreate).toHaveBeenCalledWith(expect.objectContaining({
      projectManagerId: 'person-a',
      initialMembers: [{ personId: 'person-a', roles: [] }],
    }));
  });

  it('has no Abu Account or current-user fallback in the Person selector boundary', () => {
    const source = readFileSync(resolve('src/components/project-management/CreateProjectDialog.tsx'), 'utf8');
    expect(source).toContain('persons: readonly Person[]');
    expect(source).not.toMatch(/PortalUserAdapter|useSettingsStore|Abu Account|currentUser/);
  });
});
