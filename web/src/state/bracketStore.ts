import { create } from 'zustand';
import type { GroupSimulation, WorldCupGroups } from '../api/types';
import {
  buildTeamIndex,
  findUpstreamPath,
  getDownstreamMatches,
  type ResolvedTeam
} from '../components/Bracket/bracketMath';

export type RoundId = 'R32' | 'R16' | 'QF' | 'SF' | 'F';

export interface BracketState {
  locks: Record<number, string>;
  selectedTeam: string | null;
  r32Collapsed: boolean;
  toggleLock: (
    matchNum: number,
    team: ResolvedTeam,
    ctx: { knockout: WorldCupGroups['knockout']; sim: GroupSimulation }
  ) => void;
  resetLocks: () => void;
  setSelectedTeam: (code: string | null) => void;
  toggleR32: () => void;
  hydrate: (locks: Record<number, string>) => void;
}

export const useBracketStore = create<BracketState>((set) => ({
  locks: {},
  selectedTeam: null,
  r32Collapsed: false,

  toggleLock: (matchNum, team, { knockout, sim }) =>
    set((s) => {
      const current = s.locks[matchNum];
      const teamIndex = buildTeamIndex(sim);
      const path = findUpstreamPath(
        team.code,
        matchNum,
        knockout,
        sim,
        s.locks,
        teamIndex
      );
      const downstream = getDownstreamMatches(matchNum, knockout);

      if (current === team.code) {
        // Unlock: clear upstream path AND dependent downstream.
        const next = { ...s.locks };
        for (const id of path) delete next[id];
        for (const id of downstream) delete next[id];
        return { locks: next };
      }

      const next = { ...s.locks };
      for (const id of path) {
        next[id] = team.code;
      }
      for (const id of downstream) {
        delete next[id];
      }
      return { locks: next };
    }),

  resetLocks: () => set({ locks: {} }),
  setSelectedTeam: (code) => set({ selectedTeam: code }),
  toggleR32: () => set((s) => ({ r32Collapsed: !s.r32Collapsed })),
  hydrate: (locks) => set({ locks })
}));
