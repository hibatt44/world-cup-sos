import { AnimatePresence, motion } from 'framer-motion';
import type { MatchResult, SosResponse } from '../../api/types';
import { useBracketStore } from '../../state/bracketStore';
import './TeamDrawer.css';

interface Props {
  data: SosResponse;
  results: MatchResult[];
}

function pct(p: number): string {
  return `${(p * 100).toFixed(p >= 0.1 ? 0 : 1)}%`;
}

export function TeamDrawer({ data, results }: Props) {
  const selectedTeam = useBracketStore((s) => s.selectedTeam);
  const close = () => useBracketStore.getState().setSelectedTeam(null);

  return (
    <AnimatePresence>
      {selectedTeam && (
        <>
          <motion.div
            className="drawer-scrim"
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          />
          <motion.aside
            className="drawer"
            role="dialog"
            aria-label="Team details"
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
          >
            <DrawerContent
              teamCode={selectedTeam}
              data={data}
              results={results}
              onClose={close}
            />
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

interface ContentProps {
  teamCode: string;
  data: SosResponse;
  results: MatchResult[];
  onClose: () => void;
}

function DrawerContent({ teamCode, data, results, onClose }: ContentProps) {
  const team = data.teams.find((t) => t.code === teamCode);

  let simRow: (typeof data.groupSimulation)[keyof typeof data.groupSimulation][number] | undefined;
  let groupKey: string | undefined;
  for (const [g, rows] of Object.entries(data.groupSimulation)) {
    const found = rows.find((r) => r.code === teamCode);
    if (found) {
      simRow = found;
      groupKey = g;
      break;
    }
  }

  if (!team || !simRow) {
    return (
      <div className="drawer__body">
        <button className="drawer__close" onClick={onClose} aria-label="Close">×</button>
        <p>No data available for {teamCode}.</p>
      </div>
    );
  }

  const teamResults = results
    .filter((r) => r.team1 === teamCode || r.team2 === teamCode)
    .slice(0, 5);

  const groupTeams = data.worldCupGroups.groups[groupKey as keyof typeof data.worldCupGroups.groups]?.teams ?? [];
  const opponents = groupTeams.filter((c) => c !== teamCode);
  const oppRatings = opponents
    .map((c) => {
      const t = data.teams.find((x) => x.code === c);
      return t ? { code: c, name: t.name, elo: t.rating } : null;
    })
    .filter(Boolean) as Array<{ code: string; name: string; elo: number }>;

  const progression = [
    { label: 'Win group', p: simRow.pos1Prob },
    { label: 'Advance', p: simRow.pos1Prob + simRow.pos2Prob + simRow.pos3Prob * (2 / 3) },
    { label: 'Reach R16', p: simRow.r16Prob },
    { label: 'Reach QF', p: simRow.qfProb },
    { label: 'Reach SF', p: simRow.sfProb },
    { label: 'Reach Final', p: simRow.finalProb },
    { label: 'Win it all', p: simRow.winProb }
  ];

  return (
    <div className="drawer__body">
      <header className="drawer__head">
        <div>
          <div className="drawer__group-tag">Group {groupKey}</div>
          <h2 className="drawer__title">{team.name}</h2>
          <p className="drawer__meta">
            Elo <strong>{team.rating}</strong> · SoS rank #{team.sosRank}
          </p>
        </div>
        <button className="drawer__close" onClick={onClose} aria-label="Close">×</button>
      </header>

      <section className="drawer__section">
        <h3>Tournament progression</h3>
        <ul className="progression">
          {progression.map((p) => (
            <li key={p.label}>
              <span className="progression__label">{p.label}</span>
              <span className="progression__bar">
                <span
                  className="progression__bar-fill"
                  style={{ width: `${Math.min(100, p.p * 100)}%` }}
                />
              </span>
              <span className="progression__val">{pct(p.p)}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="drawer__section">
        <h3>Group opponents</h3>
        <ul className="opponents">
          {oppRatings.map((o) => (
            <li key={o.code}>
              <button
                className="opponents__row"
                onClick={() => useBracketStore.getState().setSelectedTeam(o.code)}
              >
                <span>{o.name}</span>
                <span className="opponents__elo">{o.elo}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {teamResults.length > 0 && (
        <section className="drawer__section">
          <h3>Recent results</h3>
          <ul className="recent-results">
            {teamResults.map((r, i) => {
              const home = r.team1 === teamCode;
              const opp = home ? r.team2Name : r.team1Name;
              const myScore = home ? r.score1 : r.score2;
              const oppScore = home ? r.score2 : r.score1;
              const outcome =
                myScore > oppScore ? 'W' : myScore < oppScore ? 'L' : 'D';
              return (
                <li key={i} className={`recent-results__row is-${outcome.toLowerCase()}`}>
                  <span className="recent-results__outcome">{outcome}</span>
                  <span className="recent-results__opp">{opp}</span>
                  <span className="recent-results__score">
                    {myScore}–{oppScore}
                  </span>
                  <span className="recent-results__date">{r.date}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
