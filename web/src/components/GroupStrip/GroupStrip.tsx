import { useMemo } from 'react';
import type { GroupCode, SosResponse, Team } from '../../api/types';
import { useBracketStore } from '../../state/bracketStore';
import './GroupStrip.css';

interface Props {
  data: SosResponse;
}

const GROUP_ORDER: GroupCode[] = ['A','B','C','D','E','F','G','H','I','J','K','L'];

function pct(p: number): string {
  return `${Math.round(p * 100)}%`;
}

function qualifyProb(row: { pos1Prob: number; pos2Prob: number; pos3Prob: number }): number {
  // Top 2 advance + 8 of 12 third-placed teams advance (~2/3).
  return row.pos1Prob + row.pos2Prob + row.pos3Prob * (2 / 3);
}

function difficultyClass(sosRank: number, total: number): string {
  const pctRank = sosRank / total;
  if (pctRank <= 0.2) return 'sos-hard';
  if (pctRank <= 0.5) return 'sos-med';
  return 'sos-easy';
}

export function GroupStrip({ data }: Props) {
  const setSelectedTeam = useBracketStore((s) => s.setSelectedTeam);
  const sim = data.groupSimulation;
  const teamCount = data.teams.length;

  const teamByCode = useMemo(() => {
    const map: Record<string, Team> = {};
    for (const t of data.teams) map[t.code] = t;
    return map;
  }, [data.teams]);

  const groupStrength = useMemo(() => {
    const entries = Object.entries(sim).map(([g, rows]) => ({
      group: g as GroupCode,
      avg: rows.reduce((a, r) => a + r.elo, 0) / rows.length
    }));
    entries.sort((a, b) => b.avg - a.avg);
    const ranks: Record<GroupCode, number> = {} as Record<GroupCode, number>;
    entries.forEach((e, i) => (ranks[e.group] = i + 1));
    return ranks;
  }, [sim]);

  return (
    <section className="group-board" aria-labelledby="group-board-title">
      <div className="section-head">
        <h2 id="group-board-title">Group stage &amp; Strength of Schedule</h2>
        <p className="section-sub">
          48 teams, 12 groups. Each row shows the team&apos;s Elo, the average Elo of their three
          group opponents (SoS), and their odds of advancing. Hardest schedules in red.
        </p>
      </div>

      <div className="group-board__grid">
        {GROUP_ORDER.map((g) => {
          const teams = [...(sim[g] ?? [])].sort(
            (a, b) => qualifyProb(b) - qualifyProb(a)
          );
          const rank = groupStrength[g];
          return (
            <div key={g} className="group-board-card">
              <div className="group-board-card__header">
                <span className="group-board-card__tag">Group {g}</span>
                <span className="group-board-card__rank" title="Group strength rank">
                  #{rank} strongest
                </span>
              </div>
              <div className="group-board-card__cols">
                <span>Team</span>
                <span>Elo</span>
                <span title="Avg Elo of group opponents">SoS</span>
                <span title="Probability of advancing out of the group">Adv</span>
              </div>
              <ul className="group-board-card__teams">
                {teams.map((t) => {
                  const meta = teamByCode[t.code];
                  const sos = meta?.groupOpponentSoS ?? 0;
                  const sosRank = meta?.sosRank ?? 0;
                  const q = qualifyProb(t);
                  return (
                    <li key={t.code}>
                      <button
                        className="group-board-card__team"
                        onClick={() => setSelectedTeam(t.code)}
                      >
                        <span className="gbc-name" title={t.name}>{t.name}</span>
                        <span className="gbc-elo">{t.elo}</span>
                        <span
                          className={`gbc-sos ${difficultyClass(sosRank, teamCount)}`}
                          title={`SoS rank #${sosRank} of ${teamCount}`}
                        >
                          {Math.round(sos)}
                        </span>
                        <span
                          className="gbc-adv"
                          style={{ ['--p' as string]: q }}
                        >
                          <span className="gbc-adv__fill" />
                          <span className="gbc-adv__val">{pct(q)}</span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
