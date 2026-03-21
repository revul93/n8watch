import { LineChart, Line, ResponsiveContainer, Tooltip } from 'recharts';

export default function SparklineChart({ data = [] }) {
  if (!data || data.length < 2) {
    return (
      <div className="flex items-center justify-center h-10 text-gray-700 text-xs">
        No data
      </div>
    );
  }

  const chartData = data.slice(-20).map((d, i) => ({
    i,
    v: d.avg_latency ?? d.latency ?? d,
  }));

  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={chartData}>
        <Line
          type="monotone"
          dataKey="v"
          stroke="#60a5fa"
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
        <Tooltip
          contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 6, fontSize: 11, padding: '2px 8px' }}
          labelFormatter={() => ''}
          formatter={(v) => [`${Number(v).toFixed(1)}ms`, 'Latency']}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
