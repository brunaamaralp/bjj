const buckets = new Map();

function bucketKey(academyId) {
  return String(academyId || '_global').trim() || '_global';
}

export function recordAgentRespondLatency(academyId, ms, { timedOut = false } = {}) {
  const key = bucketKey(academyId);
  const b = buckets.get(key) || { samples: [], timeouts: 0 };
  if (timedOut) b.timeouts += 1;
  else {
    b.samples.push(ms);
    if (b.samples.length > 200) b.samples.shift();
  }
  buckets.set(key, b);
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(sorted.length - 1, idx))];
}

export function getAgentRespondMetrics(academyId) {
  const b = buckets.get(bucketKey(academyId)) || { samples: [], timeouts: 0 };
  const sorted = [...b.samples].sort((a, c) => a - c);
  return {
    count: sorted.length,
    p50_ms: percentile(sorted, 50),
    p95_ms: percentile(sorted, 95),
    timeouts: b.timeouts,
  };
}
