import type { SosResponse } from '../../api/types';
import { useBracketStore } from '../../state/bracketStore';
import { useBracketProjection, type ProjectedMatch, type ProjectedTeam } from './useBracketProjection';
import './Bracket.css';

interface Props {
  data: SosResponse;
}

const ROUND_LABELS: Record<ProjectedMatch['round'], string> = {
  R32: 'Round of 32',
  R16: 'Round of 16',
  QF: 'Quarterfinals',
  SF: 'Semifinals',
  F: 'Final'
};

const ROUND_ORDER: ProjectedMatch['round'][] = ['R32', 'R16', 'QF', 'SF', 'F'];

export function Bracket({ data }: Props) {
  const locks = useBracketStore((s) => s.locks);
  const toggleLock = useBracketStore((s) => s.toggleLock);
  const setSelectedTeam = useBracketStore((s) => s.setSelectedTeam);
  const r32Collapsed = useBracketStore((s) => s.r32Collapsed);
  const toggleR32 = useBracketStore((s) => s.toggleR32);

  const projection = useBracketProjection({
    knockout: data.worldCupGroups.knockout,
    sim: data.groupSimulation,
    locks
  });

  const handleTeamClick = (
    m: ProjectedMatch,
    team: ProjectedTeam | null,
    e: React.MouseEvent
  ) => {
    if (!team) return;
    // Shift+click or right-click opens drawer; plain click locks.
    if (e.shiftKey || e.metaKey) {
      setSelectedTeam(team.code);
      return;
    }
    toggleLock(m.match, team, {
      knockout: data.worldCupGroups.knockout,
      sim: data.groupSimulation
    });
  };

  return (
    <section className="bracket-section" aria-labelledby="bracket-title">
      <div className="bracket-section__head">
        <div>
          <h2 id="bracket-title">Knockout bracket</h2>
          <p className="section-sub">
            Click a team to lock them as the winner · Shift+click for team details
          </p>
        </div>
        <button className="ghost-btn" onClick={toggleR32}>
          {r32Collapsed ? 'Expand R32' : 'Collapse R32'}
        </button>
      </div>

      <div className={`bracket ${r32Collapsed ? 'bracket--r32-collapsed' : ''}`}>
        {ROUND_ORDER.map((round) => (
          <div key={round} className={`bracket__col bracket__col--${round.toLowerCase()}`}>
            <h3 className="bracket__round-label">{ROUND_LABELS[round]}</h3>
            <div className="bracket__matches">
              {projection.byRound[round].map((m) => (
                <MatchCard
                  key={m.match}
                  match={m}
                  locked={locks[m.match]}
                  onTeamClick={(team, e) => handleTeamClick(m, team, e)}
                  onTeamContext={(code) => setSelectedTeam(code)}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

interface MatchProps {
  match: ProjectedMatch;
  locked: string | undefined;
  onTeamClick: (team: ProjectedTeam | null, e: React.MouseEvent) => void;
  onTeamContext: (code: string) => void;
}

function MatchCard({ match, locked, onTeamClick, onTeamContext }: MatchProps) {
  const { team1, team2, winner, winProb } = match;
  const slot = (team: ProjectedTeam | null, fallbackLabel?: string) => {
    if (!team) return <span className="match__tbd">TBD</span>;
    const isWinner = winner && winner.code === team.code;
    const isProjectedTeam = team.projected;
    const isLocked = team.locked || locked === team.code;
    return (
      <button
        className={`match__team ${isWinner ? 'is-winner' : ''} ${
          isLocked ? 'is-locked' : isProjectedTeam ? 'is-projected' : ''
        }`}
        onClick={(e) => onTeamClick(team, e)}
        onContextMenu={(e) => {
          if (!team.code.startsWith('__')) {
            e.preventDefault();
            onTeamContext(team.code);
          }
        }}
      >
        <span className="match__team-name">{fallbackLabel ?? team.name}</span>
        <span className="match__team-elo">{team.elo}</span>
      </button>
    );
  };

  return (
    <div className="match">
      {slot(team1, match.team1SlotLabel)}
      {slot(team2, match.team2SlotLabel)}
      {winProb !== null && (
        <span className="match__prob">{Math.round(winProb * 100)}%</span>
      )}
    </div>
  );
}
