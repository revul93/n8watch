import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement,
  Title, Tooltip, Legend, Filler
);

const API_LATEST_INTERVAL = 5000;
const CHART_REFRESH_INTERVAL = 30000;
const COLORS = ['#3b82f6', '#22c55e', '#eab308', '#ef4444', '#a855f7', '#f97316', '#06b6d4'];

function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString();
}

function fmtMs(v) {
  if (v == null) return '—';
  return `${Number(v).toFixed(1)} ms`;
}

function stateCls(state) {
  if (!state) return 'unknown';
  const s = state.toLowerCase();
  if (s === 'up') return 'up';
  if (s === 'link_down') return 'link_down';
  if (s === 'admin_down') return 'admin_down';
  return 'unknown';
}

function InterfaceTile({ iface }) {
  const cls = stateCls(iface.state);
  return (
    <div className={`status-tile ${cls}`}>
      <div className="tile-name">{iface.iface}</div>
      <span className={`tile-state ${cls}`}>{iface.state || 'UNKNOWN'}</span>
      <div className="tile-meta">Updated: {fmt(iface.ts)}</div>
    </div>
  );
}

function PingTile({ ping }) {
  const ok = ping.success === 1 || ping.success === true;
  return (
    <div className={`status-tile ${ok ? 'up' : 'admin_down'}`}>
      <div className="tile-name">{ping.target_name}</div>
      <div className="flex items-center gap-2">
        <span className={`badge ${ok ? 'badge-green' : 'badge-red'}`}>
          {ok ? 'REACHABLE' : 'UNREACHABLE'}
        </span>
      </div>
      <div className="tile-meta">
        RTT: {fmtMs(ping.rtt_avg_ms)} · Loss: {ping.loss_pct != null ? `${Number(ping.loss_pct).toFixed(0)}%` : '—'}
      </div>
      <div className="tile-meta">{ping.target_ip} · {fmt(ping.ts)}</div>
    </div>
  );
}

function buildLineData(series, label, key, color) {
  const labels = series.map(p => {
    const d = new Date(p.ts * 1000);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });
  return {
    labels,
    datasets: [{
      label,
      data: series.map(p => p[key] != null ? Number(p[key]).toFixed(2) : null),
      borderColor: color,
      backgroundColor: color + '22',
      fill: true,
      tension: 0.3,
      pointRadius: 2,
      borderWidth: 2,
    }],
  };
}

const lineOptions = (yLabel, yMax) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index',
      intersect: false,
      backgroundColor: '#1a1d27',
      borderColor: '#2e3347',
      borderWidth: 1,
      titleColor: '#94a3b8',
      bodyColor: '#e2e8f0',
    },
  },
  scales: {
    x: {
      ticks: { color: '#64748b', maxTicksLimit: 6, font: { size: 10 } },
      grid: { color: '#2e3347' },
    },
    y: {
      ticks: { color: '#64748b', font: { size: 10 } },
      grid: { color: '#2e3347' },
      title: { display: true, text: yLabel, color: '#64748b', font: { size: 10 } },
      ...(yMax != null ? { max: yMax, min: 0 } : { min: 0 }),
    },
  },
});

function PingCharts({ targets }) {
  const [seriesMap, setSeriesMap] = useState({});
  const timerRef = useRef(null);

  const fetchSeries = useCallback(async (window_sec) => {
    const now = Math.floor(Date.now() / 1000);
    const from = now - window_sec;
    const bucket = window_sec <= 900 ? 30 : 60;
    const results = {};
    await Promise.all(targets.map(async (t) => {
      try {
        const res = await fetch(`/api/history/pings/series?target=${encodeURIComponent(t)}&from=${from}&to=${now}&bucket=${bucket}`);
        if (res.ok) results[t] = await res.json();
      } catch (_) {}
    }));
    return results;
  }, [targets]);

  const [series15, setSeries15] = useState({});
  const [series60, setSeries60] = useState({});

  const refresh = useCallback(async () => {
    const [s15, s60] = await Promise.all([fetchSeries(900), fetchSeries(3600)]);
    setSeries15(s15);
    setSeries60(s60);
  }, [fetchSeries]);

  useEffect(() => {
    if (targets.length === 0) return;
    refresh();
    timerRef.current = setInterval(refresh, CHART_REFRESH_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [targets, refresh]);

  if (targets.length === 0) return null;

  return (
    <div>
      <div className="section-title mt-6">📊 Ping Charts</div>
      {targets.map((t, idx) => {
        const color = COLORS[idx % COLORS.length];
        const s15 = series15[t] || [];
        const s60 = series60[t] || [];
        return (
          <div key={t} className="card mb-4">
            <div className="section-title">{t}</div>
            <div className="grid grid-2" style={{ gap: '16px' }}>
              <div>
                <div className="chart-title">RTT Avg — Last 15 min</div>
                <div className="chart-container">
                  <Line data={buildLineData(s15, 'RTT ms', 'avg_rtt_ms', color)} options={lineOptions('ms')} />
                </div>
              </div>
              <div>
                <div className="chart-title">RTT Avg — Last 60 min</div>
                <div className="chart-container">
                  <Line data={buildLineData(s60, 'RTT ms', 'avg_rtt_ms', color)} options={lineOptions('ms')} />
                </div>
              </div>
              <div>
                <div className="chart-title">Packet Loss % — Last 15 min</div>
                <div className="chart-container">
                  <Line data={buildLineData(s15, 'Loss %', 'avg_loss_pct', '#ef4444')} options={lineOptions('%', 100)} />
                </div>
              </div>
              <div>
                <div className="chart-title">Packet Loss % — Last 60 min</div>
                <div className="chart-container">
                  <Line data={buildLineData(s60, 'Loss %', 'avg_loss_pct', '#ef4444')} options={lineOptions('%', 100)} />
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function Realtime() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const timerRef = useRef(null);

  const fetchLatest = useCallback(async () => {
    try {
      const res = await fetch('/api/latest');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastUpdate(new Date());
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    fetchLatest();
    timerRef.current = setInterval(fetchLatest, API_LATEST_INTERVAL);
    return () => clearInterval(timerRef.current);
  }, [fetchLatest]);

  const targets = data?.pings?.map(p => p.target_name) || [];

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-4">
        <h1 style={{ fontSize: '20px', fontWeight: 700 }}>Realtime Status</h1>
        {lastUpdate && (
          <span className="ts-label">Last update: {lastUpdate.toLocaleTimeString()}</span>
        )}
      </div>

      {error && <div className="error-msg">⚠️ {error}</div>}

      {!data && !error && <div className="loading">Loading...</div>}

      {data && (
        <>
          <div className="section-title">🔌 Interfaces</div>
          {data.interfaces.length === 0 ? (
            <div className="card mb-6" style={{ color: 'var(--text-muted)' }}>No interface data yet.</div>
          ) : (
            <div className="grid grid-auto mb-6">
              {data.interfaces.map(iface => (
                <InterfaceTile key={iface.iface} iface={iface} />
              ))}
            </div>
          )}

          <div className="section-title">🏓 Gateways</div>
          {data.pings.length === 0 ? (
            <div className="card mb-6" style={{ color: 'var(--text-muted)' }}>No ping data yet.</div>
          ) : (
            <div className="grid grid-auto mb-6">
              {data.pings.map(ping => (
                <PingTile key={ping.target_name} ping={ping} />
              ))}
            </div>
          )}

          <PingCharts targets={targets} />
        </>
      )}
    </div>
  );
}
