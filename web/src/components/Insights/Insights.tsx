import { useMemo } from 'react';
import type { GroupCode, SosResponse } from '../../api/types';
import { useBracketStore } from '../../state/bracketStore';
import './Insights.css';

interface Props {
  data: SosResponse;
}

function pct(p: number): string {
  return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
}

export function Insights({ data }: Props) {
  const setSelectedTeam = useBracketStore((s) => s.setSelectedTeam);

  const {
    hardestSchedules,
    easiestSchedules,
    toughestGroup,
    easiestGroup,
    likeliestWinner
  } = useMemo(() => {
    const teams = data.teams;

    const bySos = [...teams].sort(
      (a, b) => b.groupOpponentSoS - a.groupOpponentSoS
    );
    const hardestSchedules = bySos.slice(0, 5);
    const easiestSchedules = bySos.slice(-5).reverse();

    const groupAvg = Object.entries(data.groupSimulation).map(([g, rows]) => ({
      group: g as GroupCode,
      avg: rows.reduce((a, r) => a + r.elo, 0) / rows.length
    }));
    groupAvg.sort((a, b) => b.avg - a.avg);
    const toughestGroup = groupAvg[0];
    const easiestGroup = groupAvg[groupAvg.length - 1];

    const allSimRows = Object.values(data.groupSimulation).flat();
    const likeliestWinner = [...allSimRows].sort(
      (a, b) => b.winProb - a.winProb
    )[0];

    return {
      hardestSchedules,
      easiestSchedules,
      toughestGroup,
      easiestGroup,
      likeliestWinner
    };
  }, [data]);

  return (
    <section className="insights" aria-labelledby="insights-title">
      <div className="section-head">
        <h2 id="insights-title">Schedule difficulty</h2>
        <p className="section-sub">Who drew the toughest road to the knockouts.</p>
      </div>

      <div className="insights__grid">
        <div className="sos-list-card">
          <h3>Hardest schedules</h3>
          <ol className="sos-list">
            {hardestSchedules.map((t, i) => (
              <li key={t.code}>
                <span className="sos-list__rank">{i + 1}</span>
                <button
                  className="sos-list__team"
                  onClick={() => setSelectedTeam(t.code)}
                >
                  <span className="sos-list__name">{t.name}</span>
                  <span className="sos-list__group">Grp {t.group}</span>
                </button>
                <span className="sos-list__val sos-hard">
                  {Math.round(t.groupOpponentSoS)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="sos-list-card">
          <h3>Easiest schedules</h3>
          <ol className="sos-list">
            {easiestSchedules.map((t, i) => (
              <li key={t.code}>
                <span className="sos-list__rank">{i + 1}</span>
                <button
                  className="sos-list__team"
                  onClick={() => setSelectedTeam(t.code)}
                >
                  <span className="sos-list__name">{t.name}</span>
                  <span className="sos-list__group">Grp {t.group}</span>
                </button>
                <span className="sos-list__val sos-easy">
                  {Math.round(t.groupOpponentSoS)}
                </span>
              </li>
            ))}
          </ol>
        </div>

        <div className="insight-card">
          <h3>Group of Death</h3>
          <div>
            <strong className="insight__big">Group {toughestGroup.group}</strong>
            <span className="insight__meta">Avg Elo {Math.round(toughestGroup.avg)}</span>
          </div>
          <p className="insight-card__hint">Weakest: Group {easiestGroup.group} · Avg {Math.round(easiestGroup.avg)}</p>
        </div>

        <div className="insight-card">
          <h3>Most likely champion</h3>
          {likeliestWinner && (
            <button
              className="insight__link"
              onClick={() => setSelectedTeam(likeliestWinner.code)}
            >
              <strong>{likeliestWinner.name}</strong>
              <span className="insight__accent">{pct(likeliestWinner.winProb)}</span>
            </button>
          )}
          <p className="insight-card__hint">Highest win-it-all probability</p>
        </div>
      </div>
    </section>
  );
}
