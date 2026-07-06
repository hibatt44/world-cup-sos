import type {
  GroupCode,
  GroupSimulation,
  KnockoutMatch,
  WorldCupGroups
} from '../../api/types';

export interface ResolvedTeam {
  code: string;
  name: string;
  elo: number;
  isThirdPlace?: boolean;
  pool?: string;
  /** Probability of arriving at the slot they were resolved from (pos1Prob etc). */
  baseProb?: number;
}

const THIRD_PLACE_ELO = 1600;

export function winProb(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

export function findMatch(
  matchId: number,
  knockout: WorldCupGroups['knockout']
): KnockoutMatch | undefined {
  return [
    ...knockout.r32,
    ...knockout.r16,
    ...knockout.qf,
    ...knockout.sf,
    ...knockout.final
  ].find((m) => m.match === matchId);
}

/**
 * Resolve a group-stage slot reference (e.g. "1A", "2B", "3CEFHI") to the
 * most likely team that will fill it. Third-place pools become a synthetic
 * placeholder team at average Elo.
 */
export function resolveSlot(
  slot: string,
  sim: GroupSimulation
): ResolvedTeam | null {
  if (!slot) return null;
  if (slot.startsWith('3')) {
    const pool = slot.slice(1);
    return {
      code: `3rd-${pool}`,
      name: `3rd (${pool})`,
      elo: THIRD_PLACE_ELO,
      isThirdPlace: true,
      pool,
      baseProb: 2 / 3
    };
  }

  const pos = Number(slot[0]);
  const g = slot.slice(1) as GroupCode;
  const rows = sim[g];
  if (!rows || rows.length === 0) return null;

  const key = pos === 1 ? 'pos1Prob' : 'pos2Prob';
  const best = [...rows].sort((a, b) => b[key] - a[key])[0];
  return {
    code: best.code,
    name: best.name,
    elo: best.elo,
    baseProb: best[key]
  };
}

/**
 * Return every team that could possibly reach the given match, ignoring locks.
 * Used for tooltip "possible opponents" and opponent-weighted win probabilities.
 */
export function getPossibleTeams(
  matchId: number,
  knockout: WorldCupGroups['knockout'],
  sim: GroupSimulation,
  locks: Record<number, string>,
  teamIndex: Record<string, ResolvedTeam>
): ResolvedTeam[] {
  const lock = locks[matchId];
  if (lock) {
    const t = teamIndex[lock];
    if (t) return [t];
  }

  const m = findMatch(matchId, knockout);
  if (!m) return [];

  if (matchId <= 16) {
    const t1 = resolveSlot(m.team1 ?? '', sim);
    const t2 = resolveSlot(m.team2 ?? '', sim);
    return [t1, t2].filter((x): x is ResolvedTeam => x !== null);
  }

  if (m.prevMatches) {
    const [a, b] = m.prevMatches;
    return [
      ...getPossibleTeams(a, knockout, sim, locks, teamIndex),
      ...getPossibleTeams(b, knockout, sim, locks, teamIndex)
    ];
  }

  return [];
}

/**
 * Find the chain of matches a specific team must win to reach targetMatchId,
 * in order from R32 upward. Used when a user locks a later-round match —
 * every upstream match gets locked to the same team.
 */
export function findUpstreamPath(
  teamCode: string,
  targetMatchId: number,
  knockout: WorldCupGroups['knockout'],
  sim: GroupSimulation,
  locks: Record<number, string>,
  teamIndex: Record<string, ResolvedTeam>
): number[] {
  const path: number[] = [];
  const rounds: KnockoutMatch[][] = [
    knockout.r32,
    knockout.r16,
    knockout.qf,
    knockout.sf,
    knockout.final
  ];

  for (const round of rounds) {
    const match = round.find((m) =>
      getPossibleTeams(m.match, knockout, sim, locks, teamIndex).some(
        (t) => t.code === teamCode
      )
    );
    if (match) {
      path.push(match.match);
      if (match.match === targetMatchId) break;
    }
  }

  return path;
}

/**
 * Every match that descends from the given match, so we can clear dependent
 * locks when the user changes their mind upstream.
 */
export function getDownstreamMatches(
  matchId: number,
  knockout: WorldCupGroups['knockout']
): number[] {
  const downstream: number[] = [];
  const laterRounds = [knockout.r16, knockout.qf, knockout.sf, knockout.final].flat();
  const stack = [matchId];
  while (stack.length > 0) {
    const current = stack.pop() as number;
    for (const m of laterRounds) {
      if (m.prevMatches && m.prevMatches.includes(current)) {
        if (!downstream.includes(m.match)) {
          downstream.push(m.match);
          stack.push(m.match);
        }
      }
    }
  }
  return downstream;
}

export function buildTeamIndex(sim: GroupSimulation): Record<string, ResolvedTeam> {
  const out: Record<string, ResolvedTeam> = {};
  for (const rows of Object.values(sim)) {
    for (const t of rows) {
      out[t.code] = { code: t.code, name: t.name, elo: t.elo };
    }
  }
  return out;
}
