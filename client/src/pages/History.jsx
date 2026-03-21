import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getTargets, getPingResults, getMetrics } from '../lib/api';
import FilterBar from '../components/FilterBar';
import HistoryChart from '../components/HistoryChart';
import HistoryTable from '../components/HistoryTable';

function getDefaultFrom() {
  const d = new Date(Date.now() - 6 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 16);
}
function getDefaultTo() {
  return new Date().toISOString().slice(0, 16);
}

export default function History() {
  const [searchParams] = useSearchParams();
  const [targets, setTargets] = useState([]);
  const [filters, setFilters] = useState({
    targetId: searchParams.get('target') || '',
    metric: 'latency',
    interval: '5m',
    from: getDefaultFrom(),
    to: getDefaultTo(),
    search: '',
    group: '',
  });
  const [tableRows, setTableRows] = useState([]);
  const [chartData, setChartData] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getTargets().then(data => setTargets(Array.isArray(data) ? data : [])).catch(() => {});
  }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const from = filters.from ? new Date(filters.from).toISOString() : undefined;
      const to = filters.to ? new Date(filters.to).toISOString() : undefined;

      let queryTargets = targets;
      if (filters.targetId) {
        queryTargets = targets.filter(t => String(t.id) === String(filters.targetId));
      } else if (filters.group) {
        queryTargets = targets.filter(t => t.group === filters.group);
      }
      if (!queryTargets.length) queryTargets = targets;

      // Fetch raw ping results for table
      const rawResults = await Promise.allSettled(
        queryTargets.map(t => getPingResults(t.id, { from, to, limit: 500 }))
      );
      const allRows = [];
      rawResults.forEach((res, i) => {
        if (res.status === 'fulfilled') {
          const rows = Array.isArray(res.value) ? res.value : (res.value?.rows || res.value?.results || []);
          rows.forEach(r => allRows.push({ ...r, target_id: r.target_id ?? queryTargets[i].id }));
        }
      });
      setTableRows(allRows);

      // Fetch aggregated metrics for chart
      const metricResults = await Promise.allSettled(
        queryTargets.map(t => getMetrics(t.id, { from, to, interval: filters.interval }))
      );
      const timeMap = new Map();
      metricResults.forEach((res, i) => {
        if (res.status !== 'fulfilled') return;
        const target = queryTargets[i];
        const rows = Array.isArray(res.value) ? res.value : (res.value?.rows || res.value?.data || []);
        const metricKey = filters.metric === 'latency' ? 'avg_latency'
          : filters.metric === 'jitter' ? 'jitter'
          : 'packet_loss';
        rows.forEach(row => {
          const ts = row.bucket || row.timestamp || row.time;
          if (!ts) return;
          const key = new Date(ts).getTime();
          if (!timeMap.has(key)) timeMap.set(key, { ts: key });
          const val = row[metricKey] ?? row.value ?? null;
          timeMap.get(key)[target.id] = val !== null ? Number(val) : null;
        });
      });
      const sorted = Array.from(timeMap.values()).sort((a, b) => a.ts - b.ts);
      setChartData(sorted);
    } catch (e) {
      console.error('History fetch error:', e);
    } finally {
      setLoading(false);
    }
  }, [filters, targets]);

  useEffect(() => {
    if (targets.length) fetchData();
  }, [fetchData, targets.length]);

  const chartTargets = filters.targetId
    ? targets.filter(t => String(t.id) === String(filters.targetId))
    : filters.group
    ? targets.filter(t => t.group === filters.group)
    : targets;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-bold text-white">History</h1>
        <p className="text-sm text-gray-500 mt-0.5">Historical ping data and metrics</p>
      </div>

      <FilterBar targets={targets} filters={filters} onChange={setFilters} />

      <HistoryChart
        data={chartData}
        targets={chartTargets}
        metric={filters.metric}
      />

      <HistoryTable
        rows={tableRows}
        targets={targets}
        filters={filters}
      />
    </div>
  );
}
