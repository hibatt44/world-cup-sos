import { useQuery } from '@tanstack/react-query';
import { api } from './api/client';
import { Header } from './components/Header/Header';
import { GroupStrip } from './components/GroupStrip/GroupStrip';
import { Bracket } from './components/Bracket/Bracket';
import { TeamDrawer } from './components/TeamDrawer/TeamDrawer';
import { Insights } from './components/Insights/Insights';
import { Results } from './components/Results/Results';
import { useUrlSync } from './state/urlSync';
import './App.css';

export function App() {
  useUrlSync();

  const sos = useQuery({ queryKey: ['sos'], queryFn: api.sos });
  const results = useQuery({ queryKey: ['results'], queryFn: api.results });

  if (sos.isLoading) {
    return (
      <div className="app-loading">
        <div className="spinner" />
        <p>Loading tournament data…</p>
      </div>
    );
  }

  if (sos.isError || !sos.data) {
    return (
      <div className="app-error">
        <h1>Couldn't load tournament data</h1>
        <p>{(sos.error as Error)?.message ?? 'Unknown error'}</p>
        <button onClick={() => sos.refetch()}>Retry</button>
      </div>
    );
  }

  const data = sos.data;

  return (
    <div className="app">
      <Header lastUpdated={data.lastUpdated} cacheAge={data.cacheAge} />
      <main className="app-main container">
        <GroupStrip data={data} />
        <Insights data={data} />
        <Bracket data={data} />
        <Results results={results.data?.results ?? []} />
      </main>
      <TeamDrawer data={data} results={results.data?.results ?? []} />
      <footer className="app-footer">
        Data from{' '}
        <a href="https://www.eloratings.net" target="_blank" rel="noreferrer">
          eloratings.net
        </a>{' '}
        · Auto-refreshes hourly
      </footer>
    </div>
  );
}
