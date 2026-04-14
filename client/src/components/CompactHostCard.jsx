import { cn, formatMs, formatPercent } from '../lib/utils';

export default function CompactHostCard({ target, lastPingResult, isSelected }) {
  const result = lastPingResult || target;
  const rawAlive = result?.is_alive;
  const isUp = rawAlive === null || rawAlive === undefined ? null : !!rawAlive;
  const avgLatency = result?.avg_latency ?? null;
  const packetLoss = result?.packet_loss ?? null;
  const group = target?.group || null;
  const isUserTarget = !!target?.is_user_target;

  return (
    <div className="px-2 py-1.5">
      {/* Name + status row */}
      <div className="flex items-center gap-1.5 min-w-0">
        <span
          className={cn(
            'w-2 h-2 rounded-full flex-shrink-0',
            isUp === true && 'bg-green-400',
            isUp === false && 'bg-red-400 animate-pulse',
            isUp === null && 'bg-gray-600'
          )}
        />
        <span className="text-xs font-semibold text-white truncate flex-1 min-w-0">
          {target.name}
        </span>
      </div>

      {/* IP */}
      <p className="text-xs text-gray-500 font-mono truncate pl-3.5 mt-0.5">{target.ip}</p>

      {/* Metrics row */}
      <div className="flex items-center gap-3 pl-3.5 mt-1">
        <span className="text-xs text-gray-400">
          <span className="text-gray-600">ms </span>{formatMs(avgLatency)}
        </span>
        <span className={cn('text-xs', packetLoss > 0 ? 'text-yellow-400' : 'text-gray-400')}>
          <span className="text-gray-600">loss </span>{formatPercent(packetLoss)}
        </span>
      </div>

      {/* Badges */}
      {(isUserTarget || group) && (
        <div className="flex flex-wrap gap-1 pl-3.5 mt-1">
          {isUserTarget && (
            <span className="text-xs bg-purple-900/50 text-purple-300 border border-purple-800 px-1.5 py-px rounded-full">
              Temp
            </span>
          )}
          {group && (
            <span className="text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-1.5 py-px rounded-full">
              {group}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
