import { useState, useMemo } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import { format, subHours, subDays } from 'date-fns';
import { cn } from '../lib/utils';

// ── Time-range options (mirrors TimeRangeSelector style) ──────────────────────
const RANGES = [
  { label: '1h',  ms: 3600000 },
  { label: '6h',  ms: 21600000 },
  { label: '24h', ms: 86400000 },
  { label: '7d',  ms: 604800000 },
  { label: 'All', ms: null },
];

function formatTick(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'HH:mm'); } catch { return ''; }
}

function formatTooltipLabel(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'MMM d HH:mm:ss'); } catch { return String(ts); }
}

function fmt(v) {
  if (v == null || isNaN(v)) return '—';
  return `${Number(v).toFixed(1)} Mbps`;
}

// ── Custom tooltip ────────────────────────────────────────────────────────────
function SpeedTooltip({ active, payload, label, show }) {
  if (!active || !payload?.length) return null;
  const dl = payload.find(p => p.dataKey === 'download');
  const ul = payload.find(p => p.dataKey === 'upload');
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-xs shadow-xl">
      <p className="text-gray-400 mb-1">{formatTooltipLabel(label)}</p>
      {(show === 'download' || show === 'both') && dl && (
        <p style={{ color: dl.color }}>↓ Download: {fmt(dl.value)}</p>
      )}
      {(show === 'upload' || show === 'both') && ul && (
        <p style={{ color: ul.color }}>↑ Upload: {fmt(ul.value)}</p>
      )}
    </div>
  );
}

// ── SpeedChart ────────────────────────────────────────────────────────────────
/**
 * @param {object[]}  results    Array of speedtest_results rows from DB / WS
 * @param {'download'|'upload'|'both'} show   Which series to render
 * @param {number}    height     Chart pixel height
 * @param {boolean}   running    True while a test is actively in progress
 */
export default function SpeedChart({ results = [], show = 'both', height = 260, running = false }) {
  const [rangeIdx, setRangeIdx] = useState(0);

  const rangeMs = RANGES[rangeIdx].ms;
  const now = Date.now();

  const filtered = useMemo(() => {
    const rows = rangeMs
      ? results.filter(r => r.created_at >= now - rangeMs)
      : results;
    // chart expects ascending order
    return [...rows].reverse();
  }, [results, rangeMs, now]);

  // Build chart data — exclude rows that have only an error (no speed values)
  const chartData = useMemo(
    () =>
      filtered
        .filter(r => r.download != null || r.upload != null)
        .map(r => ({
          ts:       r.created_at,
          download: r.download != null ? Math.round(r.download * 10) / 10 : null,
          upload:   r.upload   != null ? Math.round(r.upload   * 10) / 10 : null,
        })),
    [filtered],
  );

  const isEmpty = chartData.length === 0;

  // Compute a nice Y-axis max
  const yMax = useMemo(() => {
    const vals = chartData.flatMap(d => [
      show !== 'upload'   ? d.download : null,
      show !== 'download' ? d.upload   : null,
    ].filter(v => v != null));
    if (!vals.length) return 100;
    const max = Math.max(...vals);
    return Math.ceil(max * 1.2 / 10) * 10 || 100;
  }, [chartData, show]);

  return (
    <div className="flex flex-col gap-3">
      {/* Header row */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Internet Speed
        </span>
        <div className="flex items-center gap-1">
          {running && (
            <span className="flex items-center gap-1 text-xs text-blue-400 mr-2">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              Running test…
            </span>
          )}
          {RANGES.map((r, i) => (
            <button
              key={r.label}
              onClick={() => setRangeIdx(i)}
              className={cn(
                'px-2 py-0.5 text-xs rounded transition-colors',
                i === rangeIdx
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-800 text-gray-400 hover:text-white hover:bg-gray-700',
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Chart area */}
      {isEmpty ? (
        <div
          className="flex items-center justify-center text-gray-600 text-sm"
          style={{ height }}
        >
          {running ? 'Running first speed test…' : 'No speed test data yet. Enable speedtest in Settings.'}
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={height}>
          <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id="colorDownload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#3b82f6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="colorUpload" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#22c55e" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#22c55e" stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="ts"
              tickFormatter={formatTick}
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              domain={[0, yMax]}
              tickFormatter={v => `${v}`}
              unit=" Mbps"
              tick={{ fill: '#6b7280', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              width={72}
            />
            <Tooltip content={<SpeedTooltip show={show} />} />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              formatter={(value) => (
                <span style={{ color: '#9ca3af' }}>
                  {value === 'download' ? '↓ Download' : '↑ Upload'}
                </span>
              )}
            />
            {(show === 'download' || show === 'both') && (
              <Area
                type="monotone"
                dataKey="download"
                name="download"
                stroke="#3b82f6"
                strokeWidth={2}
                fill="url(#colorDownload)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            )}
            {(show === 'upload' || show === 'both') && (
              <Area
                type="monotone"
                dataKey="upload"
                name="upload"
                stroke="#22c55e"
                strokeWidth={2}
                fill="url(#colorUpload)"
                dot={false}
                activeDot={{ r: 4 }}
                connectNulls
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
