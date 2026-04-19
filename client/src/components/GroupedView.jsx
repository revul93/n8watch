import { useState, useCallback } from 'react';
import GroupPanel from './GroupPanel';

const GROUP_MAX_COLS = 4;

/**
 * Groups all targets by `target.group` (falling back to "Ungrouped") and
 * renders one GroupPanel per group in a responsive grid.
 *
 * Props:
 *   targets          – full list of target objects
 *   lastPingResults  – { [targetId]: pingResult } map
 *   colorMap         – stable color map from buildColorMap()
 */
export default function GroupedView({
  targets = [],
  lastPingResults = {},
  colorMap = {},
}) {
  // Per-group column spans (horizontal stretch)
  const [groupColSpans, setGroupColSpans] = useState(() => {
    try { return JSON.parse(localStorage.getItem('groupColSpans') || '{}'); } catch { return {}; }
  });

  const handleExpandGroup = useCallback((groupName) => {
    setGroupColSpans(prev => {
      const next = { ...prev, [groupName]: Math.min(GROUP_MAX_COLS, (prev[groupName] || 1) + 1) };
      localStorage.setItem('groupColSpans', JSON.stringify(next));
      return next;
    });
  }, []);

  const handleCollapseGroup = useCallback((groupName) => {
    setGroupColSpans(prev => {
      if ((prev[groupName] || 1) <= 1) return prev;
      const next = { ...prev, [groupName]: (prev[groupName] || 1) - 1 };
      localStorage.setItem('groupColSpans', JSON.stringify(next));
      return next;
    });
  }, []);
  // Build ordered group map: named groups first, "Ungrouped" last
  const groupMap = new Map();
  targets.forEach(target => {
    const key = target.group || 'Ungrouped';
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(target);
  });

  // Move "Ungrouped" to the end if present
  const groupEntries = [];
  let ungrouped = null;
  for (const [name, groupTargets] of groupMap) {
    if (name === 'Ungrouped') {
      ungrouped = [name, groupTargets];
    } else {
      groupEntries.push([name, groupTargets]);
    }
  }
  if (ungrouped) groupEntries.push(ungrouped);

  if (groupEntries.length === 0) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
      {groupEntries.map(([groupName, groupTargets]) => {
        const colSpan = Math.min(groupColSpans[groupName] || 1, GROUP_MAX_COLS);
        return (
          <div
            key={groupName}
            style={{ gridColumn: colSpan > 1 ? `span ${colSpan}` : undefined }}
          >
            <GroupPanel
              groupName={groupName}
              targets={groupTargets}
              lastPingResults={lastPingResults}
              colorMap={colorMap}
              colSpan={colSpan}
              onExpand={() => handleExpandGroup(groupName)}
              onCollapse={() => handleCollapseGroup(groupName)}
              maxCols={GROUP_MAX_COLS}
            />
          </div>
        );
      })}
    </div>
  );
}
