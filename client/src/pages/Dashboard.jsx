import { useState, useEffect, useCallback, useMemo } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getTargets, getPingResults, addUserTarget, deleteUserTarget } from '../lib/api';
import SummaryCards from '../components/SummaryCards';
import UnifiedChart, { buildColorMap } from '../components/UnifiedChart';
import HostGrid from '../components/HostGrid';
import FullscreenChartModal from '../components/FullscreenChartModal';
import { RefreshCw, Maximize2, Plus, X } from 'lucide-react';

export default function Dashboard() {
  const { lastPingResults, configReloadedAt } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getTargets, []);
  const [sparklineData, setSparklineData] = useState({});
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  // User target form state
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetIp, setNewTargetIp] = useState('');
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Confirmation dialog state
  const [deleteCandidate, setDeleteCandidate] = useState(null);

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

  // Stable color map derived from the full target list (not the filtered subset)
  const colorMap = useMemo(() => buildColorMap(targetList), [targetList]);

  // Targets shown in the chart: use selection if any, otherwise all
  const chartTargets = selectedTargetIds.length > 0
    ? targetList.filter(t => selectedTargetIds.includes(t.id))
    : targetList;

  // Add a user-defined temporary target
  const handleAddTarget = useCallback(async (e) => {
    e.preventDefault();
    const name = newTargetName.trim();
    const ip   = newTargetIp.trim();
    if (!name || !ip) {
      setAddError('Both name and IP/hostname are required.');
      return;
    }
    setAddError('');
    setAddLoading(true);
    try {
      await addUserTarget(name, ip);
      setNewTargetName('');
      setNewTargetIp('');
      await refetch();
    } catch (err) {
      setAddError(err.message || 'Failed to add target.');
    } finally {
      setAddLoading(false);
    }
  }, [newTargetName, newTargetIp, refetch]);

  // Show confirmation dialog before deleting a user target
  const handleDeleteRequest = useCallback((target) => {
    setDeleteCandidate(target);
  }, []);

  // Confirmed deletion
  const handleDeleteConfirm = useCallback(async () => {
    if (!deleteCandidate) return;
    try {
      await deleteUserTarget(deleteCandidate.id);
      setDeleteCandidate(null);
      await refetch();
    } catch (err) {
      console.error('Failed to delete user target:', err);
      setDeleteCandidate(null);
    }
  }, [deleteCandidate, refetch]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard</h1>
          <p className="text-sm text-gray-500 mt-0.5">Real-time network monitoring</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={refetch}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
          <button
            onClick={() => setFullscreen(true)}
            className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
            title="Open chart in fullscreen"
          >
            <Maximize2 size={14} />
            Fullscreen
          </button>
        </div>
      </div>

      {/* Add temporary target form */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Add Temporary Target</h2>
        <form onSubmit={handleAddTarget} className="flex flex-wrap gap-2 items-start">
          <input
            type="text"
            placeholder="Name (e.g. My Router)"
            value={newTargetName}
            onChange={e => setNewTargetName(e.target.value)}
            maxLength={100}
            className="flex-1 min-w-[140px] px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
          />
          <input
            type="text"
            placeholder="IP / Hostname (e.g. 192.168.1.1)"
            value={newTargetIp}
            onChange={e => setNewTargetIp(e.target.value)}
            maxLength={253}
            className="flex-1 min-w-[180px] px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
          />
          <button
            type="submit"
            disabled={addLoading}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-lg text-sm text-white transition-colors"
          >
            <Plus size={14} />
            {addLoading ? 'Adding…' : 'Add Target'}
          </button>
        </form>
        {addError && <p className="text-xs text-red-400 mt-2">{addError}</p>}
        <p className="text-xs text-gray-600 mt-2">
          Temporary targets are monitored for up to 5 days and do not trigger alerts. They are not saved to config.yaml.
        </p>
      </div>

      <SummaryCards targets={targetList} lastPingResults={lastPingResults} />

      <UnifiedChart targets={chartTargets} lastPingResults={lastPingResults} colorMap={colorMap} />

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
          onDeleteUserTarget={handleDeleteRequest}
        />
      </div>

      {fullscreen && (
        <FullscreenChartModal
          targets={targetList}
          lastPingResults={lastPingResults}
          colorMap={colorMap}
          onClose={() => setFullscreen(false)}
        />
      )}

      {/* Delete confirmation dialog */}
      {deleteCandidate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-sm w-full mx-4 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Remove Temporary Target</h3>
              <button onClick={() => setDeleteCandidate(null)} className="text-gray-500 hover:text-white">
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-gray-400 mb-6">
              Are you sure you want to remove <span className="font-semibold text-white">{deleteCandidate.name}</span> ({deleteCandidate.ip})?
              This will delete all monitoring data for this target.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeleteCandidate(null)}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm text-white transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
