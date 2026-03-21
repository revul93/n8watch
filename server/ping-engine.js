'use strict';

const ping = require('ping');

/**
 * pingTarget - pings a single target and returns a metrics object.
 *
 * @param {{ name: string, ip: string }} target
 * @param {{ ping_count?: number, ping_timeout?: number }} config
 * @returns {Promise<object>}
 */
async function pingTarget(target, config) {
  const count   = config.ping_count   || 5;
  const timeout = config.ping_timeout || 5;

  let response;
  try {
    response = await ping.promise.probe(target.ip, {
      timeout,
      extra: ['-c', String(count)],
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
 * pingAllTargets - pings all targets concurrently.
 *
 * @param {Array<object>} targets
 * @param {object} config
 * @returns {Promise<Array<{ target: object, metrics: object }>>}
 */
async function pingAllTargets(targets, config) {
  const results = await Promise.allSettled(
    targets.map((target) => pingTarget(target, config).then((metrics) => ({ target, metrics })))
  );

  return results.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error(`[Ping] Unexpected error for ${targets[i].ip}:`, r.reason);
    return { target: targets[i], metrics: buildDeadResult(config.ping_count || 5) };
  });
}

module.exports = { pingTarget, pingAllTargets };
