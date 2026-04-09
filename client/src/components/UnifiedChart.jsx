import { useState, useEffect, useCallback, useRef } from 'react';
import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import MetricToggle from './MetricToggle';
import TimeRangeSelector, { RANGES } from './TimeRangeSelector';
import { getMetrics, getUptime } from '../lib/api';

const COLORS = [
  '#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c',
  '#38bdf8', '#4ade80', '#f472b6', '#e879f9', '#2dd4bf', '#facc15',
  '#818cf8', '#fb7185', '#a3e635', '#22d3ee', '#c084fc', '#fdba74',
  '#86efac', '#67e8f9',
];

/**
 * Build a stable color map from an ordered list of all targets (not just the
 * currently filtered subset). Colors are assigned by position in that master
 * list so they never shift when targets are filtered in or out.
 */
export function buildColorMap(allTargets) {
  const map = {};
  allTargets.forEach((t, i) => {
    map[t.id] = COLORS[i % COLORS.length];
  });
  return map;
}

function formatTick(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'HH:mm'); } catch { return ''; }
}

function formatTooltipLabel(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'MMM d HH:mm:ss'); } catch { return ts; }
}

const CHART_HEADER_HEIGHT = 56; // title row + controls row

/** Circular uptime display used in the chart's uptime view */
function UptimeGauge({ name, color, percent }) {
  const size = 140;
  const strokeWidth = 10;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = percent !== null && percent !== undefined ? Number(percent) : null;
  const offset = pct !== null ? circumference * (1 - pct / 100) : circumference;

  const gaugeColor = pct === null
    ? '#4b5563'
    : pct >= 99 ? '#34d399'
    : pct >= 95 ? '#fbbf24'
    : '#f87171';

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="#1f2937" strokeWidth={strokeWidth} />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={gaugeColor} strokeWidth={strokeWidth}
            strokeDasharray={circumference} strokeDashoffset={offset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-bold" style={{ color: gaugeColor }}>
            {pct !== null ? `${Math.round(pct)}%` : 'N/A'}
          </span>
        </div>
      </div>
      <span className="text-sm font-medium text-gray-300 text-center px-2">{name}</span>
      <span className="text-xs text-gray-500">Overall Uptime</span>
    </div>
  );
}

