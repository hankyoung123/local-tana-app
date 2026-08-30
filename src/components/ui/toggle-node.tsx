import type { PlateElementProps } from 'platejs/react';

import { PlateElement } from 'platejs/react';

/** Collapse affordances live in the shared outliner gutter, not this type. */
export function ToggleElement(props: PlateElementProps) {
  return <PlateElement {...props} />;
}
