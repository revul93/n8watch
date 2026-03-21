import { useNavigate } from 'react-router-dom';
import { cn, formatMs, formatPercent } from '../lib/utils';
import SparklineChart from './SparklineChart';

export default function HostCard({ target, lastPingResult, sparklineData = [] }) {
  const navigate = useNavigate();
  const result = lastPingResult || target;

  const rawAlive = result?.is_alive;
  const isUp = rawAlive === null || rawAlive === undefined ? null : !!rawAlive;
  const avgLatency = result?.avg_latency ?? null;
  const packetLoss = result?.packet_loss ?? null;
  const uptime24h = target?.uptime_24h ?? null;
  const group = target?.group || null;

  return (
    <div
      className="bg-gray-900 border border-gray-800 rounded-xl p-4 cursor-pointer hover:border-blue-700 transition-colors"
      onClick={() => navigate(`/history?target=${target.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white truncate">{target.name}</p>
          <p className="text-xs text-gray-500 font-mono truncate">{target.ip}</p>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
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

      {group && (
        <span className="inline-block text-xs bg-blue-900/50 text-blue-300 border border-blue-800 px-2 py-0.5 rounded-full mb-2">
          {group}
        </span>
      )}

      <div className="grid grid-cols-3 gap-2 mb-3 text-center">
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
        <div>
          <p className="text-xs text-gray-500">Uptime 24h</p>
          <p className={cn('text-sm font-medium', uptime24h !== null && uptime24h < 95 ? 'text-red-400' : 'text-white')}>
            {uptime24h !== null ? formatPercent(uptime24h) : 'N/A'}
          </p>
        </div>
      </div>

      <SparklineChart data={sparklineData} />
    </div>
  );
}
