import type { MilestoneQuickCardData } from './milestoneQuickCardData';

export interface MilestoneQuickCardPresentation {
  readonly headline: string;
  readonly projectName: string;
  readonly plannedDate: string;
  readonly completion: string;
  readonly issues: string;
}

export function formatMilestoneHeadline(data: Pick<MilestoneQuickCardData, 'code' | 'name'>) {
  const name = data.name.trim();
  if (!data.code) return name || '—';
  if (!name) return data.code;
  if (!name.startsWith(data.code)) return `${data.code} ${name}`;
  let remainder = name.slice(data.code.length).trimStart();
  while (remainder.startsWith(data.code)) remainder = remainder.slice(data.code.length).trimStart();
  return remainder ? `${data.code} ${remainder}` : data.code;
}

export function formatMilestoneDate(date: string, locale: string) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/u.exec(date);
  if (!parts) return '—';
  const value = new Date(Date.UTC(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3])));
  return new Intl.DateTimeFormat(locale, { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(value);
}

export function presentMilestoneQuickCard(
  data: Readonly<MilestoneQuickCardData>,
  locale: string,
): MilestoneQuickCardPresentation {
  return {
    headline: formatMilestoneHeadline(data),
    projectName: data.projectName || '—',
    plannedDate: formatMilestoneDate(data.plannedDate, locale),
    completion: data.deliverableCompletionRate === null ? '—' : `${data.deliverableCompletionRate}%`,
    issues: data.openIssueCount === null ? '—' : String(data.openIssueCount),
  };
}
