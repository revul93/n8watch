import React, { useState, useCallback } from 'react';
import {
  Chart as ChartJS,
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
} from 'chart.js';
import { Line, Bar } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, BarElement,
  Title, Tooltip, Legend, Filler
);

function toEpoch(dtLocal) {
  if (!dtLocal) return null;
  return Math.floor(new Date(dtLocal).getTime() / 1000);
}

function localDatetime(offsetSecs = 0) {
  const d = new Date(Date.now() + offsetSecs * 1000);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fmt(ts) {
  if (!ts) return '—';
  const d = new Date(ts * 1000);
  return d.toLocaleString();
}

function fmtShort(ts) {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

const CHART_OPTS = (yLabel, yMax) => ({
  responsive: true,
  maintainAspectRatio: false,
  animation: false,
  plugins: {
    legend: { display: false },
    tooltip: {
      mode: 'index', intersect: false,
      backgroundColor: '#1a1d27', borderColor: '#2e3347', borderWidth: 1,
      titleColor: '#94a3b8', bodyColor: '#e2e8f0',
    },
  },
  scales: {
    x: { ticks: { color: '#64748b', maxTicksLimit: 8, font: { size: 10 } }, grid: { color: '#2e3347' } },
    y: {
      ticks: { color: '#64748b', font: { size: 10 } },
      grid: { color: '#2e3347' },
      title: { display: true, text: yLabel, color: '#64748b', font: { size: 10 } },
      min: 0,
      ...(yMax != null ? { max: yMax } : {}),
    },
  },
});

const STATE_COLORS = { UP: '#22c55e', LINK_DOWN: '#eab308', ADMIN_DOWN: '#ef4444' };
const MAX_DISPLAY_ROWS = 500;

export default function History() {
  const [fromDt, setFromDt] = useState(localDatetime(-3600));
  const [toDt, setToDt] = useState(localDatetime(0));
  const [selectedIface, setSelectedIface] = useState('');
  const [selectedTarget, setSelectedTarget] = useState('');
  const [onlyFailures, setOnlyFailures] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const [ifaceSeries, setIfaceSeries] = useState([]);
  const [pingSeries, setPingSeries] = useState([]);
  const [ifaceRows, setIfaceRows] = useState([]);
  const [pingRows, setPingRows] = useState([]);

  const query = useCallback(async () => {
    const from = toEpoch(fromDt);
    const to = toEpoch(toDt);
    if (!from || !to) { setError('Invalid date range'); return; }
    setLoading(true);
    setError(null);
    try {
      const range = to - from;
      const bucket = range <= 3600 ? 60 : range <= 86400 ? 300 : 3600;
      const qs = `from=${from}&to=${to}&bucket=${bucket}`;

      const [ifSerRes, pingSerRes, ifRowRes, pingRowRes] = await Promise.all([
        fetch(`/api/history/interfaces/series?${qs}${selectedIface ? `&iface=${encodeURIComponent(selectedIface)}` : ''}`),
        fetch(`/api/history/pings/series?${qs}${selectedTarget ? `&target=${encodeURIComponent(selectedTarget)}` : ''}`),
        fetch(`/api/history/interfaces?from=${from}&to=${to}${selectedIface ? `&iface=${encodeURIComponent(selectedIface)}` : ''}`),
        fetch(`/api/history/pings?from=${from}&to=${to}${selectedTarget ? `&target=${encodeURIComponent(selectedTarget)}` : ''}`),
      ]);

      if (!ifSerRes.ok || !pingSerRes.ok || !ifRowRes.ok || !pingRowRes.ok) {
        throw new Error('One or more API calls failed');
      }

      let [ifseries, pingseries, ifrows, pingrows] = await Promise.all([
        ifSerRes.json(), pingSerRes.json(), ifRowRes.json(), pingRowRes.json()
      ]);

      if (onlyFailures) {
        ifrows = ifrows.filter(r => r.state !== 'UP');
        pingrows = pingrows.filter(r => r.success === 0 || r.loss_pct > 0);
      }

      setIfaceSeries(ifseries);
      setPingSeries(pingseries);
      setIfaceRows(ifrows);
      setPingRows(pingrows);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [fromDt, toDt, selectedIface, selectedTarget, onlyFailures]);

  const pingRttData = {
    labels: pingSeries.map(p => fmtShort(p.ts)),
    datasets: [{
      label: 'Avg RTT (ms)',
      data: pingSeries.map(p => p.avg_rtt_ms != null ? Number(p.avg_rtt_ms).toFixed(2) : null),
      borderColor: '#3b82f6',
      backgroundColor: '#3b82f622',
      fill: true, tension: 0.3, pointRadius: 2, borderWidth: 2,
    }],
  };

  const pingLossData = {
    labels: pingSeries.map(p => fmtShort(p.ts)),
    datasets: [{
      label: 'Avg Loss (%)',
      data: pingSeries.map(p => p.avg_loss_pct != null ? Number(p.avg_loss_pct).toFixed(1) : null),
      backgroundColor: '#ef444466',
      borderColor: '#ef4444',
      borderWidth: 1,
    }],
  };

  const stateColors = ifaceSeries.map(s => STATE_COLORS[s.state] || '#64748b');
  const ifaceStateData = {
    labels: ifaceSeries.map(p => fmtShort(p.ts)),
    datasets: [{
      label: 'State',
      data: ifaceSeries.map(p => p.count || 1),
      backgroundColor: stateColors,
      borderColor: stateColors,
      borderWidth: 1,
    }],
  };

  return (
    <div className="page">
      <h1 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '20px' }}>History</h1>

      <div className="card mb-6">
        <div className="form-row">
          <div className="form-group">
            <label>From</label>
            <input type="datetime-local" value={fromDt} onChange={e => setFromDt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>To</label>
            <input type="datetime-local" value={toDt} onChange={e => setToDt(e.target.value)} />
          </div>
          <div className="form-group">
            <label>Interface (optional)</label>
            <input
              type="text" placeholder="e.g. wan1"
              value={selectedIface} onChange={e => setSelectedIface(e.target.value)}
              style={{ width: '130px' }}
            />
          </div>
          <div className="form-group">
            <label>Gateway (optional)</label>
            <input
              type="text" placeholder="e.g. gw-wan1"
              value={selectedTarget} onChange={e => setSelectedTarget(e.target.value)}
              style={{ width: '130px' }}
            />
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <label className="toggle-row">
              <input type="checkbox" checked={onlyFailures} onChange={e => setOnlyFailures(e.target.checked)} />
              Only failures
            </label>
          </div>
          <div className="form-group">
            <label>&nbsp;</label>
            <button onClick={query} disabled={loading}>
              {loading ? 'Loading…' : 'Query'}
            </button>
          </div>
        </div>
      </div>

      {error && <div className="error-msg">⚠️ {error}</div>}

      {pingSeries.length > 0 && (
        <div className="mb-6">
          <div className="section-title">🏓 Ping — Latency & Loss</div>
          <div className="grid grid-2" style={{ gap: '16px' }}>
            <div className="chart-card">
              <div className="chart-title">Average RTT (ms)</div>
              <div className="chart-container">
                <Line data={pingRttData} options={CHART_OPTS('ms')} />
              </div>
            </div>
            <div className="chart-card">
              <div className="chart-title">Packet Loss (%)</div>
              <div className="chart-container">
                <Bar data={pingLossData} options={CHART_OPTS('%', 100)} />
              </div>
            </div>
          </div>
        </div>
      )}

      {ifaceSeries.length > 0 && (
        <div className="mb-6">
          <div className="section-title">🔌 Interface State Timeline</div>
          <div className="chart-card">
            <div className="chart-title">State (green=UP, yellow=LINK_DOWN, red=ADMIN_DOWN)</div>
            <div className="chart-container" style={{ height: '120px' }}>
              <Bar
                data={ifaceStateData}
                options={{
                  ...CHART_OPTS(''),
                  plugins: {
                    ...CHART_OPTS('').plugins,
                    legend: { display: false },
                    tooltip: {
                      callbacks: {
                        label: (ctx) => {
                          const s = ifaceSeries[ctx.dataIndex];
                          return `${s.state} (${s.count} samples)`;
                        },
                      },
                      backgroundColor: '#1a1d27', borderColor: '#2e3347', borderWidth: 1,
                      titleColor: '#94a3b8', bodyColor: '#e2e8f0',
                    },
                  },
                  scales: {
                    ...CHART_OPTS('').scales,
                    y: { display: false },
                  },
                }}
              />
            </div>
          </div>
        </div>
      )}

      {pingRows.length > 0 && (
        <div className="mb-6">
          <div className="section-title">Ping Samples ({pingRows.length})</div>
          <div className="card table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Target</th>
                  <th>IP</th>
                  <th>Success</th>
                  <th>Sent</th>
                  <th>Received</th>
                  <th>Loss %</th>
                  <th>RTT Min</th>
                  <th>RTT Avg</th>
                  <th>RTT Max</th>
                </tr>
              </thead>
              <tbody>
                {pingRows.slice(0, MAX_DISPLAY_ROWS).map(row => (
                  <tr key={row.id}>
                    <td>{fmt(row.ts)}</td>
                    <td>{row.target_name}</td>
                    <td>{row.target_ip}</td>
                    <td>
                      <span className={`badge ${row.success ? 'badge-green' : 'badge-red'}`}>
                        {row.success ? 'OK' : 'FAIL'}
                      </span>
                    </td>
                    <td>{row.sent}</td>
                    <td>{row.received}</td>
                    <td>{row.loss_pct != null ? `${Number(row.loss_pct).toFixed(0)}%` : '—'}</td>
                    <td>{row.rtt_min_ms != null ? `${Number(row.rtt_min_ms).toFixed(1)}` : '—'}</td>
                    <td>{row.rtt_avg_ms != null ? `${Number(row.rtt_avg_ms).toFixed(1)}` : '—'}</td>
                    <td>{row.rtt_max_ms != null ? `${Number(row.rtt_max_ms).toFixed(1)}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {ifaceRows.length > 0 && (
        <div className="mb-6">
          <div className="section-title">Interface Samples ({ifaceRows.length})</div>
          <div className="card table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Interface</th>
                  <th>Admin Up</th>
                  <th>Link Up</th>
                  <th>State</th>
                </tr>
              </thead>
              <tbody>
                {ifaceRows.slice(0, MAX_DISPLAY_ROWS).map(row => {
                  const cls = row.state === 'UP' ? 'badge-green' : row.state === 'LINK_DOWN' ? 'badge-yellow' : 'badge-red';
                  return (
                    <tr key={row.id}>
                      <td>{fmt(row.ts)}</td>
                      <td>{row.iface}</td>
                      <td>{row.admin_up ? '✓' : '✗'}</td>
                      <td>{row.link_up ? '✓' : '✗'}</td>
                      <td><span className={`badge ${cls}`}>{row.state}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && pingSeries.length === 0 && ifaceSeries.length === 0 && ifaceRows.length === 0 && pingRows.length === 0 && (
        <div className="card" style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '40px' }}>
          Select a date range and click Query to view history.
        </div>
      )}
    </div>
  );
}
