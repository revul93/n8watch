import { useState, useEffect, useMemo } from 'react';
import { useApi } from '../hooks/useApi';
import { useWebSocket } from '../hooks/useWebSocket';
import {
  getTargets, getInterfaces, getGroups,
  updateUserTarget, deleteUserTarget,
  createGroup, updateGroup, deleteGroup, setGroupMembers,
} from '../lib/api';
import { cn, formatMs } from '../lib/utils';
import {
  Target as TargetIcon, Users, Pencil, Trash2, Plus, X, Save, RefreshCw, Settings as SettingsIcon, Clock,
} from 'lucide-react';

const GROUP_COLORS = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

function fmtDate(ms) {
  if (!ms) return '—';
  return new Date(Number(ms)).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-xl w-full max-w-lg max-h-[85vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h3 className="text-sm font-semibold text-gray-100">{title}</h3>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-white"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Labeled({ label, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs text-gray-400">{label}</label>
      {children}
      {hint && <span className="text-xs text-gray-600">{hint}</span>}
    </div>
  );
}

const inputCls = 'px-3 py-2 bg-gray-800 border border-gray-700 rounded text-sm text-gray-100 placeholder-gray-500 focus:outline-none focus:border-blue-500 w-full';

// ── Edit temp target modal ──────────────────────────────────────────────────────
function EditTargetModal({ target, interfaces, onClose, onSaved }) {
  const [name, setName] = useState(target.name || '');
  const [ip, setIp] = useState(target.ip || '');
  const [iface, setIface] = useState(target.interface || '');
  const [lifetime, setLifetime] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const ifaceOptions = [{ value: '', label: '— any —' }, ...(interfaces || []).map(f => ({ value: f.name, label: f.alias ? `${f.name} — ${f.alias}` : f.name }))];
  const ifaceAlias = (interfaces || []).find(f => f.name === iface)?.alias || null;

  async function save() {
    setSaving(true); setError('');
    try {
      await updateUserTarget(target.id, {
        name, ip,
        interface: iface || null,
        interface_alias: ifaceAlias,
        lifetime_days: lifetime === '' ? undefined : lifetime,
      });
      onSaved();
    } catch (e) { setError(e.message); setSaving(false); }
  }

  return (
    <Modal title={`Edit ${target.name}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Labeled label="Name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} /></Labeled>
        <Labeled label="IP / Host"><input className={inputCls} value={ip} onChange={e => setIp(e.target.value)} /></Labeled>
        <Labeled label="Interface">
          <select className={inputCls} value={iface} onChange={e => setIface(e.target.value)}>
            {ifaceOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Labeled>
        <Labeled label="Lifetime (days from creation)" hint={`Currently expires ${fmtDate(target.expires_at)}. Leave blank to keep.`}>
          <input className={inputCls} type="number" min="1" value={lifetime} onChange={e => setLifetime(e.target.value)} placeholder="unchanged" />
        </Labeled>
        {error && <span className="text-xs text-red-400">{error}</span>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} Save
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Create / edit group modal ───────────────────────────────────────────────────
function GroupEditorModal({ group, targets, onClose, onSaved }) {
  const editing = !!group;
  const [name, setName] = useState(group?.name || '');
  const [color, setColor] = useState(group?.color || GROUP_COLORS[0]);
  const [memberIds, setMemberIds] = useState(() => new Set(group?.target_ids || []));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  function toggle(id) {
    setMemberIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  async function save() {
    if (!name.trim()) { setError('Group name is required'); return; }
    setSaving(true); setError('');
    try {
      let id = group?.id;
      if (editing) await updateGroup(id, { name, color });
      else { const g = await createGroup({ name, color }); id = g.id; }
      await setGroupMembers(id, [...memberIds]);
      onSaved();
    } catch (e) { setError(e.message); setSaving(false); }
  }

  const sorted = [...targets].sort((a, b) => (a.is_user_target - b.is_user_target) || a.name.localeCompare(b.name));

  return (
    <Modal title={editing ? `Edit group "${group.name}"` : 'New group'} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <Labeled label="Group name"><input className={inputCls} value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Riyadh links" autoFocus /></Labeled>
        <Labeled label="Color">
          <div className="flex gap-2 flex-wrap">
            {GROUP_COLORS.map(c => (
              <button key={c} onClick={() => setColor(c)} className={cn('w-7 h-7 rounded-full border-2', color === c ? 'border-white' : 'border-transparent')} style={{ backgroundColor: c }} />
            ))}
          </div>
        </Labeled>
        <Labeled label={`Members (${memberIds.size})`}>
          <div className="max-h-56 overflow-y-auto border border-gray-800 rounded-lg divide-y divide-gray-800">
            {sorted.map(t => (
              <label key={t.id} className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-300 hover:bg-gray-800/50 cursor-pointer">
                <input type="checkbox" checked={memberIds.has(t.id)} onChange={() => toggle(t.id)} className="accent-blue-500" />
                <span className="flex-1 truncate">{t.name} <span className="text-gray-500 font-mono text-xs">{t.ip}</span></span>
                <span className={cn('text-[10px] px-1.5 py-0.5 rounded', t.is_user_target ? 'bg-amber-900/40 text-amber-300' : 'bg-gray-700 text-gray-300')}>{t.is_user_target ? 'Temp' : 'System'}</span>
              </label>
            ))}
          </div>
        </Labeled>
        {error && <span className="text-xs text-red-400">{error}</span>}
        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="px-3 py-2 text-sm text-gray-400 hover:text-white">Cancel</button>
          <button onClick={save} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm rounded-lg">
            {saving ? <RefreshCw size={14} className="animate-spin" /> : <Save size={14} />} {editing ? 'Save' : 'Create'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ── Main page ───────────────────────────────────────────────────────────────────
export default function TargetsPage() {
  const { targetsChangedAt } = useWebSocket();
  const { data: targets, loading, refetch } = useApi(getTargets, []);
  const { data: interfaces } = useApi(getInterfaces, []);
  const { data: groups, refetch: refetchGroups } = useApi(getGroups, []);

  const [editTarget, setEditTarget] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // {group} or {} for new
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (targetsChangedAt) refetch(); }, [targetsChangedAt, refetch]);

  const rows = targets || [];
  const grpList = groups || [];

  // group chips per target
  const groupsByTarget = useMemo(() => {
    const m = new Map();
    for (const g of grpList) for (const tid of g.target_ids) {
      if (!m.has(tid)) m.set(tid, []);
      m.get(tid).push(g);
    }
    return m;
  }, [grpList]);

  async function onDeleteTarget(t) {
    if (!window.confirm(`Delete temporary target "${t.name}"? Its history is kept and it will appear in Expired.`)) return;
    setBusy(true);
    try { await deleteUserTarget(t.id); refetch(); } catch (e) { alert(e.message); } finally { setBusy(false); }
  }

  async function onDeleteGroup(g) {
    if (!window.confirm(`Delete group "${g.name}"? (Targets are not affected.)`)) return;
    try { await deleteGroup(g.id); refetchGroups(); } catch (e) { alert(e.message); }
  }

  return (
    <div className="flex flex-col gap-6 max-w-6xl">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2"><TargetIcon size={20} className="text-blue-400" /> Targets &amp; Groups</h1>
        <p className="text-sm text-gray-500 mt-0.5">Edit temporary targets and organize any targets into groups for comparison. System targets are managed in Settings.</p>
      </div>

      {/* Groups manager */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200 flex items-center gap-2"><Users size={16} className="text-blue-400" /> Groups <span className="text-gray-500 font-normal">({grpList.length})</span></h2>
          <button onClick={() => setGroupModal({})} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-lg text-xs text-white"><Plus size={13} /> New group</button>
        </div>
        <div className="p-4">
          {grpList.length === 0 ? (
            <p className="text-sm text-gray-500">No groups yet. Create one to compare several targets together.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {grpList.map(g => (
                <div key={g.id} className="flex items-center gap-2 bg-gray-800 border border-gray-700 rounded-lg pl-3 pr-2 py-1.5">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: g.color || '#64748b' }} />
                  <span className="text-sm text-gray-200">{g.name}</span>
                  <span className="text-xs text-gray-500">{g.target_ids.length}</span>
                  <button onClick={() => setGroupModal({ group: g })} className="p-1 text-gray-400 hover:text-white"><Pencil size={13} /></button>
                  <button onClick={() => onDeleteGroup(g)} className="p-1 text-red-400 hover:text-red-300"><Trash2 size={13} /></button>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Targets table */}
      <section className="bg-gray-900 border border-gray-800 rounded-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-800">
          <h2 className="text-sm font-semibold text-gray-200">All Targets <span className="text-gray-500 font-normal">({rows.length})</span></h2>
          <button onClick={refetch} disabled={loading} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-xs text-gray-400 hover:text-white disabled:opacity-50"><RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh</button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-800 text-gray-500 text-xs uppercase tracking-wide">
                <th className="text-left px-4 py-2 font-medium">Name</th>
                <th className="text-left px-4 py-2 font-medium">IP</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Interface</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Uptime</th>
                <th className="text-left px-4 py-2 font-medium hidden lg:table-cell">Groups</th>
                <th className="text-left px-4 py-2 font-medium hidden md:table-cell">Expires</th>
                <th className="text-right px-4 py-2 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr><td colSpan={9} className="text-center py-10 text-gray-500">{loading ? 'Loading…' : 'No targets.'}</td></tr>
              )}
              {rows.map(t => {
                const temp = !!t.is_user_target;
                const chips = groupsByTarget.get(t.id) || [];
                return (
                  <tr key={t.id} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                    <td className="px-4 py-2 text-white whitespace-nowrap">{t.name}</td>
                    <td className="px-4 py-2 text-gray-400 font-mono text-xs whitespace-nowrap">{t.ip}</td>
                    <td className="px-4 py-2 text-gray-400 text-xs hidden md:table-cell">{t.interface_alias || t.interface || '—'}</td>
                    <td className="px-4 py-2">
                      <span className={cn('text-[10px] px-1.5 py-0.5 rounded', temp ? 'bg-amber-900/40 text-amber-300' : 'bg-gray-700 text-gray-300')}>{temp ? 'Temp' : 'System'}</span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={cn('inline-flex items-center gap-1 text-xs font-medium', t.is_alive ? 'text-green-400' : t.is_alive === 0 ? 'text-red-400' : 'text-gray-500')}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', t.is_alive ? 'bg-green-400' : t.is_alive === 0 ? 'bg-red-400' : 'bg-gray-500')} />
                        {t.is_alive ? 'Up' : t.is_alive === 0 ? 'Down' : '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right text-xs text-gray-300 hidden sm:table-cell">{t.uptime_overall != null ? `${t.uptime_overall.toFixed(1)}%` : '—'}</td>
                    <td className="px-4 py-2 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {chips.length === 0 ? <span className="text-gray-600 text-xs">—</span> : chips.map(g => (
                          <span key={g.id} className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-300">
                            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: g.color || '#64748b' }} />{g.name}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 text-xs text-gray-400 hidden md:table-cell whitespace-nowrap">
                      {temp ? <span className="inline-flex items-center gap-1"><Clock size={11} />{fmtDate(t.expires_at)}</span> : '—'}
                    </td>
                    <td className="px-4 py-2 text-right whitespace-nowrap">
                      {temp ? (
                        <div className="inline-flex gap-1">
                          <button onClick={() => setEditTarget(t)} className="p-1.5 text-blue-400 hover:bg-blue-900/20 rounded" title="Edit"><Pencil size={14} /></button>
                          <button onClick={() => onDeleteTarget(t)} disabled={busy} className="p-1.5 text-red-400 hover:bg-red-900/20 rounded disabled:opacity-50" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs text-gray-600" title="System targets are edited in Settings"><SettingsIcon size={12} /> Settings</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {editTarget && <EditTargetModal target={editTarget} interfaces={interfaces} onClose={() => setEditTarget(null)} onSaved={() => { setEditTarget(null); refetch(); }} />}
      {groupModal && <GroupEditorModal group={groupModal.group} targets={rows} onClose={() => setGroupModal(null)} onSaved={() => { setGroupModal(null); refetchGroups(); }} />}
    </div>
  );
}
