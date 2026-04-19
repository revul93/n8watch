import { useState, useRef, useCallback } from 'react';
import UnifiedChart from './UnifiedChart';
import HostPill from './HostPill';
import { ChevronLeft, ChevronRight, GripHorizontal } from 'lucide-react';

const CHART_HEIGHT_MIN = 80;
const CHART_HEIGHT_MAX = 600;
const CHART_HEIGHT_DEFAULT = 150;

/**
 * One panel per group, showing:
 *   1. Group header (name + interface alias badge + N up / M down count + chart type toggle + span controls)
 *   2. Mini UnifiedChart scoped to this group's targets (vertically resizable)
 *   3. Centered flex wrap of HostPill components
 *
 * Props:
 *   groupName        – display name for the group
 *   targets          – array of target objects belonging to this group
 *   lastPingResults  – { [targetId]: pingResult } map from the dashboard
 *   colorMap         – { [targetId]: color } stable color map
 *   colSpan          – current column span (1–maxCols)
 *   onExpand         – callback to increase column span
 *   onCollapse       – callback to decrease column span
 *   maxCols          – maximum allowed column span
 */

export default function GroupPanel({
  groupName,
  targets = [],
  lastPingResults = {},
  colorMap = {},
  colSpan = 1,
  onExpand,
  onCollapse,
  maxCols = 4,
}) {
  // Local selection state — only affects this group's mini chart
  const [groupSelectedIds, setGroupSelectedIds] = useState([]);

  // Active metric: 'latency' | 'jitter' | 'packet_loss'
  const [selectedMetric, setSelectedMetric] = useState('latency');

  // Resizable chart height (vertical stretch)
  const [chartHeight, setChartHeight] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem('groupChartHeights') || '{}');
      const h = saved[groupName];
      return h ? Math.max(CHART_HEIGHT_MIN, Math.min(CHART_HEIGHT_MAX, h)) : CHART_HEIGHT_DEFAULT;
    } catch { return CHART_HEIGHT_DEFAULT; }
  });
  const chartHeightRef = useRef(chartHeight);
  const chartWrapperRef = useRef(null);

  const handleChartResizeMouseDown = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    const startY = e.clientY;
    const startH = chartWrapperRef.current
      ? chartWrapperRef.current.getBoundingClientRect().height
      : chartHeightRef.current;

    const onMouseMove = (ev) => {
      const newH = Math.max(CHART_HEIGHT_MIN, Math.min(CHART_HEIGHT_MAX, Math.round(startH + ev.clientY - startY)));
      chartHeightRef.current = newH;
      setChartHeight(newH);
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      try {
        const saved = JSON.parse(localStorage.getItem('groupChartHeights') || '{}');
        saved[groupName] = chartHeightRef.current;
        localStorage.setItem('groupChartHeights', JSON.stringify(saved));
      } catch {}
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }, [groupName]);

  function handlePillClick(targetId) {
    setGroupSelectedIds(prev =>
      prev.includes(targetId)
        ? prev.filter(id => id !== targetId)
        : [...prev, targetId]
    );
  }

  // Filter targets for the mini chart
  const chartTargets = groupSelectedIds.length > 0
    ? targets.filter(t => groupSelectedIds.includes(t.id))
    : targets;

  // Determine shared interface alias
  const aliases = [...new Set(targets.map(t => t.interface_alias).filter(Boolean))];
  const sharedAlias = aliases.length === 1 ? aliases[0] : null;

  // Count up / down
  const upCount = targets.filter(t => {
    const r = lastPingResults[t.id];
    return r?.is_alive === true || r?.is_alive === 1;
  }).length;
  const downCount = targets.filter(t => {
    const r = lastPingResults[t.id];
    return r?.is_alive === false || r?.is_alive === 0;
  }).length;

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-3 min-w-0 h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm font-semibold text-white truncate">{groupName}</span>
        {sharedAlias && (
          <span className="text-xs bg-teal-900/50 text-teal-300 border border-teal-800 px-2 py-0.5 rounded-full flex-shrink-0">
            ↑ {sharedAlias}
          </span>
        )}
        <span className="ml-auto text-xs flex-shrink-0 flex items-center gap-2">
          {upCount > 0 && (
            <span className="flex items-center gap-1 text-green-400">
              <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
              {upCount} up
            </span>
          )}
          {downCount > 0 && (
            <span className="flex items-center gap-1 text-red-400">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-pulse inline-block" />
              {downCount} down
            </span>
          )}
          {upCount === 0 && downCount === 0 && (
            <span className="text-gray-500">{targets.length} targets</span>
          )}
          {/* ── Metric type toggle ── */}
          <span className="flex items-center gap-0.5 ml-1 border border-gray-700 rounded-md overflow-hidden">
            {[
              { key: 'latency', label: 'Latency' },
              { key: 'jitter', label: 'Jitter' },
              { key: 'packet_loss', label: 'Loss' },
            ].map(tab => (
              <button
                key={tab.key}
                onClick={() => setSelectedMetric(tab.key)}
                aria-pressed={selectedMetric === tab.key}
                className={`px-1.5 py-0.5 text-xs transition-colors ${
                  selectedMetric === tab.key
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </span>
          {/* ── Horizontal span controls ── */}
          {(onCollapse || onExpand) && (
            <span className="flex items-center gap-0.5 border border-gray-700 rounded-md overflow-hidden">
              <button
                onClick={onCollapse}
                disabled={colSpan <= 1}
                className="p-0.5 bg-gray-800 text-gray-400 hover:text-blue-400 hover:bg-gray-700 disabled:opacity-30 transition-colors"
                title="Narrow panel"
                aria-label="Narrow panel"
              >
                <ChevronLeft size={12} />
              </button>
              <button
                onClick={onExpand}
                disabled={colSpan >= maxCols}
                className="p-0.5 bg-gray-800 text-gray-400 hover:text-blue-400 hover:bg-gray-700 disabled:opacity-30 transition-colors"
                title="Widen panel"
                aria-label="Widen panel"
              >
                <ChevronRight size={12} />
              </button>
            </span>
          )}
        </span>
      </div>

      {/* ── Mini chart (vertically resizable) ── */}
      <div className="min-w-0" ref={chartWrapperRef}>
        <UnifiedChart
          targets={chartTargets}
          lastPingResults={lastPingResults}
          colorMap={colorMap}
          chartHeight={chartHeight}
          singleMetric={selectedMetric}
        />
        {/* Vertical resize handle */}
        <div
          onMouseDown={handleChartResizeMouseDown}
          onKeyDown={(e) => {
            if (e.key === 'ArrowUp') { const v = Math.max(CHART_HEIGHT_MIN, chartHeightRef.current - 20); chartHeightRef.current = v; setChartHeight(v); try { const s = JSON.parse(localStorage.getItem('groupChartHeights') || '{}'); s[groupName] = v; localStorage.setItem('groupChartHeights', JSON.stringify(s)); } catch {} }
            if (e.key === 'ArrowDown') { const v = Math.min(CHART_HEIGHT_MAX, chartHeightRef.current + 20); chartHeightRef.current = v; setChartHeight(v); try { const s = JSON.parse(localStorage.getItem('groupChartHeights') || '{}'); s[groupName] = v; localStorage.setItem('groupChartHeights', JSON.stringify(s)); } catch {} }
          }}
          tabIndex={0}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Drag or use arrow keys to resize chart height"
          className="w-full h-2 flex items-center justify-center cursor-row-resize group/resize mt-1 focus:outline-none"
          title="Drag or use arrow keys to resize chart height"
        >
          <GripHorizontal size={12} className="text-gray-700 group-hover/resize:text-blue-500 transition-colors" />
        </div>
      </div>

      {/* ── Host pills (centered flex wrap) ── */}
      <div className="flex flex-wrap justify-center gap-2">
        {targets.map(target => (
          <HostPill
            key={target.id}
            target={target}
            lastPingResult={lastPingResults[target.id]}
            isSelected={groupSelectedIds.includes(target.id)}
            onTargetClick={handlePillClick}
          />
        ))}
      </div>
    </div>
  );
}
