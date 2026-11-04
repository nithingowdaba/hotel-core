'use strict';

const { randomUUID } = require('node:crypto');

const MAX_SAMPLES = 1000;
const routes = new Map();
const startedAt = Date.now();

function recordRequest(req, res, next) {
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  const started = process.hrtime.bigint();
  res.once('finish', () => {
    const duration = Number(process.hrtime.bigint() - started) / 1e6;
    const path = req.route ? `${req.routePrefix || ''}${req.route.path}` : 'unmatched';
    const route = `${req.method} ${path}`;
    const status = res.statusCode;
    let metric = routes.get(route);
    if (!metric) {
      metric = { count: 0, errors: 0, durations: [] };
      routes.set(route, metric);
    }
    metric.count += 1;
    if (status >= 500) metric.errors += 1;
    metric.durations.push(duration);
    if (metric.durations.length > MAX_SAMPLES) metric.durations.shift();
    const log = { request_id: requestId, method: req.method, route: path, status,
      duration_ms: Math.round(duration * 100) / 100, hotel_id: req.hotel?.id ?? null, user_id: req.user?.id ?? null };
    const line = JSON.stringify(log);
    if (process.env.NODE_ENV !== 'test') {
      if (duration > 500) console.warn(line);
      else console.log(line);
    }
  });
  next();
}

function setRoutePrefix(req, res, next) {
  req.routePrefix = req.baseUrl;
  next();
}

function percentile(values, pct) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return Math.round(sorted[Math.ceil(pct * sorted.length) - 1] * 100) / 100;
}

function snapshot() {
  const data = [...routes.entries()].map(([route, metric]) => ({
    route,
    count: metric.count,
    errors: metric.errors,
    p50_ms: percentile(metric.durations, 0.5),
    p95_ms: percentile(metric.durations, 0.95),
    max_ms: Math.round(Math.max(...metric.durations) * 100) / 100,
  })).sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
  return { uptime_seconds: Math.floor((Date.now() - startedAt) / 1000), routes: data };
}

module.exports = { recordRequest, setRoutePrefix, snapshot };
