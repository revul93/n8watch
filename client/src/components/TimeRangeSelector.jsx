import { cn } from '../lib/utils';

const RANGES = [
  { key: '15m', label: '15m', minutes: 15 },
  { key: '30m', label: '30m', minutes: 30 },
  { key: '1h', label: '1h', minutes: 60 },
  { key: '3h', label: '3h', minutes: 180 },
  { key: '6h', label: '6h', minutes: 360 },
  { key: '12h', label: '12h', minutes: 720 },
  { key: '24h', label: '24h', minutes: 1440 },
];

export default function TimeRangeSelector({ value, onChange }) {
  return (
    <div className="flex gap-1 bg-gray-800 rounded-lg p-1">
      {RANGES.map(r => (
        <button
          key={r.key}
          onClick={() => onChange(r)}
          className={cn(
            'px-2 py-1.5 rounded-md text-xs font-medium transition-colors',
            value === r.key
              ? 'bg-blue-600 text-white'
              : 'text-gray-400 hover:text-white'
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

export { RANGES };
