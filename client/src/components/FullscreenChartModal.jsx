import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Minimize2 } from 'lucide-react';
import { cn } from '../lib/utils';
import UnifiedChart from './UnifiedChart';

export default function FullscreenChartModal({ targets = [], lastPingResults = {}, onClose, colorMap = {} }) {
  const [selectedIds, setSelectedIds] = useState([]);
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

  const filteredTargets = selectedIds.length > 0
    ? targets.filter(t => selectedIds.includes(t.id))
    : targets;

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-chart-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
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

      {/* Target filter bar */}
      <div className="flex flex-wrap items-center gap-2 px-6 py-3 border-b border-gray-800 flex-shrink-0">
        <span className="text-xs text-gray-500 mr-1">Filter targets:</span>
        {targets.map(t => {
          const active = selectedIds.length === 0 || selectedIds.includes(t.id);
          return (
            <button
              key={t.id}
              onClick={() => toggleTarget(t.id)}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-medium transition-colors border',
                active
                  ? 'bg-blue-900/50 border-blue-700 text-blue-300'
                  : 'bg-gray-800 border-gray-700 text-gray-500 hover:text-gray-300'
              )}
            >
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

      {/* Chart — takes remaining vertical space, stretched to fill */}
      <div className="flex-1 p-6 min-h-0 flex flex-col overflow-hidden">
        <UnifiedChart
          targets={filteredTargets}
          lastPingResults={lastPingResults}
          colorMap={colorMap}
          fillHeight
        />
      </div>
    </div>
  );
}
