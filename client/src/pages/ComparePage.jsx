import { useState, useEffect, useMemo } from 'react';
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';
import { format } from 'date-fns';
import { useApi } from '../hooks/useApi';
import { getTargets, getGroups, getMetrics } from '../lib/api';
import { buildColorMap } from '../components/UnifiedChart';
import { RANGES } from '../components/TimeRangeSelector';
import { cn } from '../lib/utils';
import { GitCompare, Users, Target as TargetIcon, ChevronDown, ChevronUp } from 'lucide-react';

const METRICS = [
  { key: 'latency', label: 'Latency', field: 'avg_latency', unit: 'ms' },
  { key: 'jitter', label: 'Jitter', field: 'jitter', unit: 'ms' },
  { key: 'loss', label: 'Packet Loss', field: 'packet_loss', unit: '%' },
];

function intervalFor(minutes) {
  return minutes <= 30 ? '1m' : minutes <= 180 ? '5m' : minutes <= 720 ? '15m' : '30m';
}

// One comparison chart: a target (single line) or a group (one line per member).
function ComparePanel({ title, icon: Icon, accent, members, range, metric, colorMap, tall }) {
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(true);
  const m = METRICS.find(x => x.key === metric);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const now = Date.now();
    const from = new Date(now - range.minutes * 60000).toISOString();
    const to = new Date(now).toISOString();
    const interval = intervalFor(range.minutes);
    Promise.all(members.map(t => getMetrics(t.id, { from, to, interval }).then(rows => ({ t, rows })).catch(() => ({ t, rows: [] }))))
      .then(results => {
        if (cancelled) return;
        const byTs = new Map();
        for (const { t, rows } of results) {
          for (const row of rows) {
            const ts = row.bucket || row.timestamp;
            if (!ts) continue;
            if (!byTs.has(ts)) byTs.set(ts, { ts });
            const v = row[m.field];
            byTs.get(ts)[t.id] = v == null ? null : Number(v);
          }
        }
        setData(Array.from(byTs.values()).sort((a, b) => a.ts - b.ts));
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [members, range, metric, m.field]);

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden flex flex-col">
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-800">
        <Icon size={15} style={{ color: accent }} />
        <span className="text-sm font-semibold text-gray-200 truncate">{title}</span>
        <span className="text-xs text-gray-500 ml-auto">{m.label} · {range.label}</span>
      </div>
      <div className={cn('p-2', tall ? 'h-96' : 'h-64')}>
        {loading ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">Loading…</div>
        ) : data.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-500 text-sm">No data for this period</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="ts" tickFormatter={ts => format(new Date(ts), range.minutes <= 180 ? 'HH:mm' : 'MMM d HH:mm')} stroke="#6b7280" fontSize={11} />
              <YAxis stroke="#6b7280" fontSize={11} width={44} />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: 8, fontSize: 12 }}
                labelFormatter={ts => format(new Date(ts), 'MMM d, HH:mm')}
                formatter={(v, name) => [`${Number(v).toFixed(1)}${m.unit}`, members.find(t => String(t.id) === String(name))?.name || name]}
              />
              {members.length > 1 && <Legend formatter={name => members.find(t => String(t.id) === String(name))?.name || name} wrapperStyle={{ fontSize: 11 }} />}
              {members.map(t => (
                <Line key={t.id} type="monotone" dataKey={String(t.id)} stroke={colorMap[t.id] || accent} dot={false} strokeWidth={1.8} connectNulls={false} isAnimationActive={false} />
              ))}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

