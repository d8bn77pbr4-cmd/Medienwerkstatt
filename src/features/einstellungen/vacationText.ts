import type { canAddVacation } from '../../domain/assignments/schedule';

type Refusal = Extract<ReturnType<typeof canAddVacation>, { ok: false }>['reason'];

/** Meldung zu jedem Grund, aus dem ein Urlaub abgelehnt wird. */
export function vacationRefusalText(reason: Refusal): string {
  switch (reason) {
    case 'past':
      return 'Der Beginn liegt in der Vergangenheit. Der Urlaub kann frühestens heute beginnen.';
    case 'over14days':
      return 'Mehr als 14 Urlaubstage im Jahr gibt es nicht. Verkürze den Urlaub oder entferne einen anderen.';
    case 'overlap':
      return 'Dieser Urlaub überschneidet sich mit einem eingetragenen Urlaub.';
    case 'invalid':
      return 'Das Ende muss nach dem Beginn liegen. Prüfe beide Daten.';
  }
}
