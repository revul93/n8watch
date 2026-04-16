import { cn, formatMs } from '../lib/utils';

/**
 * Compact single-line pill representing one monitored target.
 *
 * Props:
 *   target          – target object from config
 *   lastPingResult  – latest ping result for this target (or undefined)
 *   isSelected      – whether this target is in the main chart selection
 *   onTargetClick   – callback(targetId) to toggle selection
 */
export default function HostPill({ target, lastPingResult, isSelected = false, onTargetClick }) {
  const result = lastPingResult || {};
  const rawAlive = result?.is_alive;
  const isUp = rawAlive === null || rawAlive === undefined ? null : !!rawAlive;
  const avgLatency = result?.avg_latency ?? null;

  function handleClick() {
    if (onTargetClick) onTargetClick(target.id);
  }

  return (
    <button
      onClick={handleClick}
      title={
        isSelected
          ? 'Click to deselect (remove from chart filter)'
          : 'Click to filter main chart to this host'
      }
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-medium transition-all',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500',
        isSelected
          ? 'border-blue-500 ring-1 ring-blue-500/40 bg-blue-950/40 text-white'
          : 'border-gray-700 bg-gray-800 text-gray-300 hover:border-blue-600 hover:text-white',
        isUp === false && !isSelected && 'border-red-700 text-red-400',
        isUp === false && isSelected && 'border-red-500 ring-red-500/40',
      )}
    >
      {/* Status dot */}
      <span
        className={cn(
          'w-2 h-2 rounded-full flex-shrink-0',
          isUp === true && 'bg-green-400',
          isUp === false && 'bg-red-400 animate-pulse',
          isUp === null && 'bg-gray-500',
        )}
      />
      {/* Host name */}
      <span className="truncate max-w-[120px]">{target.name}</span>
      {/* Latency */}
      <span
        className={cn(
          'text-xs font-mono flex-shrink-0',
          isUp === false ? 'text-red-400' : 'text-gray-400',
        )}
      >
        {formatMs(avgLatency)}
      </span>
    </button>
  );
}
