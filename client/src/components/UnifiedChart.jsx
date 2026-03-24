import { useState, useEffect, useCallback } from 'react';
import {
  LineChart, Line, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';
import { format } from 'date-fns';
import MetricToggle from './MetricToggle';
import TimeRangeSelector, { RANGES } from './TimeRangeSelector';
import { getMetrics } from '../lib/api';

const COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80'];

function formatTick(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'HH:mm'); } catch { return ''; }
}

function formatTooltipLabel(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'MMM d HH:mm:ss'); } catch { return ts; }
}

export default function UnifiedChart({ targets = [], lastPingResults = {}, chartHeight = 280 }) {
  const [metric, setMetric] = useState('latency');
  const [range, setRange] = useState(RANGES[2]); // 1h default
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  const fetchData = useCallback(async () => {
    if (!targets.length) return;
    setLoading(true);
    try {
      const now = new Date();
      const from = new Date(now.getTime() - range.minutes * 60 * 1000).toISOString();
      const to = now.toISOString();

      const metricKey = metric === 'latency' ? 'avg_latency'
        : metric === 'jitter' ? 'jitter'
        : metric === 'packet_loss' ? 'packet_loss'
        : 'uptime';

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
      setChartData(sorted);
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
    : metric === 'packet_loss' ? '%'
    : '%';

  const renderChart = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
          Loading chart data…
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
        <ResponsiveContainer width="100%" height={chartHeight}>
          <AreaChart {...commonProps}>
            {grid}{xAxis}{yAxis}
            <Tooltip {...tooltipStyle} />
            {legend}
            {targets.map((t, i) => (
              <Area
                key={t.id}
                type="monotone"
                dataKey={String(t.id)}
                stroke={COLORS[i % COLORS.length]}
                fill={COLORS[i % COLORS.length] + '22'}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      );
    }

    if (metric === 'uptime') {
      return (
        <ResponsiveContainer width="100%" height={chartHeight}>
          <BarChart {...commonProps}>
            {grid}{xAxis}{yAxis}
            <Tooltip {...tooltipStyle} />
            {legend}
            {targets.map((t, i) => (
              <Bar
                key={t.id}
                dataKey={String(t.id)}
                fill={COLORS[i % COLORS.length]}
                isAnimationActive={false}
                maxBarSize={12}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      );
    }

    // latency / jitter — multi-line
    return (
      <ResponsiveContainer width="100%" height={chartHeight}>
        <LineChart {...commonProps}>
          {grid}{xAxis}{yAxis}
          <Tooltip {...tooltipStyle} />
          {legend}
          {targets.map((t, i) => (
            <Line
              key={t.id}
              type="monotone"
              dataKey={String(t.id)}
              stroke={COLORS[i % COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 className="text-sm font-semibold text-gray-200">Live Metrics</h2>
        <div className="flex flex-wrap gap-2">
          <MetricToggle value={metric} onChange={setMetric} />
          <TimeRangeSelector value={range.key} onChange={handleRangeChange} />
        </div>
      </div>
      {renderChart()}
    </div>
  );
}
