import { CircleMinus, CirclePlus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Assignment } from '../../domain/assignments/types';
import { fmtDe } from '../../domain/chef/format';
import { loadRules } from '../../domain/chef/rules';
import { applicableCategories, type Deduction, type Evaluation } from '../../domain/chef/types';
import { CountUp } from './CountUp';
import { CATEGORY_TITLES, GEMINI_TITLES, RULE_TITLES } from './ruleTitles';
import { Stage } from './Stage';
import { useWerkstatt } from '../werkstatt/uiStore';

/** „−5“ / „+3“ mit echtem Minuszeichen. */
export const signed = (n: number): string => (n > 0 ? `+${fmtDe(n, 0)}` : fmtDe(n, 0));

/** Springt in das Werkzeug-Panel, das den Abzug behebt (Werkstatt des Auftrags). */
export function useJumpToTool(assignmentId?: string) {
  const navigate = useNavigate();
  return (panel: NonNullable<Deduction['tool']>['panel']) => {
    useWerkstatt.getState().focusPanel(panel);
    navigate('/', assignmentId ? { state: { assignmentId } } : undefined);
  };
}

function Points({ value }: { value: number }) {
  const good = value >= 0;
  const Icon = good ? CirclePlus : CircleMinus;
  return (
    <span className={`pts ${good ? 'is-good' : 'is-bad'}`}>
      <Icon aria-hidden="true" />
      <span>{signed(value)}</span>
      <span className="sr-only">{good ? ' Punkte Bonus' : ' Punkte Abzug'}</span>
    </span>
  );
}

function DeductionItem({ d, onOpen }: { d: Deduction; onOpen?: () => void }) {
  return (
    <li className="ded" data-rule={d.ruleId}>
      <div className="ded-head">
        <span className="ded-kicker">{RULE_TITLES[d.ruleId] ?? d.ruleId}</span>
        <Points value={d.points} />
      </div>
      <h4>{d.label}</h4>
      <dl className="ded-facts">
        <div>
          <dt>Soll</dt>
          <dd>{d.soll}</dd>
        </div>
        <div>
          <dt>Ist</dt>
          <dd>{d.ist}</dd>
        </div>
        <div>
          <dt>Punkte</dt>
          <dd>{signed(d.points)}</dd>
        </div>
      </dl>
      {d.fix && (
        <div className="ded-fix">
          <strong>So behebst du es</strong>
          <p>{d.fix}</p>
          {d.tool && onOpen && (
            <button type="button" className="btn pressable" onClick={onOpen}>
              In der Werkstatt öffnen
            </button>
          )}
        </div>
      )}
    </li>
  );
}

export type ProtokollProps = {
  evaluation: Evaluation;
  assignment: Assignment | undefined;
  /** Frisch nach der Abnahme: Gesamtpunkte zählen einmal hoch. */
  fresh: boolean;
};

/** Abnahmeprotokoll in drei Stufen (Spec §10.2): Kurz gesagt · Verstehen · Für Profis. */
export function Protokoll({ evaluation: e, assignment, fresh }: ProtokollProps) {
  const jump = useJumpToTool(assignment?.id);
  const cats = applicableCategories(e);
  const bonusSum = e.bonus.reduce((s, b) => s + b.points, 0);
  return (
    <>
      <section className="card kurz" aria-labelledby="kurz-h">
        <h2 id="kurz-h">Kurz gesagt</h2>
        <p className="kurz-total">
          <CountUp id={e.id} value={e.total} animate={fresh} />
          <span className="kurz-of"> von {loadRules().maxScore} Punkten</span>
        </p>
        <p className="kurz-phrase">{e.phrase}</p>
      </section>

      <Stage id="protokoll-verstehen" title="Verstehen" defaultOpen>
        <ul className="bars">
          {cats.map((k) => {
            const c = e.categories[k];
            return (
              <li key={k}>
                <div className="bar-head">
                  <span>{CATEGORY_TITLES[k]}</span>
                  <span className="bar-val">
                    {c.points} / {c.max}
                  </span>
                </div>
                <div className="bar" aria-hidden="true">
                  <span style={{ transform: `scaleX(${c.max > 0 ? c.points / c.max : 0})` }} />
                </div>
              </li>
            );
          })}
        </ul>
        {e.late && (
          <p className="bar-extra is-bad">
            <CircleMinus aria-hidden="true" /> Verspätung: {signed(e.late.points)} Punkte ({e.late.ist})
          </p>
        )}
        {e.bonus.length > 0 && (
          <p className="bar-extra is-good">
            <CirclePlus aria-hidden="true" /> Bonus: {signed(bonusSum)} Punkte ({e.bonus.map((b) => b.label).join(', ')})
          </p>
        )}
      </Stage>

      <Stage id="protokoll-profis" title="Für Profis">
        {cats.map((k) => (
          <div key={k} className="profis-group">
            <h3>
              {CATEGORY_TITLES[k]} · {e.categories[k].points} von {e.categories[k].max}
            </h3>
            {e.categories[k].deductions.length === 0 ? (
              <p className="muted">Keine Abzüge.</p>
            ) : (
              <ul className="deds">
                {e.categories[k].deductions.map((d, i) => (
                  <DeductionItem key={`${d.ruleId}-${i}`} d={d} onOpen={d.tool ? () => jump(d.tool!.panel) : undefined} />
                ))}
              </ul>
            )}
          </div>
        ))}
        {e.late && (
          <div className="profis-group">
            <h3>Verspätung</h3>
            <ul className="deds">
              <DeductionItem d={e.late} />
            </ul>
          </div>
        )}
        {e.bonus.length > 0 && (
          <div className="profis-group">
            <h3>Bonus</h3>
            <ul className="deds">
              {e.bonus.map((b) => (
                <DeductionItem key={b.ruleId} d={b} />
              ))}
            </ul>
          </div>
        )}
        {e.gemini && (
          <div className="profis-group">
            <h3>Gestaltung (Gemini)</h3>
            <p>{e.gemini.summary}</p>
            <ul className="deds">
              {e.gemini.criteria.map((c) => (
                <li key={c.key} className="ded">
                  <div className="ded-head">
                    <span className="ded-kicker">{GEMINI_TITLES[c.key] ?? c.key}</span>
                    <Points value={c.shift} />
                  </div>
                  <h4>{c.verdict}</h4>
                  <p>{c.reason}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Stage>
    </>
  );
}
