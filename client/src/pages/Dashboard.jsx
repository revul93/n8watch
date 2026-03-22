import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getTargets, getPingResults } from '../lib/api';
import SummaryCards from '../components/SummaryCards';
import UnifiedChart from '../components/UnifiedChart';
import HostGrid from '../components/HostGrid';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { lastPingResults } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getTargets, []);
  const [sparklineData, setSparklineData] = useState({});

  const fetchSparklines = useCallback(async (targetList) => {
    if (!targetList?.length) return;
    const from = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const results = await Promise.allSettled(
      targetList.map(t => getPingResults(t.id, { from, limit: 20 }))
    );
    const map = {};
    results.forEach((res, i) => {
      if (res.status === 'fulfilled') {
        const rows = Array.isArray(res.value) ? res.value : (res.value?.rows || res.value?.results || []);
        map[targetList[i].id] = rows;
      }
    });
    setSparklineData(map);
  }, []);

  useEffect(() => {
    if (targets?.length) {
      fetchSparklines(targets);
    }
  }, [targets, fetchSparklines]);

  // Update sparklines when new ping data arrives
  useEffect(() => {
    const ids = Object.keys(lastPingResults);
    if (!ids.length || !targets?.length) return;
    const timer = setTimeout(() => fetchSparklines(targets), 3000);
    return () => clearTimeout(timer);
  }, [lastPingResults, targets, fetchSparklines]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        Loading dashboard…
      </div>
    );
  }

  const targetList = targets || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time network monitoring</p>
        </div>
        <button
          onClick={refetch}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
        >
          <RefreshCw size={14} />
          Refresh
        </button>
      </div>

      <SummaryCards targets={targetList} lastPingResults={lastPingResults} />

      <UnifiedChart targets={targetList} lastPingResults={lastPingResults} />

      <div>
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Hosts</h2>
        <HostGrid
          targets={targetList}
          lastPingResults={lastPingResults}
          sparklineData={sparklineData}
        />
      </div>
    </div>
  );
}
