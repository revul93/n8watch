import { useState, useMemo } from 'react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';

const PAGE_SIZE = 25;

const SEVERITY_STYLES = {
  critical: 'bg-red-900/40 text-red-400 border-red-800',
  warning: 'bg-yellow-900/40 text-yellow-400 border-yellow-800',
  info: 'bg-blue-900/40 text-blue-400 border-blue-800',
};

export default function AlertsTable({ alerts = [], loading = false }) {
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState('all');

  // Group alerts by target_id + rule_name, keeping first occurrence time
  const grouped = useMemo(() => {
    const map = new Map();
    // Sort by created_at ascending so first occurrence is encountered first
    const sorted = [...alerts].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    for (const alert of sorted) {
      const key = `${alert.target_id}__${alert.rule_name}`;
      if (!map.has(key)) {
        map.set(key, { ...alert, count: 1, last_resolved_at: alert.resolved_at });
      } else {
        const existing = map.get(key);
        existing.count += 1;
        // Keep the earliest created_at (already sorted, so existing is earlier)
        // Update resolved_at to the latest resolved_at among the group
        if (alert.resolved_at) {
          if (!existing.last_resolved_at || new Date(alert.resolved_at) > new Date(existing.last_resolved_at)) {
            existing.last_resolved_at = alert.resolved_at;
          }
        } else {
          // If any occurrence is still active, the group is active
          existing.last_resolved_at = null;
        }
      }
    }
    return Array.from(map.values());
  }, [alerts]);

  const filtered = useMemo(() => {
    if (filter === 'all') return grouped;
    if (filter === 'active') return grouped.filter(a => !a.last_resolved_at);
    return grouped.filter(a => !!a.last_resolved_at);
  }, [grouped, filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function formatTs(ts) {
    if (!ts) return '—';
    try { return format(new Date(ts), 'MMM d, HH:mm:ss'); } catch { return ts; }
  }

  function duration(alert) {
    if (!alert.created_at) return '—';
    const start = new Date(alert.created_at);
    const end = alert.last_resolved_at ? new Date(alert.last_resolved_at) : new Date();
    const ms = end - start;
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const h = Math.floor(m / 60);
    if (h > 0) return `${h}h ${m % 60}m`;
    if (m > 0) return `${m}m ${s % 60}s`;
    return `${s}s`;
  }

  if (loading) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="text-center py-8 text-gray-500 text-sm">Loading alerts…</div>
      </div>
    );
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800">
        <h3 className="text-sm font-semibold text-gray-200">
          Alert History <span className="text-gray-500 font-normal">({filtered.length})</span>
        </h3>
        <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
          {['all', 'active', 'resolved'].map(f => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={cn(
                'px-2.5 py-1 rounded-md text-xs font-medium capitalize transition-colors',
                filter === f ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-800">
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Host</th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Type</th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Severity</th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Status</th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">First Triggered</th>
              <th className="text-left px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Last Resolved</th>
              <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Count</th>
              <th className="text-right px-4 py-2 text-xs font-medium uppercase tracking-wider text-gray-500">Duration</th>
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={8} className="text-center py-10 text-gray-500">No alerts found.</td>
              </tr>
            )}
            {pageRows.map((alert, i) => {
              const isActive = !alert.last_resolved_at;
              const severity = alert.severity || 'warning';
              return (
                <tr key={alert.id ?? i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                  <td className="px-4 py-2 text-sm text-white whitespace-nowrap">
                    {alert.target_name || `Target ${alert.target_id}`}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                    {alert.rule_name || '—'}
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn(
                      'inline-block text-xs border px-2 py-0.5 rounded-full',
                      SEVERITY_STYLES[severity] || SEVERITY_STYLES.warning
                    )}>
                      {severity}
                    </span>
                  </td>
                  <td className="px-4 py-2">
                    <span className={cn('flex items-center gap-1 text-xs font-medium', isActive ? 'text-red-400' : 'text-green-400')}>
                      <span className={cn('w-1.5 h-1.5 rounded-full', isActive ? 'bg-red-400 animate-pulse' : 'bg-green-400')} />
                      {isActive ? 'Active' : 'Resolved'}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                    {formatTs(alert.created_at)}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-400 whitespace-nowrap">
                    {alert.last_resolved_at ? formatTs(alert.last_resolved_at) : <span className="text-gray-600">—</span>}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {alert.count > 1 ? (
                      <span className="inline-flex items-center justify-center min-w-[1.5rem] h-5 rounded-full bg-yellow-900/40 text-yellow-400 border border-yellow-800 text-xs font-bold px-1.5">
                        {alert.count}×
                      </span>
                    ) : (
                      <span className="text-xs text-gray-600">1×</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-right text-xs text-gray-400 whitespace-nowrap">
                    {duration(alert)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-gray-800">
          <span className="text-xs text-gray-500">Page {page} of {totalPages}</span>
          <div className="flex gap-2">
            <button
              disabled={page <= 1}
              onClick={() => setPage(p => p - 1)}
              className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Prev
            </button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)}
              className="px-3 py-1 text-xs bg-gray-800 border border-gray-700 rounded-lg text-gray-400 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
