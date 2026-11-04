const { test } = require('node:test');
const assert = require('node:assert/strict');
const { ApiClient, normalizeServer } = require('../.test-build/client.js');
const { buildProperties, canReserve, canReview } = require('../.test-build/properties.js');
const json = (data, status = 200) => new Response(JSON.stringify(data), { status });

test('server normalization supports emulator and HTTPS and rejects insecure public hosts', () => {
  assert.equal(normalizeServer('http://10.0.2.2:8001'), 'http://10.0.2.2:8001/api/');
  assert.equal(normalizeServer('https://portal.example/api/'), 'https://portal.example/api/');
  for (const url of ['http://public.example', 'https://user:password@example.com', 'https://example.com?token=secret']) assert.throws(() => normalizeServer(url));
});
test('all roles retain server identity; credentials sent only to login', async () => {
  for (const role of ['admin', 'manager', 'broker', 'agent', 'client']) {
    let stored;
    const client = new ApiClient('https://test/api/', async (tokens) => { stored = tokens; }, () => {}, async (url, options) => {
      assert.equal(url, 'https://test/api/login/'); assert.equal(options.headers.Authorization, undefined);
      assert.deepEqual(JSON.parse(options.body), { username: 'same-account', password: 'password' });
      return json({ user: { id: 1, role }, access: 'access', refresh: 'refresh' });
    });
    assert.equal((await client.login('same-account', 'password')).role, role);
    assert.deepEqual(stored, { access: 'access', refresh: 'refresh' });
  }
});
test('concurrent expired requests refresh once and use rotated tokens', async () => {
  let refreshes = 0; let stored;
  const client = new ApiClient('https://test/api/', async (tokens) => { stored = tokens; }, () => {}, async (url, options) => {
    if (url.endsWith('token/refresh/')) { refreshes++; await new Promise((resolve) => setTimeout(resolve, 10)); return json({ access: 'new', refresh: 'rotated' }); }
    return options.headers.Authorization === 'Bearer old' ? json({ detail: 'Expired' }, 401) : json({ ok: true });
  });
  client.setTokens({ access: 'old', refresh: 'refresh' });
  assert.deepEqual(await Promise.all([client.request('lots/'), client.request('reservations/')]), [{ ok: true }, { ok: true }]);
  assert.equal(refreshes, 1); assert.equal(stored.refresh, 'rotated');
});
test('invalid refresh removes saved tokens and expires session', async () => {
  let expired = false; let saved = 'not cleared';
  const client = new ApiClient('https://test/api/', async (tokens) => { saved = tokens; }, () => { expired = true; }, async () => json({ detail: 'Invalid token' }, 401));
  client.setTokens({ access: 'old', refresh: 'bad' });
  await assert.rejects(client.request('lots/')); assert.equal(saved, null); assert.equal(expired, true);
});
test('network failure does not retry writes or discard session', async () => {
  let calls = 0; let expired = false;
  const client = new ApiClient('https://test/api/', async () => {}, () => { expired = true; }, async () => { calls++; throw new Error('offline'); });
  client.setTokens({ access: 'valid', refresh: 'valid' });
  await assert.rejects(client.request('reservation-requests/', { method: 'POST' }), /Cannot reach/);
  assert.equal(calls, 1); assert.equal(expired, false);
});
test('logout during refresh cannot restore tokens', async () => {
  let resolve; let saved = false;
  const client = new ApiClient('https://test/api/', async () => { saved = true; }, () => {}, async (url) => url.endsWith('token/refresh/') ? new Promise((done) => { resolve = done; }) : json({}, 401));
  client.setTokens({ access: 'old', refresh: 'refresh' });
  const pending = client.request('lots/');
  while (!resolve) await new Promise((done) => setTimeout(done, 1));
  client.setTokens(null); resolve(json({ access: 'new' }));
  await assert.rejects(pending); assert.equal(saved, false);
});
const lot = { id: 1, subdivision_name: 'Park', block: '1', lot_number: 2, area: 100, price: '500000', status: 'available' };
const mapLot = { id: 'uuid', block_number: '1', lot_number: 'Lot 2', status: 'available', area_sqm: '100', price: '500000' };
const blueprint = { id: 'map', title: 'Park', status: 'published', lots: [mapLot] };
test('web inventory and map changes are reflected without duplicated lots', () => {
  assert.equal(buildProperties([lot], [blueprint]).length, 1);
  for (const status of ['pending', 'reserved', 'sold']) {
    assert.equal(buildProperties([{ ...lot, status }], [blueprint])[0].status, status);
    assert.equal(buildProperties([lot], [{ ...blueprint, lots: [{ ...mapLot, status }] }])[0].status, status);
  }
});
test('ambiguous map lots remain visible but cannot be reserved', () => {
  const rows = buildProperties([lot], [{ ...blueprint, lots: [mapLot, { ...mapLot, id: 'other' }] }]);
  assert.equal(rows.length, 2); assert.ok(rows.every((row) => row.needsReview && !canReserve('client', row)));
});
test('draft and open-space map records are not offered as properties', () => {
  assert.equal(buildProperties([], [{ ...blueprint, status: 'draft' }]).length, 0);
  assert.equal(buildProperties([], [{ ...blueprint, lots: [{ ...mapLot, status: 'open_space' }] }]).length, 0);
});
test('role actions match existing reservation permissions', () => {
  const property = buildProperties([lot], [blueprint])[0];
  assert.ok(canReserve('client', property));
  assert.ok(!canReserve('agent', property));
  assert.ok(!canReserve('client', { ...property, status: 'reserved' }));
  assert.ok(canReview('admin') && canReview('manager') && canReview('broker'));
  assert.ok(!canReview('client') && !canReview('agent'));
});


