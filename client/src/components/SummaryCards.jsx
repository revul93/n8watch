import { Server, TrendingUp, TrendingDown, Clock } from 'lucide-react';
import { cn, formatMs } from '../lib/utils';

function Card({ title, value, icon: Icon, colorClass, pulse }) {
  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex items-center gap-4">
      <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0', colorClass)}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-gray-500 uppercase tracking-wider">{title}</p>
        <p className={cn('text-2xl font-bold mt-0.5', pulse && 'animate-pulse text-red-400')}>
          {value}
        </p>
      </div>
    </div>
  );
}

export default function SummaryCards({ targets = [], lastPingResults = {} }) {
  const total = targets.length;

  let up = 0;
  let down = 0;
  let latencySum = 0;
  let latencyCount = 0;

  targets.forEach(t => {
    const latest = lastPingResults[t.id];
    const rawAlive = latest ? latest.is_alive : t.is_alive;
    const isUp = rawAlive === null || rawAlive === undefined ? null : !!rawAlive;
    if (isUp === true) up++;
    else if (isUp === false) down++;

    const lat = latest ? latest.avg_latency : t.avg_latency;
    if (lat !== null && lat !== undefined) {
      latencySum += lat;
      latencyCount++;
    }
  });

  const avgLatency = latencyCount > 0 ? latencySum / latencyCount : null;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card title="Total Hosts" value={total} icon={Server} colorClass="bg-blue-600" />
      <Card title="Hosts Up" value={up} icon={TrendingUp} colorClass="bg-green-600" />
      <Card
        title="Hosts Down"
        value={down}
        icon={TrendingDown}
        colorClass={down > 0 ? 'bg-red-600' : 'bg-gray-700'}
        pulse={down > 0}
      />
      <Card
        title="Avg Latency"
        value={formatMs(avgLatency)}
        icon={Clock}
        colorClass="bg-purple-600"
      />
    </div>
  );
}
