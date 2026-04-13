import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getTargets, getPingResults, addUserTarget, deleteUserTarget, getReportData, getInterfaces, getDashboardConfig } from '../lib/api';
import { generatePDFReport, generateCSVReport } from '../lib/reportGenerator';
import SummaryCards from '../components/SummaryCards';
import UnifiedChart, { buildColorMap } from '../components/UnifiedChart';
import HostGrid from '../components/HostGrid';
import FullscreenChartModal from '../components/FullscreenChartModal';
import { RefreshCw, Maximize2, Plus, X, FileText, FileDown, GripVertical } from 'lucide-react';
import { cn } from '../lib/utils';

const SECTION_KEYS = ['summary', 'chart', 'hosts'];

export default function Dashboard() {
  const { lastPingResults, configReloadedAt, targetsChangedAt, connected } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getTargets, []);
  const [sparklineData, setSparklineData] = useState({});
  const [selectedTargetIds, setSelectedTargetIds] = useState([]);
  const [fullscreen, setFullscreen] = useState(false);

  // Section drag-and-drop order
  const [sectionOrder, setSectionOrder] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('dashboardSectionOrder'));
      if (
        Array.isArray(saved) &&
        SECTION_KEYS.every(k => saved.includes(k)) &&
        saved.every(k => SECTION_KEYS.includes(k))
      ) {
        return saved;
      }
    } catch {}
    return [...SECTION_KEYS];
  });
  const [dragOverSection, setDragOverSection] = useState(null);
  const dragSectionRef = useRef(null);

  // User target form state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newTargetName, setNewTargetName] = useState('');
  const [newTargetIp, setNewTargetIp] = useState('');
  const [newTargetIface, setNewTargetIface] = useState('');
  const [newTargetLifetimeDays, setNewTargetLifetimeDays] = useState(7);
  const [addError, setAddError] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  // Available interfaces from config
  const { data: interfaces } = useApi(getInterfaces, []);

  // Max lifetime days from server config
  const { data: serverConfig } = useApi(getDashboardConfig, []);
  const maxLifetimeDays = serverConfig?.max_user_target_lifetime_days || 7;

  // Sync lifetime days default once server config is loaded
  useEffect(() => {
    setNewTargetLifetimeDays(maxLifetimeDays);
  }, [maxLifetimeDays]);

  // Confirmation dialog state
  const [deleteCandidate, setDeleteCandidate] = useState(null);
  const [deleteStep, setDeleteStep] = useState('confirm'); // 'confirm' | 'report'
  const [reportDownloading, setReportDownloading] = useState(null);

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

  // Refetch targets when another client adds or removes a user-defined target (WebSocket push)
  useEffect(() => {
    if (targetsChangedAt) refetch();
  }, [targetsChangedAt, refetch]);

  // 15-second polling fallback — only active when WebSocket is disconnected to
  // ensure other browsers eventually see target changes even if they missed the
  // push event during a reconnect window
  useEffect(() => {
    if (connected) return;
    const timer = setInterval(() => refetch(), 15000);
    return () => clearInterval(timer);
  }, [connected, refetch]);

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
      const ifaceList = interfaces || [];
      const selectedIface = ifaceList.find(i => i.name === newTargetIface) || null;
      await addUserTarget(
        name,
        ip,
        selectedIface ? selectedIface.name  : undefined,
        selectedIface ? selectedIface.alias : undefined,
        newTargetLifetimeDays,
      );
      setNewTargetName('');
      setNewTargetIp('');
      setNewTargetIface('');
      setNewTargetLifetimeDays(maxLifetimeDays);
      setShowAddModal(false);
      await refetch();
    } catch (err) {
      setAddError(err.message || 'Failed to add target.');
    } finally {
      setAddLoading(false);
    }
  }, [newTargetName, newTargetIp, newTargetIface, newTargetLifetimeDays, maxLifetimeDays, interfaces, refetch]);

  // Show confirmation dialog before deleting a user target
  const handleDeleteRequest = useCallback((target) => {
    setDeleteCandidate(target);
    setDeleteStep('confirm');
  }, []);

  // After first confirmation, ask about report download
  const handleDeleteFirstConfirm = useCallback(() => {
    setDeleteStep('report');
  }, []);

  // Download report then delete
  const handleDownloadThenDelete = useCallback(async (format) => {
    if (!deleteCandidate) return;
    setReportDownloading(format);
    try {
      const data = await getReportData(deleteCandidate.id);
      if (format === 'pdf') {
        generatePDFReport(data);
      } else {
        generateCSVReport(data);
      }
    } catch (err) {
      console.error('Failed to generate report before delete:', err);
    } finally {
      setReportDownloading(null);
    }
    // Proceed with deletion after download
    try {
      await deleteUserTarget(deleteCandidate.id);
      setDeleteCandidate(null);
      await refetch();
    } catch (err) {
      console.error('Failed to delete user target:', err);
      setDeleteCandidate(null);
    }
  }, [deleteCandidate, refetch]);

  // Confirmed deletion (no report)
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

  // Section drag handlers
  const handleSectionDragStart = useCallback((e, key) => {
    dragSectionRef.current = key;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('section', key);
  }, []);

  const handleSectionDragEnter = useCallback((key) => {
    if (!dragSectionRef.current || dragSectionRef.current === key) return;
    setDragOverSection(key);
    setSectionOrder(prev => {
      const from = prev.indexOf(dragSectionRef.current);
      const to = prev.indexOf(key);
      if (from === -1 || to === -1 || from === to) return prev;
      const next = [...prev];
      next.splice(from, 1);
      next.splice(to, 0, dragSectionRef.current);
      return next;
    });
  }, []);

  const handleSectionDragEnd = useCallback(() => {
    setSectionOrder(prev => {
      localStorage.setItem('dashboardSectionOrder', JSON.stringify(prev));
      return prev;
    });
    dragSectionRef.current = null;
    setDragOverSection(null);
  }, []);

  const sectionContent = {
    summary: (
      <SummaryCards targets={targetList} lastPingResults={lastPingResults} />
    ),
    chart: (
      <UnifiedChart targets={chartTargets} lastPingResults={lastPingResults} colorMap={colorMap} />
    ),
    hosts: (
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
    ),
  };

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

      {/* Add temporary target button */}
      <div className="flex justify-end">
        <button
          onClick={() => { setAddError(''); setShowAddModal(true); }}
          className="flex items-center gap-1.5 px-4 py-1.5 bg-blue-700 hover:bg-blue-600 rounded-lg text-sm text-white transition-colors"
        >
          <Plus size={14} />
          Add Temporary Target
        </button>
      </div>

      {/* Add temporary target modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-gray-900 border border-gray-700 rounded-xl p-6 max-w-md w-full mx-4 shadow-xl">
            <div className="flex items-start justify-between mb-4">
              <h3 className="text-base font-semibold text-white">Add Temporary Target</h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-gray-500 hover:text-white"
                disabled={addLoading}
              >
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddTarget} className="flex flex-col gap-3">
              <input
                type="text"
                placeholder="Name (e.g. My Router)"
                value={newTargetName}
                onChange={e => setNewTargetName(e.target.value)}
                maxLength={100}
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
              />
              <input
                type="text"
                placeholder="IP / Hostname (e.g. 192.168.1.1)"
                value={newTargetIp}
                onChange={e => setNewTargetIp(e.target.value)}
                maxLength={253}
                className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-600"
              />
              {interfaces && interfaces.length > 0 && (
                <select
                  value={newTargetIface}
                  onChange={e => setNewTargetIface(e.target.value)}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-600"
                  title="Outgoing network interface (optional)"
                >
                  <option value="">Interface — default</option>
                  {interfaces.map(iface => (
                    <option key={iface.name} value={iface.name}>
                      {[iface.name, iface.alias, iface.ipv4].filter(Boolean).join(' | ')}
                    </option>
                  ))}
                </select>
              )}
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Monitor for (days) — max {maxLifetimeDays}
                </label>
                <select
                  value={newTargetLifetimeDays}
                  onChange={e => setNewTargetLifetimeDays(Number(e.target.value))}
                  className="w-full px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-600"
                >
                  {Array.from({ length: maxLifetimeDays }, (_, i) => i + 1).map(d => (
                    <option key={d} value={d}>{d} {d === 1 ? 'day' : 'days'}</option>
                  ))}
                </select>
              </div>
              {addError && <p className="text-xs text-red-400">{addError}</p>}
              <div className="flex gap-3 justify-end pt-1">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  disabled={addLoading}
                  className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={addLoading}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-lg text-sm text-white transition-colors"
                >
                  <Plus size={14} />
                  {addLoading ? 'Adding…' : 'Add Target'}
                </button>
              </div>
            </form>
            <p className="text-xs text-gray-600 mt-3">
              Temporary targets are not saved to config.yaml and do not trigger alerts.
            </p>
          </div>
        </div>
      )}

      {/* Draggable sections */}
      {sectionOrder.map(key => (
        <div
          key={key}
          draggable
          onDragStart={(e) => handleSectionDragStart(e, key)}
          onDragEnter={() => handleSectionDragEnter(key)}
          onDragOver={(e) => e.preventDefault()}
          onDragEnd={handleSectionDragEnd}
          className={cn(
            "group relative rounded-xl transition-all",
            dragOverSection === key && dragSectionRef.current !== key && "ring-2 ring-blue-500 ring-offset-2 ring-offset-gray-950",
          )}
        >
          {/* Drag handle indicator */}
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-10 opacity-0 group-hover:opacity-60 transition-opacity pointer-events-none">
            <GripVertical size={14} className="text-gray-500" />
          </div>
          {sectionContent[key]}
        </div>
      ))}

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
            {deleteStep === 'confirm' ? (
              <>
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
                    onClick={handleDeleteFirstConfirm}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-sm text-white transition-colors"
                  >
                    Remove
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="flex items-start justify-between mb-4">
                  <h3 className="text-base font-semibold text-white">Download Report?</h3>
                  <button onClick={() => setDeleteCandidate(null)} className="text-gray-500 hover:text-white">
                    <X size={18} />
                  </button>
                </div>
                <p className="text-sm text-gray-400 mb-5">
                  Would you like to download a report for <span className="font-semibold text-white">{deleteCandidate.name}</span> before removing it?
                </p>
                <div className="flex flex-col gap-2 mb-4">
                  <button
                    onClick={() => handleDownloadThenDelete('pdf')}
                    disabled={!!reportDownloading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-600 disabled:opacity-60 rounded-lg text-sm text-white transition-colors"
                  >
                    <FileText size={14} />
                    {reportDownloading === 'pdf' ? 'Generating…' : 'Download PDF & Remove'}
                  </button>
                  <button
                    onClick={() => handleDownloadThenDelete('csv')}
                    disabled={!!reportDownloading}
                    className="flex items-center justify-center gap-2 px-4 py-2 bg-green-700 hover:bg-green-600 disabled:opacity-60 rounded-lg text-sm text-white transition-colors"
                  >
                    <FileDown size={14} />
                    {reportDownloading === 'csv' ? 'Generating…' : 'Download CSV & Remove'}
                  </button>
                </div>
                <div className="flex gap-3 justify-end border-t border-gray-800 pt-4">
                  <button
                    onClick={() => setDeleteCandidate(null)}
                    className="px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDeleteConfirm}
                    disabled={!!reportDownloading}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 disabled:opacity-60 rounded-lg text-sm text-white transition-colors"
                  >
                    Remove Without Report
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
