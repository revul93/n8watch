import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import UnifiedChart from './UnifiedChart';

const CHART_TYPES = [
  { key: 'latency', label: 'Latency' },
  { key: 'jitter', label: 'Jitter' },
  { key: 'packet_loss', label: 'Packet Loss' },
  { key: 'uptime', label: 'Uptime' },
];

export default function FullscreenChartModal({ targets = [], lastPingResults = {}, onClose, colorMap = {} }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeCharts, setActiveCharts] = useState(['latency']);
  const containerRef = useRef(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Request browser fullscreen when the modal mounts
  useEffect(() => {
    const el = document.documentElement;
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.mozRequestFullScreen) {
      el.mozRequestFullScreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }

    // Listen for the browser's own fullscreen-exit (pressing Esc in browser)
    const handleFsChange = () => {
      const isFs = !!(
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.mozFullScreenElement ||
        document.msFullscreenElement
      );
      if (!isFs) onCloseRef.current();
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    document.addEventListener('webkitfullscreenchange', handleFsChange);
    document.addEventListener('mozfullscreenchange', handleFsChange);

    return () => {
      document.removeEventListener('fullscreenchange', handleFsChange);
      document.removeEventListener('webkitfullscreenchange', handleFsChange);
      document.removeEventListener('mozfullscreenchange', handleFsChange);
    };
  }, []);

  // Exit browser fullscreen when the modal closes
  const handleClose = useCallback(() => {
    const exitFs =
      document.exitFullscreen ||
      document.webkitExitFullscreen ||
      document.mozCancelFullScreen ||
      document.msExitFullscreen;
    if (exitFs && (
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.mozFullScreenElement ||
      document.msFullscreenElement
    )) {
      exitFs.call(document).catch(() => {});
    }
    onCloseRef.current();
  }, []);

  // Prevent background scroll while open
  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, []);

  const toggleTarget = useCallback((id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }, []);

  const toggleChart = useCallback((key) => {
    setActiveCharts(prev => {
      if (prev.includes(key)) {
        // Keep at least one chart active
        return prev.length > 1 ? prev.filter(k => k !== key) : prev;
      }
      return [...prev, key];
    });
  }, []);

  const filteredTargets = selectedIds.length > 0
    ? targets.filter(t => selectedIds.includes(t.id))
    : targets;

  const content = (
    <div
      ref={containerRef}
      className="fixed z-[9999] bg-gray-950 flex flex-col"
      style={{ top: 0, left: 0, right: 0, bottom: 0, margin: 0 }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-chart-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <h2 id="fullscreen-chart-title" className="text-lg font-semibold text-white">Live Metrics — Fullscreen</h2>
        <button
          onClick={handleClose}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          title="Exit fullscreen (Esc)"
        >
          <Minimize2 size={16} />
          Exit Fullscreen
        </button>
      </div>

      {/* Legend / Target filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 mr-1">Targets:</span>
        {targets.map(t => {
          const active = selectedIds.length === 0 || selectedIds.includes(t.id);
          const color = colorMap[t.id] || '#60a5fa';
          return (
            <button
              key={t.id}
              onClick={() => toggleTarget(t.id)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors border',
                active
                  ? 'bg-blue-900/50 border-blue-700 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              )}
            >
              <span
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: active ? color : '#4b5563' }}
              />
              {t.name}
            </button>
          );
        })}
        {selectedIds.length > 0 && (
          <button
            onClick={() => setSelectedIds([])}
            className="px-3 py-1 rounded-lg text-xs text-gray-500 hover:text-gray-300 border border-gray-700 transition-colors"
          >
            Show all
          </button>
        )}
      </div>

      {/* Chart type selector */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 mr-1">Charts:</span>
        {CHART_TYPES.map(ct => {
          const enabled = activeCharts.includes(ct.key);
          return (
            <button
              key={ct.key}
              onClick={() => toggleChart(ct.key)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors border',
                enabled
                  ? 'bg-indigo-900/50 border-indigo-700 text-indigo-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              )}
            >
              {ct.label}
            </button>
          );
        })}
      </div>

      {/* Charts — scrollable area with one chart per active type */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-4">
        {activeCharts.map(chartKey => (
          <UnifiedChart
            key={chartKey}
            targets={filteredTargets}
            lastPingResults={lastPingResults}
            colorMap={colorMap}
            controlledMetric={chartKey}
            chartHeight={activeCharts.length === 1 ? undefined : 280}
            fillHeight={activeCharts.length === 1}
          />
        ))}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
