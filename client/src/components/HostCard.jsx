import { useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { cn, formatMs, formatPercent } from '../lib/utils';
import SparklineChart from './SparklineChart';
import UptimeCircle from './UptimeCircle';

export default function HostCard({ target, lastPingResult, sparklineData = [], isSelected = false, onTargetClick, onDelete }) {
  const navigate = useNavigate();
  const result = lastPingResult || target;

  const rawAlive = result?.is_alive;
  const isUp = rawAlive === null || rawAlive === undefined ? null : !!rawAlive;
  const avgLatency = result?.avg_latency ?? null;
  const packetLoss = result?.packet_loss ?? null;
  const uptime_overall = target?.uptime_overall ?? null;
  const group = target?.group || null;
  const isUserTarget = !!target?.is_user_target;

  function handleClick() {
    if (onTargetClick) {
      onTargetClick(target.id);
    } else {
      navigate(`/history?target=${target.id}`);
    }
  }

  function handleDelete(e) {
    e.stopPropagation();
    if (onDelete) onDelete(target);
  }

  return (
    <div
      className={cn(
        'bg-gray-900 border rounded-xl p-4 cursor-pointer transition-colors relative',
        isSelected
          ? 'border-blue-500 ring-1 ring-blue-500/40'
          : 'border-gray-800 hover:border-blue-700'
      )}
      onClick={handleClick}
      title={isSelected ? 'Click to deselect (remove from chart filter)' : 'Click to filter chart to this host'}
    >
      {isUserTarget && onDelete && (
        <button
          onClick={handleDelete}
          className="absolute top-2 right-2 p-1 rounded text-gray-600 hover:text-red-400 hover:bg-gray-800 transition-colors"
          title="Remove this temporary target"
        >
          <X size={14} />
        </button>
      )}
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{target.name}</p>
          <p className="text-xs text-gray-500 font-mono truncate">{target.ip}</p>
        </div>
        <div className={cn('flex items-center gap-1.5 flex-shrink-0 ml-2', isUserTarget && onDelete ? 'pr-5' : '')}>
          <span
            className={cn(
              'w-2.5 h-2.5 rounded-full flex-shrink-0',
              isUp === true && 'bg-green-400',
              isUp === false && 'bg-red-400 animate-pulse',
              isUp === null && 'bg-gray-600'
            )}
          />
          <span className={cn(
            'text-xs font-medium',
            isUp === true && 'text-green-400',
            isUp === false && 'text-red-400',
            isUp === null && 'text-gray-500'
          )}>
            {isUp === true ? 'Up' : isUp === false ? 'Down' : 'Unknown'}
          </span>
        </div>
      </div>

      {isUserTarget && (
        <span className="inline-block text-xs bg-purple-900/50 text-purple-300 border border-purple-800 px-2 py-0.5 rounded-full mb-2 mr-1">
          Temporary
        </span>
      )}
      {group && (
        <span className="inline-block text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full mb-2">
          {group}
        </span>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center items-end">
        <div>
          <p className="text-xs text-gray-500">Latency</p>
          <p className="text-sm font-medium text-white">{formatMs(avgLatency)}</p>
        </div>
        <div>
          <p className="text-xs text-gray-500">Loss</p>
          <p className={cn('text-sm font-medium', packetLoss > 0 ? 'text-yellow-400' : 'text-white')}>
            {formatPercent(packetLoss)}
          </p>
        </div>
        <UptimeCircle percent={uptime_overall} size={52} />
      </div>

      <SparklineChart data={sparklineData} />
    </div>
  );
}
