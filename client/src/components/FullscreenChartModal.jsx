import { useState, useEffect, useCallback, useRef } from 'react';
import { X } from 'lucide-react';
import { cn } from '../lib/utils';
import UnifiedChart from './UnifiedChart';

export default function FullscreenChartModal({ targets = [], lastPingResults = {}, onClose }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);

  // Close on ESC key — stable listener, reads latest onClose via ref
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onCloseRef.current();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
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
      className="fixed inset-0 z-50 bg-gray-950 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="fullscreen-chart-title"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-800 flex-shrink-0">
        <h2 id="fullscreen-chart-title" className="text-lg font-semibold text-white">Live Metrics — Fullscreen</h2>
        <button
          onClick={onClose}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
          title="Close fullscreen (Esc)"
        >
          <X size={16} />
          Close
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

      {/* Chart — takes remaining vertical space */}
      <div className="flex-1 p-6 min-h-0">
        <UnifiedChart
          targets={filteredTargets}
          lastPingResults={lastPingResults}
          chartHeight={500}
        />
      </div>
    </div>
  );
}
