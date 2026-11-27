import { useEffect, useState } from 'react';
import { getBackend } from '../../backend';
import { devFixture } from './devFixture';
import { Monitor } from './Monitor';
import { PlaybackEngine } from './playback';
import { Scopes } from './Scopes';
import { useTransportKeys } from './useTransportKeys';

/** Nur Entwicklung (`/_dev/wiedergabe`): Programm-Monitor und Scopes für eine Fixture-Sequenz. Task 12 verdrahtet das in die Werkstatt. */
export default function DevWiedergabe() {
  const [engine, setEngine] = useState<PlaybackEngine | null>(null);
  const [fix] = useState(devFixture);

  useEffect(() => {
    const e = new PlaybackEngine(getBackend(), () => fix.seq, () => fix.media, document.createElement('canvas'));
    setEngine(e);
    return () => {
      e.dispose();
      setEngine(null);
    };
  }, [fix]);
  useTransportKeys(engine);

  return (
    <main className="main werkstatt">
      <div className="werkstatt-page">
        <h1>Wiedergabe (Entwicklung)</h1>
        <p className="page-lead">J/K/L: rückwärts, Halt, vorwärts · ←/→ ein Bild · ⇧←/⇧→ fünf Bilder · Leertaste Start/Halt</p>
        {engine && (
          <>
            <Monitor engine={engine} label="Programm" fps={fix.seq.fps} inPoint={fix.seq.inPoint} outPoint={fix.seq.outPoint} aspect={fix.seq.width / fix.seq.height} />
            <Scopes engine={engine} />
          </>
        )}
      </div>
    </main>
  );
}
