import { AlarmClockOff, CircleAlert, CircleCheck, CircleX, Clock, Hash } from 'lucide-react';
import type { ReactNode } from 'react';
import type { Status, StatusKind } from './format';

const ICONS: Record<StatusKind, ReactNode> = {
  offen: <Clock aria-hidden="true" />,
  bald: <CircleAlert aria-hidden="true" />,
  verspaetet: <AlarmClockOff aria-hidden="true" />,
  abgegeben: <CircleCheck aria-hidden="true" />,
  bewertet: <Hash aria-hidden="true" />,
  verfallen: <CircleX aria-hidden="true" />,
};

/** Dreifach codiert: Farbe (Ton) + Symbol + Text. */
export function StatusBadge({ status }: { status: Status }) {
  return (
    <span className={`status status-${status.tone}`} data-status={status.kind}>
      {ICONS[status.kind]}
      <span>{status.label}</span>
    </span>
  );
}
