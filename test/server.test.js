'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DATA_FILE = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'varaus-')), 'bookings.json');
const { createServer } = require('../server');

test('varausten luonti, päällekkäisyys, muokkaus ja poisto', async (t) => {
  const server = createServer().listen(0);
  t.after(() => server.close());
  const base = `http://localhost:${server.address().port}/api/bookings`;
  const call = async (method, url, body) => {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: body && JSON.stringify(body),
    });
    return { status: res.status, data: await res.json() };
  };

  const lab = { name: 'Autolabra', start: '2026-10-05T00:00', end: '2026-10-10T00:00', allDay: true, flexible: true, notes: 'Opetuskäytössä, tarvittaessa saa' };
  const created = await call('POST', base, lab);
  assert.strictEqual(created.status, 201);
  assert.strictEqual(created.data.flexible, true);

  const trip = { name: 'Matti', start: '2026-10-07T09:00', end: '2026-10-07T12:00' };
  const conflict = await call('POST', base, trip);
  assert.strictEqual(conflict.status, 409);
  assert.strictEqual(conflict.data.overlaps.length, 1);

  const forced = await call('POST', base, { ...trip, force: true });
  assert.strictEqual(forced.status, 201);

  const bad = await call('POST', base, { name: 'X', start: '2026-10-07T12:00', end: '2026-10-07T09:00' });
  assert.strictEqual(bad.status, 400);

  const updated = await call('PUT', `${base}/${forced.data.id}`, { ...trip, start: '2026-10-12T09:00', end: '2026-10-12T12:00' });
  assert.strictEqual(updated.status, 200);

  const list = await call('GET', base);
  assert.deepStrictEqual(list.data.map((b) => b.name), ['Autolabra', 'Matti']);

  assert.strictEqual((await call('DELETE', `${base}/${created.data.id}`)).status, 200);
  assert.strictEqual((await call('GET', base)).data.length, 1);
});
