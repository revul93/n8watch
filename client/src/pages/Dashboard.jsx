import { useState, useEffect, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getTargets, getPingResults } from '../lib/api';
import SummaryCards from '../components/SummaryCards';
import UnifiedChart from '../components/UnifiedChart';
import HostGrid from '../components/HostGrid';
import { RefreshCw } from 'lucide-react';

export default function Dashboard() {
  const { lastPingResults, configReloadedAt } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getTargets, []);
  const [sparklineData, setSparklineData] = useState({});
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);

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

  // Refetch targets when config.yaml changes (live reload)
  useEffect(() => {
    if (configReloadedAt) refetch();
  }, [configReloadedAt, refetch]);

  // Toggle a target in the selection; clicking again deselects
  const handleTargetClick = useCallback((targetId) => {
    setSelectedTargetIds(prev =>
      prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId]
    );
  }, []);

  const targetList = targets || [];

  // Targets shown in the chart: use selection if any, otherwise all
  const chartTargets = selectedTargetIds.length > 0
    ? targetList.filter(t => selectedTargetIds.includes(t.id))
    : targetList;

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

      <UnifiedChart targets={chartTargets} lastPingResults={lastPingResults} />

      <div>
        <div className="flex items-center gap-3 mb-3">
          <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Hosts</h2>
          {selectedTargetIds.length > 0 && (
            <span className="text-xs text-blue-400">
              {selectedTargetIds.length} selected — click a host again to deselect
            </span>
          )}
          {selectedTargetIds.length > 0 && (
            <button
              onClick={() => setSelectedTargetIds([])}
              className="ml-auto text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear selection
            </button>
          )}
        </div>
        <HostGrid
          targets={targetList}
          lastPingResults={lastPingResults}
          sparklineData={sparklineData}
          selectedTargetIds={selectedTargetIds}
          onTargetClick={handleTargetClick}
        />
      </div>
    </div>
  );
}
