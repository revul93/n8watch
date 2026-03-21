import { cn } from '../lib/utils';

const METRICS = [
  { key: 'latency', label: 'Latency' },
  { key: 'jitter', label: 'Jitter' },
  { key: 'packet_loss', label: 'Packet Loss' },
  { key: 'uptime', label: 'Uptime' },
];

export default function MetricToggle({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {METRICS.map(m => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          className={cn(
            'px-3 py-1.5 rounded-md text-xs font-medium transition-colors',
            value === m.key
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          )}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
