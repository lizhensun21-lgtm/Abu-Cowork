import { memo, useMemo, type CSSProperties } from 'react';

import type { TimelineMilestone } from '@/project-management/domain';
import type { TimelineCoordinates } from '@/project-management/timeline';
import { MilestoneDiamond } from './MilestoneDiamond';
import {
  buildMilestoneClusterLayout,
  milestoneClusterAdditionalCount,
} from './milestoneClusters';
import {
  getMilestoneStatusStyle,
  getMilestoneVisualStatus,
  milestoneStatusStyleToCssVariables,
} from './milestoneVisualStatus';

const MILESTONE_LABEL_MAX_WIDTH = 200;
const MILESTONE_LABEL_MIN_WIDTH = 12;
const MILESTONE_NODE_WIDTH = 28;

function milestoneLabel(milestone: Readonly<TimelineMilestone>) {
  const code = milestone.stageGate?.trim();
  const name = milestone.name.trim();
  if (!code) return name || 'Unnamed milestone';
  if (!name) return code;
  if (!name.startsWith(code)) return `${code} ${name}`;
  let remainder = name.slice(code.length).trimStart();
  while (remainder.startsWith(code)) remainder = remainder.slice(code.length).trimStart();
  return remainder ? `${code} ${remainder}` : code;
}

function estimateMilestoneLabelWidth(label: string) {
  const width = Array.from(label).reduce((total, character) => {
    if (/[\u2e80-\u9fff\uf900-\ufaff]/u.test(character)) return total + 12;
    if (/\s/u.test(character)) return total + 3;
    if (/[A-Z0-9]/u.test(character)) return total + 7;
    if (/[a-z]/u.test(character)) return total + 6;
    return total + 5.5;
  }, 0);
  return Math.min(Math.max(Math.ceil(width + 4), MILESTONE_LABEL_MIN_WIDTH), MILESTONE_LABEL_MAX_WIDTH);
}

export const TimelineMilestones = memo(function TimelineMilestones({
  milestones,
  coordinates,
}: {
  readonly milestones: ReadonlyArray<Readonly<TimelineMilestone>>;
  readonly coordinates: TimelineCoordinates;
}) {
  const layout = useMemo(() => buildMilestoneClusterLayout(
    milestones.map((milestone, stableOrder) => ({
      id: milestone.id,
      markerX: coordinates.dateToX(milestone.date),
      groupKey: `${milestone.projectId}:${milestone.timelineId}`,
      stableOrder,
      labelWidth: estimateMilestoneLabelWidth(milestoneLabel(milestone)),
      clusterLabelWidth: estimateMilestoneLabelWidth(milestoneLabel(milestone)),
      collisionLabelWidth: estimateMilestoneLabelWidth(milestoneLabel(milestone)),
    })),
    MILESTONE_NODE_WIDTH,
    { left: 0, right: coordinates.canvasWidth },
  ), [coordinates, milestones]);

  return milestones.map((milestone) => {
    const milestoneLayout = layout.layouts.get(milestone.id);
    if (!milestoneLayout) return null;
    const isHiddenClusterMember = milestoneLayout.clusterSize > 1 && !milestoneLayout.isPrimary;
    const additionalCount = milestoneClusterAdditionalCount(milestoneLayout.clusterSize);
    const label = milestoneLabel(milestone);
    const accessibleLabel = additionalCount > 0 ? `${label} +${additionalCount}` : label;
    const visualStatus = getMilestoneVisualStatus(milestone.status);
    const statusVariables = milestoneStatusStyleToCssVariables(
      getMilestoneStatusStyle(visualStatus),
    );
    const backgroundLayerCount = Math.min(milestoneLayout.clusterSize - 1, 2);

    return (
      <span
        key={milestone.id}
        data-milestone-id={milestone.id}
        data-milestone-cluster-id={milestoneLayout.clusterId}
        data-milestone-cluster-size={milestoneLayout.clusterSize}
        data-cluster-primary={String(milestoneLayout.isPrimary)}
        data-milestone-visual-status={visualStatus}
        data-no-timeline-pan
        className={`milestone-node${milestoneLayout.clusterSize > 1 ? ' is-clustered' : ''}`}
        style={{
          left: coordinates.dateToX(milestone.date),
          '--milestone-cluster-z': 4 + Math.min(milestoneLayout.visualOrder, 20),
          '--milestone-cluster-marker-offset': `${milestoneLayout.markerVisualOffset}px`,
          ...statusVariables,
        } as CSSProperties}
        role={isHiddenClusterMember ? undefined : 'img'}
        aria-hidden={isHiddenClusterMember || undefined}
        aria-label={isHiddenClusterMember ? undefined : accessibleLabel}
        title={isHiddenClusterMember ? undefined : `${accessibleLabel} · ${milestone.date}`}
      >
        {milestoneLayout.isPrimary ? (
          <span className="milestone-node__marker-hit" aria-hidden="true">
            {milestoneLayout.clusterSize > 1 ? (
              <span className="milestone-node__cluster-marker">
                {Array.from({ length: backgroundLayerCount }, (_, index) => (
                  <MilestoneDiamond
                    key={index}
                    className={`milestone-node__cluster-background milestone-node__cluster-background--layer-${index + 1}`}
                  />
                ))}
                <MilestoneDiamond className="milestone-node__diamond milestone-node__cluster-foreground" />
              </span>
            ) : (
              <MilestoneDiamond className="milestone-node__diamond" />
            )}
          </span>
        ) : null}
        <span
          className={`milestone-node__label${isHiddenClusterMember ? ' is-cluster-hidden' : ''}`}
          style={{ left: milestoneLayout.labelLeft, width: milestoneLayout.labelWidth }}
          aria-hidden={isHiddenClusterMember || undefined}
        >
          <span className="milestone-node__label-text" style={{ width: milestoneLayout.textWidth }}>
            {label}
          </span>
          {milestoneLayout.isPrimary && additionalCount > 0 ? (
            <span className="milestone-node__cluster-count">+{additionalCount}</span>
          ) : null}
        </span>
      </span>
    );
  });
});
