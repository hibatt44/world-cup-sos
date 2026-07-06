import { useMemo } from 'react';
import type { GroupCode, GroupSimulation, WorldCupGroups } from '../../api/types';

export interface ProjectedTeam {
  code: string;
  name: string;
  elo: number;
  locked: boolean;
  projected: boolean;
}

export interface ProjectedMatch {
  match: number;
  round: 'R32' | 'R16' | 'QF' | 'SF' | 'F';
  team1: ProjectedTeam | null;
  team2: ProjectedTeam | null;
  winner: ProjectedTeam | null;
  winProb: number | null; // probability the projected winner wins THIS match
  prevMatches?: [number, number];
  // Slot labels when slots are 3rd-place pools (e.g. "3CEFHI")
  team1SlotLabel?: string;
  team2SlotLabel?: string;
}

export interface BracketProjection {
  matches: Record<number, ProjectedMatch>;
  byRound: Record<'R32' | 'R16' | 'QF' | 'SF' | 'F', ProjectedMatch[]>;
}

interface Inputs {
  knockout: WorldCupGroups['knockout'];
  sim: GroupSimulation;
  locks: Record<number, string>;
}

const THIRD_PLACE_ELO = 1600;

function winExpectancy(eloA: number, eloB: number): number {
  return 1 / (1 + Math.pow(10, (eloB - eloA) / 400));
}

function resolveGroupSlot(
  slot: string,
  sim: GroupSimulation
): ProjectedTeam | { label: string } | null {
  // Slot formats: "1A" (group A winner), "2B" (runner-up), "3CEFHI" (3rd-place pool)
  const pos = slot[0];
  const rest = slot.slice(1);

  if (pos === '1' || pos === '2') {
    const g = rest as GroupCode;
    const teams = sim[g];
    if (!teams) return null;
    const posKey = pos === '1' ? 'pos1Prob' : 'pos2Prob';
    const best = [...teams].sort((a, b) => b[posKey] - a[posKey])[0];
    if (!best) return null;
    return {
      code: best.code,
      name: best.name,
      elo: best.elo,
      locked: false,
      projected: true
    };
  }

  if (pos === '3') {
    // Third-place pool — render as placeholder until deeper logic ports
    return { label: `3rd (${rest})` };
  }

  return null;
}

function placeholderTeam(label: string): ProjectedTeam {
  return {
    code: `__${label}`,
    name: label,
    elo: THIRD_PLACE_ELO,
    locked: false,
    projected: true
  };
}

export function useBracketProjection({ knockout, sim, locks }: Inputs): BracketProjection {
  return useMemo(() => {
    const matches: Record<number, ProjectedMatch> = {};

    const allRounds: Array<{
      key: 'R32' | 'R16' | 'QF' | 'SF' | 'F';
      list: typeof knockout.r32;
    }> = [
      { key: 'R32', list: knockout.r32 },
      { key: 'R16', list: knockout.r16 },
      { key: 'QF', list: knockout.qf },
      { key: 'SF', list: knockout.sf },
      { key: 'F', list: knockout.final }
    ];

    // Flat lookup of all teams by code from the sim (for locked-team name/elo)
    const teamByCode: Record<string, ProjectedTeam> = {};
    for (const g of Object.values(sim)) {
      for (const t of g) {
        teamByCode[t.code] = {
          code: t.code,
          name: t.name,
          elo: t.elo,
          locked: false,
          projected: false
        };
      }
    }

    const makeLocked = (code: string): ProjectedTeam => {
      const base = teamByCode[code];
      if (base) return { ...base, locked: true, projected: false };
      return {
        code,
        name: code,
        elo: THIRD_PLACE_ELO,
        locked: true,
        projected: false
      };
    };

    for (const { key, list } of allRounds) {
      for (const m of list) {
        let team1: ProjectedTeam | null = null;
        let team2: ProjectedTeam | null = null;
        let team1SlotLabel: string | undefined;
        let team2SlotLabel: string | undefined;

        if (key === 'R32') {
          const s1 = resolveGroupSlot(m.team1 ?? '', sim);
          const s2 = resolveGroupSlot(m.team2 ?? '', sim);
          if (s1 && 'code' in s1) team1 = s1;
          else if (s1 && 'label' in s1) {
            team1SlotLabel = s1.label;
            team1 = placeholderTeam(s1.label);
          }
          if (s2 && 'code' in s2) team2 = s2;
          else if (s2 && 'label' in s2) {
            team2SlotLabel = s2.label;
            team2 = placeholderTeam(s2.label);
          }
        } else if (m.prevMatches) {
          const [a, b] = m.prevMatches;
          team1 = matches[a]?.winner ?? null;
          team2 = matches[b]?.winner ?? null;
        }

        // Lock overrides projection
        const lockedCode = locks[m.match];
        let winner: ProjectedTeam | null = null;
        let winProb: number | null = null;

        if (lockedCode) {
          winner = makeLocked(lockedCode);
          // Ensure team1/team2 reflect lock if one slot wasn't resolved
          if (team1 && team1.code === lockedCode) team1 = { ...team1, locked: true, projected: false };
          if (team2 && team2.code === lockedCode) team2 = { ...team2, locked: true, projected: false };
          if (team1 && team2) {
            winProb = team1.code === lockedCode
              ? winExpectancy(team1.elo, team2.elo)
              : winExpectancy(team2.elo, team1.elo);
          }
        } else if (team1 && team2) {
          const p1 = winExpectancy(team1.elo, team2.elo);
          if (p1 >= 0.5) {
            winner = { ...team1, projected: true };
            winProb = p1;
          } else {
            winner = { ...team2, projected: true };
            winProb = 1 - p1;
          }
        }

        matches[m.match] = {
          match: m.match,
          round: key,
          team1,
          team2,
          winner,
          winProb,
          prevMatches: m.prevMatches,
          team1SlotLabel,
          team2SlotLabel
        };
      }
    }

    const byRound: BracketProjection['byRound'] = {
      R32: knockout.r32.map((m) => matches[m.match]).filter(Boolean),
      R16: knockout.r16.map((m) => matches[m.match]).filter(Boolean),
      QF: knockout.qf.map((m) => matches[m.match]).filter(Boolean),
      SF: knockout.sf.map((m) => matches[m.match]).filter(Boolean),
      F: knockout.final.map((m) => matches[m.match]).filter(Boolean)
    };

    return { matches, byRound };
  }, [knockout, sim, locks]);
}
