import HostCard from './HostCard';

export default function HostGrid({ targets = [], lastPingResults = {}, sparklineData = {}, selectedTargetIds = [], onTargetClick, onDeleteUserTarget }) {
  if (!targets.length) {
    return (
      <div className="text-center py-12 text-gray-500">
        No hosts configured.
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {targets.map(target => (
        <HostCard
          key={target.id}
          target={target}
          lastPingResult={lastPingResults[target.id]}
          sparklineData={sparklineData[target.id] || []}
          isSelected={selectedTargetIds.includes(target.id)}
          onTargetClick={onTargetClick}
          onDelete={onDeleteUserTarget}
        />
      ))}
    </div>
  );
}