export default function UnifiedChart({ targets = [], lastPingResults = {}, chartHeight = 280, fillHeight = false, colorMap = {}, controlledMetric }) {
  const [internalMetric, setInternalMetric] = useState('latency');
  const metric = controlledMetric !== undefined ? controlledMetric : internalMetric;
  const [range, setRange] = useState(RANGES[2]); // 1h default
  const [chartData, setChartData] = useState([]);
  const [uptimeData, setUptimeData] = useState({});
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const [dynamicHeight, setDynamicHeight] = useState(chartHeight);

  // Track whether we have successfully loaded data at least once.
  // Used to suppress the loading spinner on silent background refreshes so
  // that the chart doesn't flash "Loading…" every ping cycle (most visible
  // in fullscreen mode where the chart fills the entire screen).
  const hasDataRef = useRef(false);

  // When fillHeight=true, observe the *parent* element so we don't create a
  // feedback loop where the chart growing causes a re-measure → more growth.
  useEffect(() => {
    if (!fillHeight) return;
    const el = containerRef.current?.parentElement;
    if (!el) return;
    const observer = new ResizeObserver(() => {
      const available = el.clientHeight;
      if (available > 0) {
        setDynamicHeight(Math.max(200, available - CHART_HEADER_HEIGHT - 32));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fillHeight]);

  const effectiveHeight = fillHeight ? dynamicHeight : chartHeight;

  // Track previous parameter values to detect full-reload vs incremental-refresh
  const prevMetricRef = useRef(metric);
  const prevRangeRef = useRef(range);
  const prevTargetIdsRef = useRef(targets.map(t => t.id).join(','));

  const fetchData = useCallback(async () => {
    if (!targets.length) return;

    const targetIds = targets.map(t => t.id).join(',');
    const isParamChange =
      prevMetricRef.current !== metric ||
      prevRangeRef.current !== range ||
      prevTargetIdsRef.current !== targetIds;
    prevMetricRef.current = metric;
    prevRangeRef.current = range;
    prevTargetIdsRef.current = targetIds;

    // Only show the loading spinner on the very first load or when the user
    // explicitly changes metric / range / targets. Background incremental
    // refreshes (triggered by incoming ping results) should update the chart
    // silently to avoid a jarring full-screen flash.
    if (!hasDataRef.current || isParamChange) setLoading(true);

    if (metric === 'uptime') {
      try {
        const results = await Promise.allSettled(targets.map(t => getUptime(t.id)));
        const map = {};
        results.forEach((res, i) => {
          if (res.status === 'fulfilled') {
            map[targets[i].id] = res.value?.uptime_overall ?? null;
          } else {
            map[targets[i].id] = null;
          }
        });
        setUptimeData(map);
        hasDataRef.current = true;
      } catch (e) {
        console.error('Uptime fetch error:', e);
      } finally {
        setLoading(false);
      }
      return;
    }

    try {
      const now = new Date();
      const from = new Date(now.getTime() - range.minutes * 60 * 1000).toISOString();
      const to = now.toISOString();

      const metricKey = metric === 'latency' ? 'avg_latency'
        : metric === 'jitter' ? 'jitter'
        : 'packet_loss';

      const interval = range.minutes <= 30 ? '1m'
        : range.minutes <= 180 ? '5m'
        : range.minutes <= 720 ? '15m'
        : '30m';

      const results = await Promise.allSettled(
        targets.map(t => getMetrics(t.id, { from, to, interval }))
      );

      // Build unified time-keyed map
      const timeMap = new Map();
      results.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        const target = targets[i];
        const rows = Array.isArray(res.value) ? res.value : (res.value?.rows || res.value?.data || []);
        rows.forEach(row => {
          const ts = row.bucket || row.timestamp || row.time;
          if (!ts) return;
          const key = new Date(ts).getTime();
          if (!timeMap.has(key)) timeMap.set(key, { ts: key });
          const val = row[metricKey] ?? row.avg_latency ?? row.value ?? null;
          timeMap.get(key)[target.id] = val !== null ? Number(val) : null;
        });
      });

      const sorted = Array.from(timeMap.values()).sort((a, b) => a.ts - b.ts);

      setChartData(prev => {
        // Full replace when metric/range/targets change — intentional user action
        if (isParamChange || !prev.length) {
          hasDataRef.current = true;
          return sorted;
        }

        // Incremental update: merge only new time-buckets to keep the chart visually stable.
        // Returning the same `prev` reference skips the React re-render entirely.
        const prevTsSet = new Set(prev.map(d => d.ts));
        const newPoints = sorted.filter(d => !prevTsSet.has(d.ts));
        if (!newPoints.length) return prev; // nothing new — no re-render

        hasDataRef.current = true;
        const cutoff = Date.now() - range.minutes * 60 * 1000;
        const combined = [...prev, ...newPoints].sort((a, b) => a.ts - b.ts);
        return combined.filter(d => d.ts >= cutoff);
      });
    } catch (e) {
      console.error('Chart fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [targets, metric, range]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Refresh on new ping results
  useEffect(() => {
    const keys = Object.keys(lastPingResults);
    if (keys.length > 0) {
      const timer = setTimeout(fetchData, 2000);
      return () => clearTimeout(timer);
    }
  }, [lastPingResults, fetchData]);

  const handleRangeChange = (r) => setRange(r);

  const yLabel = metric === 'latency' ? 'ms'
    : metric === 'jitter' ? 'ms'
    : '%';

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          Loading chart data…
        </div>
      );
    }

    // ── Uptime: show circles ──────────────────────────────────────────────────
    if (metric === 'uptime') {
      if (!targets.length) {
        return (
          <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
            No targets configured.
          </div>
        );
      }
      return (
        <div
          className="flex flex-wrap items-center justify-center gap-8 py-4 overflow-auto"
          style={{ minHeight: 200, maxHeight: fillHeight ? effectiveHeight : undefined }}
        >
          {targets.map((t, i) => (
            <UptimeGauge
              key={t.id}
              name={t.name}
              color={COLORS[i % COLORS.length]}
              percent={uptimeData[t.id] ?? null}
            />
          ))}
        </div>
      );
    }

    if (!chartData.length) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          No data for selected range.
        </div>
      );
    }

    const commonProps = {
      data: chartData,
      margin: { top: 8, right: 16, left: 0, bottom: 0 },
    };
    const xAxis = (
      <XAxis
        dataKey="ts"
        tickFormatter={formatTick}
        tick={{ fill: '#6b7280', fontSize: 11 }}
        axisLine={{ stroke: '#374151' }}
        tickLine={false}
        minTickGap={40}
      />
    );
    const yAxis = (
      <YAxis
        tick={{ fill: '#6b7280', fontSize: 11 }}
        axisLine={false}
        tickLine={false}
        unit={yLabel}
        width={45}
      />
    );
    const grid = <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />;
    const tooltipStyle = {
      contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 },
      labelFormatter: formatTooltipLabel,
      formatter: (v, name) => {
        const t = targets.find(t => String(t.id) === String(name));
        return [`${Number(v).toFixed(1)}${yLabel}`, t ? t.name : name];
      }
    };
    const legend = (
      <Legend
        formatter={(value) => {
          const t = targets.find(t => String(t.id) === String(value));
          return <span style={{ color: '#d1d5db', fontSize: 12 }}>{t ? t.name : value}</span>;
        }}
      />
    );

    if (metric === 'packet_loss') {
      return (
        <ResponsiveContainer width="100%" height={effectiveHeight}>
          <AreaChart {...commonProps}>
            {grid}{xAxis}{yAxis}
            <Tooltip {...tooltipStyle} />
            {legend}
            {targets.map((t, i) => {
              const color = colorMap[t.id] || COLORS[i % COLORS.length];
              return (
                <Area
                  key={t.id}
                  type="monotone"
                  dataKey={String(t.id)}
                  stroke={color}
                  fill={color + '22'}
                  strokeWidth={1.5}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              );
            })}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    // latency / jitter — multi-line
    return (
      <ResponsiveContainer width="100%" height={effectiveHeight}>
        <LineChart {...commonProps}>
          {grid}{xAxis}{yAxis}
          <Tooltip {...tooltipStyle} />
          {legend}
          {targets.map((t, i) => {
            const color = colorMap[t.id] || COLORS[i % COLORS.length];
            return (
              <Line
                key={t.id}
                type="monotone"
                dataKey={String(t.id)}
                stroke={color}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            );
          })}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div ref={containerRef} className={`bg-gray-900 border border-gray-800 rounded-xl p-4 ${fillHeight ? 'flex-1 flex flex-col overflow-hidden' : ''}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4 flex-shrink-0">
        <h2 className="text-sm font-semibold text-gray-200">
          {controlledMetric === 'latency' ? 'Latency'
            : controlledMetric === 'jitter' ? 'Jitter'
            : controlledMetric === 'packet_loss' ? 'Packet Loss'
            : controlledMetric === 'uptime' ? 'Uptime'
            : 'Live Metrics'}
        </h2>
        <div className="flex flex-wrap gap-2">
          {controlledMetric === undefined && (
            <MetricToggle value={metric} onChange={setInternalMetric} />
          )}
          {metric !== 'uptime' && (
            <TimeRangeSelector value={range.key} onChange={handleRangeChange} />
          )}
        </div>
      </div>
      <div className={fillHeight ? 'flex-1 min-h-0 overflow-hidden' : ''}>
        {renderChart()}
      </div>
    </div>
  );
}

