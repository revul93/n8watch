import { useState } from 'react';
import { Search, Filter, Play } from 'lucide-react';
import { cn } from '../lib/utils';

const METRICS = [
  { key: 'latency', label: 'Latency' },
  { key: 'jitter', label: 'Jitter' },
  { key: 'packet_loss', label: 'Packet Loss' },
];

const INTERVALS = [
  { key: '1m', label: '1 min' },
  { key: '5m', label: '5 min' },
  { key: '15m', label: '15 min' },
  { key: '1h', label: '1 hour' },
];

const DEFAULT_METRIC = 'latency';
const DEFAULT_INTERVAL = '5m';

export default function FilterBar({ targets = [], filters, onChange }) {
  const groups = [...new Set(targets.map(t => t.group).filter(Boolean))];
  // Local draft for the search text — only committed on "Apply Search"
  const [searchDraft, setSearchDraft] = useState(filters.search || '');

  function applySearch() {
    onChange({ ...filters, search: searchDraft });
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter') applySearch();
  }

  function handleReset() {
    setSearchDraft('');
    onChange({ metric: DEFAULT_METRIC, interval: DEFAULT_INTERVAL, search: '', from: filters.from, to: filters.to });
  }

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-4">
      <div className="flex flex-wrap gap-3 items-end">
        {/* Search */}
        <div className="flex-1 min-w-48">
          <label className="block text-xs text-gray-500 mb-1">Search</label>
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                type="text"
                value={searchDraft}
                onChange={e => setSearchDraft(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Host name or IP…"
                className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-600"
              />
            </div>
            <button
              onClick={applySearch}
              className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
              title="Apply search"
            >
              <Play size={13} />
              Apply
            </button>
          </div>
        </div>

        {/* Host */}
        <div className="min-w-40">
          <label className="block text-xs text-gray-500 mb-1">Host</label>
          <select
            value={filters.targetId || ''}
            onChange={e => onChange({ ...filters, targetId: e.target.value })}
            className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
          >
            <option value="">All hosts</option>
            {targets.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* Group */}
        {groups.length > 0 && (
          <div className="min-w-36">
            <label className="block text-xs text-gray-500 mb-1">Group</label>
            <select
              value={filters.group || ''}
              onChange={e => onChange({ ...filters, group: e.target.value })}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
            >
              <option value="">All groups</option>
              {groups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        )}

        {/* Date from */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">From</label>
          <input
            type="datetime-local"
            value={filters.from || ''}
            onChange={e => onChange({ ...filters, from: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Date to */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">To</label>
          <input
            type="datetime-local"
            value={filters.to || ''}
            onChange={e => onChange({ ...filters, to: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
          />
        </div>

        {/* Metric */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Metric</label>
          <select
            value={filters.metric || DEFAULT_METRIC}
            onChange={e => onChange({ ...filters, metric: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
          >
            {METRICS.map(m => (
              <option key={m.key} value={m.key}>{m.label}</option>
            ))}
          </select>
        </div>

        {/* Interval */}
        <div>
          <label className="block text-xs text-gray-500 mb-1">Interval</label>
          <select
            value={filters.interval || DEFAULT_INTERVAL}
            onChange={e => onChange({ ...filters, interval: e.target.value })}
            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-sm text-white focus:outline-none focus:border-blue-600"
          >
            {INTERVALS.map(i => (
              <option key={i.key} value={i.key}>{i.label}</option>
            ))}
          </select>
        </div>

        {/* Reset */}
        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm text-gray-400 hover:text-white transition-colors"
        >
          <Filter size={14} />
          Reset
        </button>
      </div>
    </div>
  );
}