export default function ComparePage() {
  const { data: targets } = useApi(getTargets, []);
  const { data: groups } = useApi(getGroups, []);
  const [selTargets, setSelTargets] = useState(() => new Set());
  const [selGroups, setSelGroups] = useState(() => new Set());
  const [range, setRange] = useState(RANGES[2]); // 1h
  const [metric, setMetric] = useState('latency');
  const [selectorOpen, setSelectorOpen] = useState(true);

  const allTargets = targets || [];
  const allGroups = groups || [];
  const colorMap = useMemo(() => buildColorMap(allTargets), [allTargets]);
  const targetById = useMemo(() => { const m = new Map(); allTargets.forEach(t => m.set(t.id, t)); return m; }, [allTargets]);

  const toggle = (set, setter) => id => setter(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleTarget = toggle(selTargets, setSelTargets);
  const toggleGroup = toggle(selGroups, setSelGroups);
  const clearAll = () => { setSelTargets(new Set()); setSelGroups(new Set()); };

  // Target panels (single line, compact) and group panels (many lines, full width).
  const targetPanels = useMemo(() => {
    const out = [];
    for (const id of selTargets) {
      const t = targetById.get(id);
      if (t) out.push({ key: `t${id}`, title: t.name, icon: TargetIcon, accent: colorMap[id] || '#2563eb', members: [{ id: t.id, name: t.name }] });
    }
    return out;
  }, [selTargets, targetById, colorMap]);

  const groupPanels = useMemo(() => {
    const out = [];
    for (const gid of selGroups) {
      const g = allGroups.find(x => x.id === gid);
      if (!g) continue;
      const members = g.target_ids.map(tid => targetById.get(tid)).filter(Boolean).map(t => ({ id: t.id, name: t.name }));
      out.push({ key: `g${gid}`, title: `${g.name} (${members.length})`, icon: Users, accent: g.color || '#2563eb', members });
    }
    return out;
  }, [selGroups, targetById, allGroups]);

  const totalSelected = selTargets.size + selGroups.size;
  const btn = (active) => cn('px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors', active ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white bg-gray-800');

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><GitCompare size={20} className="text-blue-400" /> Compare</h1>
        <p className="text-sm text-gray-500 mt-0.5">Select targets and groups to compare side by side — each gets its own chart.</p>
      </div>

      {/* Controls */}
      <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">Metric:</span>
            {METRICS.map(mt => <button key={mt.key} onClick={() => setMetric(mt.key)} className={btn(metric === mt.key)}>{mt.label}</button>)}
          </div>
          <div className="flex items-center gap-1">
            <span className="text-xs text-gray-500 mr-1">Range:</span>
            {RANGES.map(r => <button key={r.key} onClick={() => setRange(r)} className={btn(range.key === r.key)}>{r.label}</button>)}
          </div>
          <button
            onClick={() => setSelectorOpen(o => !o)}
            className="ml-auto flex items-center gap-1.5 text-xs font-medium text-gray-300 hover:text-white bg-gray-800 rounded-md px-2.5 py-1.5"
            title={selectorOpen ? 'Hide selection' : 'Show selection'}
          >
            {selectorOpen ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            {selectorOpen ? 'Hide selection' : 'Edit selection'}
            {totalSelected > 0 && <span className="ml-1 px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px]">{totalSelected}</span>}
          </button>
          {totalSelected > 0 && (
            <button onClick={clearAll} className="text-xs font-medium text-gray-400 hover:text-red-300 bg-gray-800 rounded-md px-2.5 py-1.5">
              Clear
            </button>
          )}
        </div>

        {selectorOpen && (
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><TargetIcon size={13} /> Targets</p>
              <div className="max-h-48 overflow-y-auto border border-gray-800 rounded-lg divide-y divide-gray-800">
                {allTargets.map(t => (
                  <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800/50 cursor-pointer">
                    <input type="checkbox" checked={selTargets.has(t.id)} onChange={() => toggleTarget(t.id)} className="accent-blue-500" />
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: colorMap[t.id] || '#64748b' }} />
                    <span className="flex-1 truncate">{t.name} <span className="text-gray-500 font-mono text-xs">{t.ip}</span></span>
                    {t.is_user_target ? <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">Temp</span> : null}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-2 flex items-center gap-1"><Users size={13} /> Groups</p>
              <div className="max-h-48 overflow-y-auto border border-gray-800 rounded-lg divide-y divide-gray-800">
                {allGroups.length === 0 ? (
                  <p className="px-3 py-2 text-xs text-gray-600">No groups. Create them on the Targets &amp; Groups page.</p>
                ) : allGroups.map(g => (
                  <label key={g.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800/50 cursor-pointer">
                    <input type="checkbox" checked={selGroups.has(g.id)} onChange={() => toggleGroup(g.id)} className="accent-blue-500" />
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: g.color || '#64748b' }} />
                    <span className="flex-1 truncate">{g.name}</span>
                    <span className="text-xs text-gray-500">{g.target_ids.length}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chart panels */}
      {totalSelected === 0 ? (
        <div className="flex flex-col items-center justify-center h-48 gap-2 text-gray-500 border border-dashed border-gray-800 rounded-xl">
          <GitCompare size={28} className="opacity-40" />
          <p className="text-sm">Select targets or groups above to compare.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {/* Target charts: compact, 2-up grid */}
          {targetPanels.length > 0 && (
            <div className="grid xl:grid-cols-2 gap-4">
              {targetPanels.map(p => (
                <ComparePanel key={p.key} title={p.title} icon={p.icon} accent={p.accent} members={p.members} range={range} metric={metric} colorMap={colorMap} />
              ))}
            </div>
          )}
          {/* Group charts: full width, stacked vertically, taller */}
          {groupPanels.map(p => (
            <ComparePanel key={p.key} title={p.title} icon={p.icon} accent={p.accent} members={p.members} range={range} metric={metric} colorMap={colorMap} tall />
          ))}
        </div>
      )}
    </div>
  );
}
