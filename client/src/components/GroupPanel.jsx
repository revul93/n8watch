import { useState } from 'react';
import UnifiedChart from './UnifiedChart';
import HostPill from './HostPill';

/**
 * One panel per group, showing:
 *   1. Group header (name + interface alias badge + N up / M down count + chart type toggle)
 *   2. Mini UnifiedChart scoped to this group's targets
 *   3. Centered flex wrap of HostPill components
 *
 * Props:
 *   groupName        – display name for the group
 *   targets          – array of target objects belonging to this group
 *   lastPingResults  – { [targetId]: pingResult } map from the dashboard
 *   colorMap         – { [targetId]: color } stable color map
 */

export default function GroupPanel({
  groupName,
  targets = [],
  lastPingResults = {},
  colorMap = {},
}) {
  // Local selection state — only affects this group's mini chart
  const [groupSelectedIds, setGroupSelectedIds] = useState([]);

  // Chart type: 'line' | 'area'
  const [chartType, setChartType] = useState('line');

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
          {/* ── Chart type toggle ── */}
          <span className="flex items-center gap-0.5 ml-1 border border-gray-700 rounded-md overflow-hidden">
            {['line', 'area'].map(type => (
              <button
                key={type}
                onClick={() => setChartType(type)}
                aria-pressed={chartType === type}
                className={`px-1.5 py-0.5 text-xs capitalize transition-colors ${
                  chartType === type
                    ? 'bg-blue-700 text-white'
                    : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700'
                }`}
              >
                {type}
              </button>
            ))}
          </span>
        </span>
      </div>

      {/* ── Mini chart ── */}
      <div className="min-w-0">
        <UnifiedChart
          targets={chartTargets}
          lastPingResults={lastPingResults}
          colorMap={colorMap}
          chartHeight={150}
          singleMetric="latency"
          chartType={chartType}
        />
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
