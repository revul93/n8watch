'use strict';

const ping = require('ping');

/**
 * pingTarget - pings a single target and returns a metrics object.
 *
 * @param {{ name: string, ip: string, interface?: string }} target
 * @param {{ ping_count?: number, ping_timeout?: number }} config
 * @returns {Promise<object>}
 */
async function pingTarget(target, config) {
  const count   = config.ping_count   || 5;
  const timeout = config.ping_timeout || 5;

  // Build extra ping arguments
  const extra = ['-c', String(count)];
  // On Linux/macOS, -I binds the outgoing socket to a specific network interface
  // or source address. This option is not supported on Windows.
  if (target.interface && typeof target.interface === 'string' && target.interface.trim() &&
      process.platform !== 'win32') {
    extra.push('-I', target.interface.trim());
  }

  let response;
  try {
    response = await ping.promise.probe(target.ip, {
      timeout,
      extra,
      // On Linux, min/avg/max/stddev are parsed from the summary line
    });
  } catch (err) {
    console.error(`[Ping] Error pinging ${target.ip}:`, err.message);
    return buildDeadResult(count);
  }

  if (!response.alive) {
    return buildDeadResult(count);
  }

  const avg = parseFloat(response.avg) || 0;
  const min = parseFloat(response.min) || 0;
  const max = parseFloat(response.max) || 0;
  // Approximate jitter as half the min-max spread
  const jitter = (max - min) / 2;

  // packet_loss comes as a string like "0%" or a number
  let packetLoss = 0;
  if (response.packetLoss !== undefined) {
    packetLoss = parseFloat(String(response.packetLoss).replace('%', '')) || 0;
  }

  const packetsReceived = Math.round(count * (1 - packetLoss / 100));

  return {
    is_alive:         true,
    min_latency:      min,
    avg_latency:      avg,
    max_latency:      max,
    jitter:           Math.round(jitter * 100) / 100,
    packet_loss:      packetLoss,
    packets_sent:     count,
    packets_received: packetsReceived,
  };
}

function buildDeadResult(count) {
  return {
    is_alive:         false,
    min_latency:      null,
    avg_latency:      null,
    max_latency:      null,
    jitter:           null,
    packet_loss:      100,
    packets_sent:     count,
    packets_received: 0,
  };
}

/**
 * pingAllTargets - pings all targets concurrently (up to `ping_concurrency`
 * parallel workers when configured, or all at once when concurrency is 0).
 *
 * @param {Array<object>} targets
 * @param {object} config  general config block; may contain `ping_concurrency`
 * @returns {Promise<Array<{ target: object, metrics: object }>>}
 */
async function pingAllTargets(targets, config) {
  const concurrency = config.ping_concurrency || 0; // 0 = unlimited

  const pingOne = async (target) => {
    try {
      const metrics = await pingTarget(target, config);
      return { target, metrics };
    } catch (err) {
      console.error(`[Ping] Unexpected error for ${target.ip}:`, err.message);
      return { target, metrics: buildDeadResult(config.ping_count || 5) };
    }
  };

  if (!concurrency || concurrency >= targets.length) {
    // Unlimited concurrency — fire all at once
    const settled = await Promise.allSettled(targets.map(pingOne));
    return settled.map(r => (r.status === 'fulfilled' ? r.value : { target: r.reason?.target, metrics: buildDeadResult(config.ping_count || 5) }));
  }

  // Capped concurrency — process in batches
  const results = [];
  for (let i = 0; i < targets.length; i += concurrency) {
    const batch = targets.slice(i, i + concurrency);
    const settled = await Promise.allSettled(batch.map(pingOne));
    for (const r of settled) {
      results.push(r.status === 'fulfilled' ? r.value : { target: undefined, metrics: buildDeadResult(config.ping_count || 5) });
    }
  }
  return results;
}

module.exports = { pingTarget, pingAllTargets };
