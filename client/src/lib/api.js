const BASE = '/api';

async function request(path, params) {
  const url = new URL(BASE + path, window.location.origin);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  return res.json();
}

export function getTargets() {
  return request('/targets');
}

export function getTarget(id) {
  return request(`/targets/${id}`);
}

export function getPingResults(targetId, params) {
  return request(`/targets/${targetId}/ping-results`, params);
}

export function getLatestPingResults() {
  return request('/ping-results/latest');
}

export function getMetrics(targetId, params) {
  return request(`/targets/${targetId}/metrics`, params);
}

export function getUptime(targetId) {
  return request(`/targets/${targetId}/uptime`);
}

export function getDashboardSummary() {
  return request('/dashboard/summary');
}

export function getAlerts(params) {
  return request('/alerts', params);
}

export function getActiveAlerts() {
  return request('/alerts/active');
}

export function getExportUrl(targetId, from, to) {
  const url = new URL(`/api/targets/${targetId}/export`, window.location.origin);
  if (from) url.searchParams.set('from', from);
  if (to) url.searchParams.set('to', to);
  return url.toString();
}
