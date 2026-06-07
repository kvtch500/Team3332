// lib/gpx.js — GPX file parser (no dependencies)
// Extracts distance, duration, pace, elevation gain, start time, and a
// downsampled route from GPX 1.0/1.1 files (Strava, Garmin, Apple Watch, COROS, etc.)

const MAX_ROUTE_POINTS = 200;

/**
 * Parse raw GPX XML text.
 * @param {string} xml
 * @returns {{ name, distance, pace, duration, logged_at, route_data, elevation_gain, point_count }}
 * @throws {Error} with a user-friendly message if the file is unusable
 */
function parseGpx(xml) {
  if (typeof xml !== 'string' || !xml.trim()) throw new Error('Empty file');
  if (!/<gpx[\s>]/i.test(xml)) throw new Error('Not a GPX file');

  // Track points (<trkpt>), falling back to route points (<rtept>)
  let points = extractPoints(xml, 'trkpt');
  if (points.length < 2) points = extractPoints(xml, 'rtept');
  if (points.length < 2) throw new Error('No track points found in GPX file');

  // ── Distance (haversine, miles) ──
  let meters = 0;
  for (let i = 1; i < points.length; i++) meters += haversine(points[i - 1], points[i]);
  const distance = Math.round((meters / 1609.344) * 100) / 100;
  if (distance < 0.01) throw new Error('GPX track has no measurable distance');

  // ── Duration & pace (need timestamps) ──
  const timed = points.filter(p => p.time);
  let durationSecs = null, duration = null, pace = null, loggedAt = null;
  if (timed.length >= 2) {
    const start = timed[0].time, end = timed[timed.length - 1].time;
    durationSecs = Math.round((end - start) / 1000);
    if (durationSecs > 0) {
      duration = formatHMS(durationSecs);
      pace = formatPace(durationSecs / distance);
    }
    loggedAt = toSqlite(start);
  }

  // ── Elevation gain (ft) ──
  let gainM = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1].ele, b = points[i].ele;
    if (a != null && b != null && b > a) gainM += b - a;
  }
  const elevationGain = Math.round(gainM * 3.28084);

  // ── Activity name ──
  const name = matchTag(xml, 'name') || 'Imported Run';

  // ── Downsampled route for the map ──
  const step = Math.max(1, Math.ceil(points.length / MAX_ROUTE_POINTS));
  const route = [];
  for (let i = 0; i < points.length; i += step)
    route.push([round5(points[i].lat), round5(points[i].lon)]);
  const last = points[points.length - 1];
  const tail = route[route.length - 1];
  if (tail[0] !== round5(last.lat) || tail[1] !== round5(last.lon))
    route.push([round5(last.lat), round5(last.lon)]);

  return {
    name: name.slice(0, 80),
    distance,
    pace,
    duration,
    logged_at: loggedAt,
    route_data: JSON.stringify({ source: 'gpx', points: route }),
    elevation_gain: elevationGain,
    point_count: points.length,
  };
}

// ── helpers ─────────────────────────────────────────────

function extractPoints(xml, tag) {
  // Matches <trkpt lat=".." lon="..">...</trkpt> and self-closing variants
  const re = new RegExp(`<${tag}\\b([^>]*)(?:/>|>([\\s\\S]*?)</${tag}>)`, 'gi');
  const points = [];
  let m;
  while ((m = re.exec(xml)) !== null) {
    const attrs = m[1] || '', inner = m[2] || '';
    const lat = parseFloat(attr(attrs, 'lat')), lon = parseFloat(attr(attrs, 'lon'));
    if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
    const eleStr = matchTag(inner, 'ele');
    const timeStr = matchTag(inner, 'time');
    let time = null;
    if (timeStr) {
      const t = new Date(timeStr);
      if (!isNaN(t)) time = t;
    }
    points.push({ lat, lon, ele: eleStr != null ? parseFloat(eleStr) : null, time });
  }
  return points;
}

function attr(attrs, name) {
  const m = attrs.match(new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i'));
  return m ? m[1] : '';
}

function matchTag(xml, tag) {
  const m = xml.match(new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}>`, 'i'));
  return m ? decodeEntities(m[1].trim()) : null;
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'");
}

function haversine(a, b) {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const s = Math.sin(dLat / 2) ** 2 +
            Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function formatHMS(secs) {
  const h = Math.floor(secs / 3600), m = Math.floor((secs % 3600) / 60), s = secs % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

function formatPace(secsPerMile) {
  if (!isFinite(secsPerMile) || secsPerMile <= 0 || secsPerMile > 3600) return null;
  const m = Math.floor(secsPerMile / 60), s = Math.round(secsPerMile % 60);
  return s === 60 ? `${m + 1}:00` : `${m}:${String(s).padStart(2, '0')}`;
}

function toSqlite(d) {
  return d.toISOString().slice(0, 19).replace('T', ' ');
}

const round5 = n => Math.round(n * 1e5) / 1e5;

module.exports = { parseGpx };
