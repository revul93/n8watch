import { useEffect, useState, useCallback } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getExpiredTargets } from '../lib/api';
import { RefreshCw, Archive, Clock, Activity, AlertCircle } from 'lucide-react';
import { cn } from '../lib/utils';

function formatDate(ms) {
  if (!ms) return '—';
  return new Date(ms).toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

function formatDateShort(ms) {
  if (!ms) return '';
  return new Date(ms).toISOString().slice(0, 10);
}

function buildDisplayName(target) {
  // Format: ip — name — YYYY-MM-DD (expiry date)
  return `${target.ip} — ${target.name} — ${formatDateShort(target.expired_at)}`;
}

function UptimeBadge({ uptime }) {
  if (uptime === null || uptime === undefined) {
    return <span className="text-gray-500 text-xs">—</span>;
  }
  const pct = Math.round(uptime * 10) / 10;
  const color = pct >= 99 ? 'text-green-400' : pct >= 95 ? 'text-yellow-400' : 'text-red-400';
  return <span className={cn('text-xs font-medium', color)}>{pct}%</span>;
}

export default function ExpiredTargets() {
  const { targetsChangedAt } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getExpiredTargets, []);

  // Refresh when the scheduler broadcasts a targets_changed event (e.g. expiry)
  useEffect(() => {
    if (targetsChangedAt) refetch();
  }, [targetsChangedAt, refetch]);

  const rows = targets || [];

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <Archive size={20} className="text-gray-400" />
            Expired Targets
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Archive of user-defined targets whose monitoring lifetime has ended
          </p>
        </div>
        <button
          onClick={refetch}
          disabled={loading}
          className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Stats bar */}
      <div className="flex items-center gap-3 text-sm text-gray-400">
        <span className="font-medium text-white">{rows.length}</span> archived target{rows.length !== 1 ? 's' : ''}
      </div>

      {/* Table */}
      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center h-40 text-gray-500">
          <RefreshCw size={20} className="animate-spin mr-2" />
          Loading…
        </div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 gap-2 text-gray-500">
          <Archive size={32} className="opacity-40" />
          <p className="text-sm">No expired targets yet</p>
          <p className="text-xs text-gray-600">Targets will appear here once their lifetime ends</p>
        </div>
      ) : (
        <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
                  <th className="text-left px-4 py-3 font-medium">Target</th>
                  <th className="text-left px-4 py-3 font-medium">IP</th>
                  <th className="text-left px-4 py-3 font-medium">Name</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Interface</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Added</th>
                  <th className="text-left px-4 py-3 font-medium">Expired</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Pings</th>
                  <th className="text-right px-4 py-3 font-medium">Uptime</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((target) => (
                  <tr key={target.id} className="hover:bg-gray-800/50 transition-colors">
                    {/* Composite display name */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-300 text-xs break-all">
                        {buildDisplayName(target)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-300 font-mono text-xs">{target.ip}</td>
                    <td className="px-4 py-3 text-white font-medium">{target.name}</td>
                    <td className="px-4 py-3 text-gray-400 text-xs hidden sm:table-cell">
                      {target.interface_alias || target.interface || <span className="text-gray-600">—</span>}
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden md:table-cell whitespace-nowrap">
                      {formatDate(target.target_created_at)}
                    </td>
                    <td className="px-4 py-3 text-xs whitespace-nowrap">
                      <span className="flex items-center gap-1 text-amber-400">
                        <Clock size={12} />
                        {formatDate(target.expired_at)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-400 text-xs hidden sm:table-cell">
                      {target.ping_count ?? 0}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <UptimeBadge uptime={target.uptime_overall} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
