import { useState } from 'react';
import UnifiedChart from './UnifiedChart';
import HostPill from './HostPill';

/**
 * One panel per group, showing:
 *   1. Group header (name + interface alias badge + N up / M down count + width toggle)
 *   2. Mini UnifiedChart scoped to this group's targets (latency only)
 *   3. Responsive grid of HostPill components
 *
 * Props:
 *   groupName        – display name for the group
 *   targets          – array of target objects belonging to this group
 *   lastPingResults  – { [targetId]: pingResult } map from the dashboard
 *   colorMap         – { [targetId]: color } stable color map
 */

const WIDTH_OPTIONS = [
  { key: 'full',  label: 'Full', title: 'Full width',       colSpan: 'col-span-12' },
  { key: 'half',  label: '½',   title: 'Half width',       colSpan: 'col-span-12 md:col-span-6' },
  { key: 'third', label: '⅓',   title: 'One-third width',  colSpan: 'col-span-12 sm:col-span-6 lg:col-span-4' },
];

const DEFAULT_COL_SPAN = 'col-span-12';

function getStorageKey(groupName) {
  return `groupPanelWidth_${groupName}`;
}

export default function GroupPanel({
  groupName,
  targets = [],
  lastPingResults = {},
  colorMap = {},
}) {
  // Local selection state — only affects this group's mini chart
  const [groupSelectedIds, setGroupSelectedIds] = useState([]);

  // Per-group width preference persisted in localStorage
  const [widthKey, setWidthKey] = useState(() => {
    try {
      const saved = localStorage.getItem(getStorageKey(groupName));
      if (saved && WIDTH_OPTIONS.some(o => o.key === saved)) return saved;
    } catch {}
    return 'full';
  });

  function handleWidthChange(key) {
    setWidthKey(key);
    try { localStorage.setItem(getStorageKey(groupName), key); } catch {}
  }

  const colSpan = WIDTH_OPTIONS.find(o => o.key === widthKey)?.colSpan ?? DEFAULT_COL_SPAN;

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
    <div className={colSpan}>
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
            {/* ── Width toggle ── */}
            <span className="flex items-center gap-0.5 ml-1 border border-gray-700 rounded-md overflow-hidden">
              {WIDTH_OPTIONS.map(opt => (
                <button
                  key={opt.key}
                  onClick={() => handleWidthChange(opt.key)}
                  title={opt.title}
                  aria-pressed={widthKey === opt.key}
                  className={`px-1.5 py-0.5 text-xs transition-colors ${
                    widthKey === opt.key
                      ? 'bg-blue-700 text-white'
                      : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </span>
          </span>
        </div>

        {/* ── Mini chart (latency only) ── */}
        <div className="min-w-0">
          <UnifiedChart
            targets={chartTargets}
            lastPingResults={lastPingResults}
            colorMap={colorMap}
            chartHeight={150}
            singleMetric="latency"
          />
        </div>

        {/* ── Host pills (responsive grid) ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
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
    </div>
  );
}
