import { useEffect, useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { useApi } from '../hooks/useApi';
import { getExpiredTargets, getLogReportData, getBrandingLogo, getReportConfig } from '../lib/api';
import { generateISPReport } from '../lib/reportGenerator';
import { RefreshCw, Archive, Clock, FileText } from 'lucide-react';
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

  const [pdfBusyId, setPdfBusyId] = useState(null);
  const [pdfError, setPdfError] = useState('');

  // Refresh when the scheduler broadcasts a targets_changed event (e.g. expiry)
  useEffect(() => {
    if (targetsChangedAt) refetch();
  }, [targetsChangedAt, refetch]);

  const rows = targets || [];

  async function handleExportPdf(target) {
    setPdfBusyId(target.target_id);
    setPdfError('');
    try {
      const [cfg, logoDataUrl] = await Promise.all([
        getReportConfig().catch(() => null),
        getBrandingLogo().catch(() => null),
      ]);
      const rc = cfg || {};
      const data = await getLogReportData(
        target.target_id,
        target.target_created_at || undefined,
        target.expired_at || undefined,
        {
          latencyThreshold: rc.latency_threshold,
          jitterThreshold: rc.jitter_threshold,
          outagesOnly: rc.outages_only,
          includeLog: rc.detailed_log !== false,
        },
      );
      generateISPReport(data, { logoDataUrl });
    } catch (e) {
      setPdfError(`${target.name}: ${e.message || 'Failed to generate report'}`);
    } finally {
      setPdfBusyId(null);
    }
  }

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
        {pdfError && <span className="text-xs text-red-400">· {pdfError}</span>}
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
                  <th className="text-left px-4 py-3 font-medium">Target (IP — Name — Expiry Date)</th>
                  <th className="text-left px-4 py-3 font-medium hidden sm:table-cell">Interface</th>
                  <th className="text-left px-4 py-3 font-medium hidden md:table-cell">Added</th>
                  <th className="text-left px-4 py-3 font-medium">Expired</th>
                  <th className="text-right px-4 py-3 font-medium hidden sm:table-cell">Pings</th>
                  <th className="text-right px-4 py-3 font-medium">Uptime</th>
                  <th className="text-right px-4 py-3 font-medium">Report</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {rows.map((target, idx) => (
                  <tr key={target.target_id ?? `legacy-${target.ip}-${target.expired_at}-${idx}`} className="hover:bg-gray-800/50 transition-colors">
                    {/* Composite display name: ip — hostname — expiry date */}
                    <td className="px-4 py-3">
                      <span className="font-mono text-gray-300 text-xs break-all">
                        {buildDisplayName(target)}
                      </span>
                    </td>
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
                    <td className="px-4 py-3 text-right whitespace-nowrap">
                      {target.reportable && (target.ping_count ?? 0) > 0 ? (
                        <button
                          onClick={() => handleExportPdf(target)}
                          disabled={pdfBusyId != null}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-blue-700 hover:bg-blue-600 disabled:opacity-50 rounded-md text-xs text-white transition-colors"
                          title="Download the availability report PDF for this expired target"
                        >
                          <FileText size={12} />
                          {pdfBusyId === target.target_id ? 'Generating…' : 'PDF'}
                        </button>
                      ) : (
                        <span className="text-xs text-gray-600" title="Per-sample history was not retained for this archived target">
                          n/a
                        </span>
                      )}
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
