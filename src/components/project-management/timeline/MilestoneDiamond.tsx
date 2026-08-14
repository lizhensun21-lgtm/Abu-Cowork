import type { SVGProps } from 'react';

const MILESTONE_DIAMOND_POINTS = '5,0.5 9.5,6.5 5,12.5 0.5,6.5';

export function MilestoneDiamond(props: Omit<SVGProps<SVGSVGElement>, 'children'>) {
  return (
    <svg viewBox="0 0 10 13" focusable="false" {...props}>
      <polygon className="milestone-diamond__shape" points={MILESTONE_DIAMOND_POINTS} />
    </svg>
  );
}
