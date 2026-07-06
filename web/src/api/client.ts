import type { ResultsResponse, SosResponse } from './types';

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} failed: ${res.status}`);
  return res.json() as Promise<T>;
}

export const api = {
  sos: () => get<SosResponse>('/api/sos'),
  results: () => get<ResultsResponse>('/api/results')
};
