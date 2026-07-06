export type GroupCode =
  | 'A' | 'B' | 'C' | 'D' | 'E' | 'F'
  | 'G' | 'H' | 'I' | 'J' | 'K' | 'L';

export interface Team {
  code: string;
  name: string;
  group: GroupCode;
  rating: number;
  groupOpponentSoS: number;
  sosRank: number;
  isPlayoff: boolean;
}

export interface GroupInfo {
  group: GroupCode;
  rank: number;
  strength: number;
  playoffSlot?: string | null;
}

export interface GroupStandingRow {
  code: string;
  name: string;
  elo: number;
  isPlayoff: boolean;
  pos1Prob: number;
  pos2Prob: number;
  pos3Prob: number;
  pos4Prob: number;
  r32Prob: number;
  r16Prob: number;
  qfProb: number;
  sfProb: number;
  finalProb: number;
  winProb: number;
}

export type GroupSimulation = Record<GroupCode, GroupStandingRow[]>;

export interface KnockoutMatch {
  match: number;
  team1?: string;
  team2?: string;
  prevMatches?: [number, number];
  nextMatch?: number;
}

export interface WorldCupGroups {
  drawDate: string;
  tournament: string;
  hosts: string[];
  groups: Record<GroupCode, { teams: string[]; notes?: string }>;
  playoffs: unknown;
  knockout: {
    r32: KnockoutMatch[];
    r16: KnockoutMatch[];
    qf: KnockoutMatch[];
    sf: KnockoutMatch[];
    final: KnockoutMatch[];
  };
}

export interface SosResponse {
  teams: Team[];
  groups: GroupInfo[];
  worldCupGroups: WorldCupGroups;
  expectedElos: Record<string, number>;
  groupSimulation: GroupSimulation;
  playoffSimulation?: unknown;
  cacheAge: number;
  lastUpdated: string;
}

export interface MatchResult {
  date: string;
  team1: string;
  team2: string;
  team1Name: string;
  team2Name: string;
  score1: number;
  score2: number;
  tournament: string;
  venue: string;
  pointsExchanged: number;
  team1Rating: number;
  team2Rating: number;
}

export interface ResultsResponse {
  results: MatchResult[];
  cacheAge: number;
}
