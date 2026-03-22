import {
  LineChart, Line, AreaChart, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Brush
} from 'recharts';
import { format } from 'date-fns';

const COLORS = ['#60a5fa', '#34d399', '#f87171', '#fbbf24', '#a78bfa', '#fb923c', '#38bdf8', '#4ade80'];

function formatTick(ts) {
  if (!ts) return '';
  try { return format(new Date(ts), 'MM/dd HH:mm'); } catch { return ''; }
}

export default function HistoryChart({ data = [], targets = [], metric = 'latency' }) {
  if (!data.length) {
    return (
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
        <div className="flex items-center justify-center h-56 text-gray-500 text-sm">
          No historical data available.
        </div>
      </div>
    );
  }

  const yLabel = metric === 'packet_loss' ? '%' : 'ms';

  const tooltipStyle = {
    contentStyle: { background: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 },
    labelFormatter: (v) => { try { return format(new Date(v), 'MMM d HH:mm:ss'); } catch { return v; } },
    formatter: (v, name) => {
      const t = targets.find(t => String(t.id) === String(name));
      return [`${Number(v).toFixed(2)}${yLabel}`, t ? t.name : name];
    }
  };

  const dataKey = metric === 'latency' ? 'avg_latency'
    : metric === 'jitter' ? 'jitter'
    : 'packet_loss';

  const ChartComponent = metric === 'packet_loss' ? AreaChart : LineChart;
  const DataComponent = metric === 'packet_loss' ? Area : Line;

  const commonProps = {
    dataKey: (d) => d[dataKey],
  };

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <h3 className="text-sm font-semibold text-gray-200 mb-4">Historical Chart</h3>
      <ResponsiveContainer width="100%" height={300}>
        <ChartComponent data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
          <XAxis
            dataKey="ts"
            tickFormatter={formatTick}
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={{ stroke: '#374151' }}
            tickLine={false}
            minTickGap={60}
          />
          <YAxis
            tick={{ fill: '#6b7280', fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            unit={yLabel}
            width={45}
          />
          <Tooltip {...tooltipStyle} />
          <Legend
            formatter={(value) => {
              const t = targets.find(t => String(t.id) === String(value));
              return <span style={{ color: '#d1d5db', fontSize: 12 }}>{t ? t.name : value}</span>;
            }}
          />
          {targets.map((t, i) => (
            <DataComponent
              key={t.id}
              type="monotone"
              dataKey={String(t.id)}
              stroke={COLORS[i % COLORS.length]}
              fill={metric === 'packet_loss' ? COLORS[i % COLORS.length] + '22' : undefined}
              strokeWidth={1.5}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          ))}
          <Brush
            dataKey="ts"
            height={24}
            stroke="#374151"
            fill="#111827"
            travellerWidth={6}
            tickFormatter={formatTick}
          />
        </ChartComponent>
      </ResponsiveContainer>
    </div>
  );
}
