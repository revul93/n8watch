import GroupPanel from './GroupPanel';

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
    <div className="grid grid-cols-12 gap-4 w-full">
      {groupEntries.map(([groupName, groupTargets]) => (
        <GroupPanel
          key={groupName}
          groupName={groupName}
          targets={groupTargets}
          lastPingResults={lastPingResults}
          colorMap={colorMap}
        />
      ))}
    </div>
  );
}