test('slow data reads survive 15 seconds and report a distinct timeout at 60 seconds', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let signal;
  const client = new ApiClient('https://test/api/', async () => {}, () => {}, async (_url, options) => {
    signal = options.signal;
    return new Promise((resolve, reject) => {
      finish = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  client.setTokens({ access: 'valid', refresh: 'valid' });
  const first = client.request('lots/');
  t.mock.timers.tick(20000);
  assert.equal(signal.aborted, false);
  finish(json([{ id: 1 }]));
  assert.deepEqual(await first, [{ id: 1 }]);
  const second = client.request('reservation-requests/');
  const rejected = assert.rejects(second, /server took too long/);
  t.mock.timers.tick(60000);
  await rejected;
});

test('timed out writes are not retried and warn to check the result', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const client = new ApiClient('https://test/api/', async () => {}, () => {}, async (_url, options) => {
    calls++;
    return new Promise((_resolve, reject) => options.signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true }));
  });
  client.setTokens({ access: 'valid', refresh: 'valid' });
  const pending = client.request('reservation-requests/', { method: 'POST' });
  const rejected = assert.rejects(pending, /check its status/);
  t.mock.timers.tick(15000);
  await rejected;
  assert.equal(calls, 1);
});


test('login allows slow authentication and uses a sign-in-specific timeout', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let finish;
  let signal;
  let calls = 0;
  const client = new ApiClient('https://test/api/', async () => {}, () => {}, async (_url, options) => {
    calls++;
    signal = options.signal;
    return new Promise((resolve, reject) => {
      finish = resolve;
      signal.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
    });
  });
  const first = client.login('test', 'test');
  t.mock.timers.tick(20000);
  assert.equal(signal.aborted, false);
  finish(json({ user: { id: 1 }, access: 'valid', refresh: 'valid' }));
  assert.deepEqual(await first, { id: 1 });
  const second = client.login('test', 'test');
  const rejected = assert.rejects(second, /Sign-in timed out/);
  t.mock.timers.tick(60000);
  await rejected;
  assert.equal(calls, 2);
});
