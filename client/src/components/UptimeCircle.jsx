export default function UptimeCircle({ percent, size = 56 }) {
  const pct = percent !== null && percent !== undefined ? Number(percent) : null;
  const radius = (size - 8) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset =
    pct !== null ? circumference * (1 - pct / 100) : circumference;

  const color =
    pct === null
      ? '#4b5563'
      : pct >= 99
      ? '#34d399'
      : pct >= 95
      ? '#fbbf24'
      : '#f87171';

  return (
    <div className="flex flex-col items-center">
      <p className="text-xs text-gray-500 mb-1">Uptime 24h</p>
      <div className="relative" style={{ width: size, height: size }}>
        <svg
          width={size}
          height={size}
          style={{ transform: 'rotate(-90deg)' }}
          aria-label={pct !== null ? `Uptime 24h: ${Math.round(pct)}%` : 'Uptime 24h: no data'}
          role="img"
        >
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#1f2937"
            strokeWidth={4}
          />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={4}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xs font-bold" style={{ color }}>
            {pct !== null ? `${Math.round(pct)}%` : 'N/A'}
          </span>
        </div>
      </div>
    </div>
  );
}
