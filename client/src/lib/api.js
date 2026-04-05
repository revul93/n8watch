const BASE = '/api';

function toMs(val) {
  if (val === undefined || val === null) return undefined;
  if (typeof val === 'number') return val;
  const n = Number(val);
  if (!isNaN(n)) return n;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.getTime();
  return undefined;
}

async function request(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) {
        const coerced = (k === 'from' || k === 'to') ? toMs(v) : v;
        if (coerced !== undefined) url.searchParams.set(k, coerced);
      }
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export function getTargets() {
  return request('/targets').then(res => res.targets || []);
}

export function getTarget(id) {
  return request(`/targets/${id}`).then(res => res.target || res);
}

export function getPingResults(targetId, params) {
  return request(`/targets/${targetId}/ping-results`, params);
}

export function getLatestPingResults() {
  return request('/ping-results/latest').then(res => res.rows || []);
}

export function getMetrics(targetId, params) {
  return request(`/targets/${targetId}/metrics`, params).then(res => res.metrics || []);
}

export function getUptime(targetId) {
  return request(`/targets/${targetId}/uptime`);
}

export function getSystemStatus() {
  return request('/dashboard/system');
}

export function getDashboardSummary() {
  return request('/dashboard/summary').then(res => res.summary || res);
}

export function getAlerts(params) {
  return request('/alerts', params);
}

export function getActiveAlerts() {
  return request('/alerts/active').then(res => res.alerts || []);
}

export function getAlertRules() {
  return request('/alerts/rules').then(res => res.rules || []);
}

export function getExportUrl(targetId, from, to) {
  const url = new URL(`/api/targets/${targetId}/export`, window.location.origin);
  if (from) url.searchParams.set('from', toMs(from));
  if (to) url.searchParams.set('to', toMs(to));
  return url.toString();
}

export function getReportData(targetId) {
  return request(`/targets/${targetId}/report`);
}

export function getInterfaces() {
  return request('/interfaces').then(res => res.interfaces || []);
}

export function addUserTarget(name, ip, iface, ifaceAlias) {
  return fetch(`${BASE}/targets/user-targets`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, ip, interface: iface || undefined, interface_alias: ifaceAlias || undefined }),
  }).then(async res => {
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  });
}

export function deleteUserTarget(id) {
  return fetch(`${BASE}/targets/user-targets/${id}`, { method: 'DELETE' }).then(async res => {
    if (!res.ok) throw new Error((await res.json()).error || `HTTP ${res.status}`);
    return res.json();
  });
}
