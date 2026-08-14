import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Circle, Triangle } from 'lucide-react';

import type { Project } from '@/project-management/domain';
import { MilestoneDiamond } from './MilestoneDiamond';
import type { MilestoneQuickCardTarget } from './milestoneQuickCardController';
import {
  selectMilestoneQuickCardCluster,
  type MilestoneQuickCardMetrics,
} from './milestoneQuickCardData';
import { presentMilestoneQuickCard } from './milestoneQuickCardPresentation';
import { resolveMilestoneQuickCardPosition } from './milestoneQuickCardPosition';
import {
  getMilestoneStatusStyle,
  getMilestoneVisualStatus,
  milestoneStatusStyleToCssVariables,
} from './milestoneVisualStatus';

export interface MilestoneQuickCardLabels {
  readonly singleCard: string;
  readonly aggregateCard: string;
  readonly plannedDate: string;
  readonly deliverableCompletion: string;
  readonly openIssues: string;
}

function statusVariables(status: Parameters<typeof getMilestoneVisualStatus>[0]) {
  return milestoneStatusStyleToCssVariables(
    getMilestoneStatusStyle(getMilestoneVisualStatus(status)),
  ) as CSSProperties;
}

function measuredRect(element: HTMLElement) {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function MilestoneQuickCard({
  target,
  projects,
  metricsByMilestoneId,
  locale,
  labels,
  onSelectMilestone,
}: {
  readonly target: MilestoneQuickCardTarget;
  readonly projects: ReadonlyArray<Readonly<Project>>;
  readonly metricsByMilestoneId?: ReadonlyMap<string, Readonly<MilestoneQuickCardMetrics>>;
  readonly locale: string;
  readonly labels: MilestoneQuickCardLabels;
  readonly onSelectMilestone: (milestoneId: string) => void;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<ReturnType<typeof resolveMilestoneQuickCardPosition> | null>(null);
  const data = useMemo(() => selectMilestoneQuickCardCluster(
    target.milestones,
    projects,
    metricsByMilestoneId,
  ), [metricsByMilestoneId, projects, target.milestones]);
  const presentation = useMemo(
    () => data.map((item) => presentMilestoneQuickCard(item, locale)),
    [data, locale],
  );
  const aggregate = data.length > 1;
  const roots = useMemo(() => {
    const workspace = target.anchorElement.closest('[data-project-overview-workspace]');
    return {
      overlayRoot: workspace?.querySelector<HTMLElement>('[data-project-overview-overlay-root]') ?? null,
      boundaryElement: workspace?.querySelector<HTMLElement>('.workspace-body') ?? null,
      viewportElement: workspace?.querySelector<HTMLElement>('.timeline-scroll-container') ?? null,
    };
  }, [target.anchorElement]);

  useLayoutEffect(() => {
    const card = cardRef.current;
    const { boundaryElement, viewportElement } = roots;
    if (!card || !boundaryElement || !viewportElement) return undefined;
    let frameId: number | null = null;
    const update = () => {
      frameId = null;
      const boundary = measuredRect(boundaryElement);
      const viewport = measuredRect(viewportElement);
      const clippedLeft = Math.max(viewport.left, 0);
      const clippedTop = Math.max(boundary.top, 0);
      const clippedRight = Math.min(viewport.right, window.innerWidth);
      const clippedBottom = Math.min(viewport.bottom, boundary.bottom, window.innerHeight);
      const clippedBoundary = {
        left: clippedLeft,
        top: clippedTop,
        right: clippedRight,
        bottom: clippedBottom,
        width: Math.max(clippedRight - clippedLeft, 0),
        height: Math.max(clippedBottom - clippedTop, 0),
      };
      setPosition(resolveMilestoneQuickCardPosition({
        anchor: measuredRect(target.anchorElement),
        boundary: clippedBoundary,
        previewWidth: card.offsetWidth || card.getBoundingClientRect().width,
        previewHeight: card.offsetHeight || card.getBoundingClientRect().height,
      }));
    };
    const schedule = () => {
      if (frameId === null) frameId = requestAnimationFrame(update);
    };
    update();
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    resizeObserver?.observe(card);
    resizeObserver?.observe(target.anchorElement);
    resizeObserver?.observe(boundaryElement);
    resizeObserver?.observe(viewportElement);
    window.addEventListener('resize', schedule);
    return () => {
      if (frameId !== null) cancelAnimationFrame(frameId);
      resizeObserver?.disconnect();
      window.removeEventListener('resize', schedule);
    };
  }, [roots, target.anchorElement]);

  if (!roots.overlayRoot) return null;

  return createPortal(
    <div
      ref={cardRef}
      data-milestone-popover-root
      data-no-timeline-pan
      data-quick-card-kind={aggregate ? 'aggregate' : 'single'}
      className={`milestone-hover-preview milestone-hover-preview--${aggregate ? 'aggregate' : 'single'}`}
      role={aggregate ? 'dialog' : 'tooltip'}
      aria-label={aggregate ? labels.aggregateCard : labels.singleCard}
      style={{
        left: position?.left ?? 0,
        top: position?.top ?? 0,
        maxHeight: position?.maxHeight,
        visibility: position ? 'visible' : 'hidden',
      }}
    >
      {aggregate ? (
        <div className="milestone-hover-preview__list">
          {data.map((item, index) => {
            const itemPresentation = presentation[index];
            return (
              <button
                key={item.id}
                type="button"
                className="milestone-hover-preview__aggregate-row"
                onClick={() => onSelectMilestone(item.id)}
              >
                <MilestoneDiamond
                  className="milestone-hover-preview__status"
                  style={statusVariables(item.status)}
                />
                <span className="milestone-hover-preview__aggregate-title">{itemPresentation.headline}</span>
                <span title={labels.deliverableCompletion}>{itemPresentation.completion}</span>
                <span title={labels.openIssues}>{itemPresentation.issues}</span>
                <span title={labels.plannedDate}>{itemPresentation.plannedDate}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <>
          <div className="milestone-hover-preview__identity">
            <MilestoneDiamond
              className="milestone-hover-preview__identity-status"
              style={statusVariables(data[0]?.status)}
            />
            <div className="milestone-hover-preview__identity-copy">
              <div className="milestone-hover-preview__title">{presentation[0]?.headline}</div>
              <div className="milestone-hover-preview__project">{presentation[0]?.projectName}</div>
            </div>
          </div>
          <div className="milestone-hover-preview__divider" />
          <div className="milestone-hover-preview__metadata">
            <span title={labels.plannedDate}><CalendarDays aria-hidden="true" />{presentation[0]?.plannedDate}</span>
            <span title={labels.deliverableCompletion}><Circle aria-hidden="true" />{presentation[0]?.completion}</span>
            <span title={labels.openIssues}><Triangle aria-hidden="true" />{presentation[0]?.issues}</span>
          </div>
        </>
      )}
    </div>,
    roots.overlayRoot,
  );
}
