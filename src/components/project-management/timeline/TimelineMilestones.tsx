import {
  memo,
  useMemo,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';

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
import type { MilestoneDragSession } from './timelineDragSession';

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
  onPreviewEnter,
  onPreviewLeave,
  dragSession,
  savingMilestoneIds,
  onDragPointerDown,
  onDragPointerMove,
  onDragPointerUp,
  onDragPointerCancel,
  onMilestoneClick,
  previewDatesByMilestoneId,
}: {
  readonly milestones: ReadonlyArray<Readonly<TimelineMilestone>>;
  readonly coordinates: TimelineCoordinates;
  readonly onPreviewEnter?: (
    anchor: HTMLElement,
    milestones: ReadonlyArray<Readonly<TimelineMilestone>>,
  ) => void;
  readonly onPreviewLeave?: (milestoneId: string) => void;
  readonly dragSession?: Readonly<MilestoneDragSession> | null;
  readonly savingMilestoneIds?: ReadonlySet<string>;
  readonly onDragPointerDown?: (
    event: ReactPointerEvent<HTMLSpanElement>,
    milestone: Readonly<TimelineMilestone>,
  ) => void;
  readonly onDragPointerMove?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  readonly onDragPointerUp?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  readonly onDragPointerCancel?: (event: ReactPointerEvent<HTMLSpanElement>) => void;
  readonly onMilestoneClick?: (milestoneId: string) => void;
  readonly previewDatesByMilestoneId?: ReadonlyMap<string, string>;
}) {
  const presentedMilestones = useMemo(() => milestones.map((milestone) => (
    previewDatesByMilestoneId?.has(milestone.id) || dragSession?.sourceEntityId === milestone.id
      ? {
          ...milestone,
          date: previewDatesByMilestoneId?.get(milestone.id) ?? dragSession!.previewDate,
        }
      : milestone
  )), [dragSession, milestones, previewDatesByMilestoneId]);
  const layout = useMemo(() => buildMilestoneClusterLayout(
    presentedMilestones.map((milestone, stableOrder) => ({
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
  ), [coordinates, presentedMilestones]);
  const milestonesById = useMemo(
    () => new Map(presentedMilestones.map((milestone) => [milestone.id, milestone])),
    [presentedMilestones],
  );

  return presentedMilestones.map((milestone) => {
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
    const isDragging = dragSession?.sourceEntityId === milestone.id
      && dragSession.hasExceededDragThreshold;
    const isSaving = savingMilestoneIds?.has(milestone.id) ?? false;

    return (
      <span
        key={milestone.id}
        data-milestone-id={milestone.id}
        data-milestone-cluster-id={milestoneLayout.clusterId}
        data-milestone-cluster-size={milestoneLayout.clusterSize}
        data-cluster-primary={String(milestoneLayout.isPrimary)}
        data-milestone-label-stack-order={milestoneLayout.labelStackOrder}
        data-milestone-visual-status={visualStatus}
        data-milestone-preview-date={isDragging ? milestone.date : undefined}
        data-milestone-dragging={isDragging || undefined}
        aria-busy={isSaving || undefined}
        data-no-timeline-pan
        className={`milestone-node${milestoneLayout.clusterSize > 1 ? ' is-clustered' : ''}${isDragging ? ' is-dragging' : ''}${isSaving ? ' is-saving' : ''}`}
        style={{
          left: coordinates.dateToX(milestone.date),
          '--milestone-label-stack-z': 4 + Math.min(milestoneLayout.labelStackOrder, 20),
          '--milestone-cluster-marker-offset': `${milestoneLayout.markerVisualOffset}px`,
          ...statusVariables,
        } as CSSProperties}
        role={isHiddenClusterMember ? undefined : 'img'}
        aria-hidden={isHiddenClusterMember || undefined}
        aria-label={isHiddenClusterMember ? undefined : accessibleLabel}
        onPointerEnter={milestoneLayout.isPrimary && !isDragging ? (event) => {
          const clusterMilestones = (layout.groups.get(milestoneLayout.clusterId) ?? [milestone.id])
            .map((milestoneId) => milestonesById.get(milestoneId))
            .filter((item): item is Readonly<TimelineMilestone> => item !== undefined);
          onPreviewEnter?.(event.currentTarget, clusterMilestones);
        } : undefined}
        onPointerLeave={milestoneLayout.isPrimary
          ? () => onPreviewLeave?.(milestone.id)
          : undefined}
        onPointerDown={milestoneLayout.isPrimary ? (event) => {
          onDragPointerDown?.(event, milestone);
        } : undefined}
        onPointerMove={milestoneLayout.isPrimary ? onDragPointerMove : undefined}
        onPointerUp={milestoneLayout.isPrimary ? onDragPointerUp : undefined}
        onPointerCancel={milestoneLayout.isPrimary ? onDragPointerCancel : undefined}
        onLostPointerCapture={milestoneLayout.isPrimary ? onDragPointerCancel : undefined}
        onClick={milestoneLayout.isPrimary ? () => onMilestoneClick?.(milestone.id) : undefined}
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
          className={`milestone-node__label${isHiddenClusterMember ? ' is-cluster-hidden' : ''}${milestoneLayout.isCoveredByNextLabel ? ' is-covered-by-next' : ''}`}
          style={{
            left: milestoneLayout.labelLeft,
            width: milestoneLayout.labelWidth,
            '--milestone-label-covered-width': `${milestoneLayout.coveredWidth}px`,
          } as CSSProperties}
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
