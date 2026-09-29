'use strict';

// Auton varauskalenteri – pieni palvelin ilman ulkoisia riippuvuuksia.
// Varaukset tallennetaan JSON-tiedostoon (oletuksena data/bookings.json).

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 3000;
const DATA_FILE = process.env.DATA_FILE || path.join(__dirname, 'data', 'bookings.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// Valinnainen yhteinen salasana. Jos asetettu, selain kysyy sen (käyttäjänimellä ei väliä).
const ACCESS_PASSWORD = process.env.ACCESS_PASSWORD || '';

const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MAX_BODY = 64 * 1024;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function loadBookings() {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (err) {
    if (err.code === 'ENOENT') return [];
    throw err;
  }
}

function saveBookings(bookings) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
  const tmp = DATA_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(bookings, null, 2));
  fs.renameSync(tmp, DATA_FILE);
}

let bookings = loadBookings();

function isValidDateTime(value) {
  if (typeof value !== 'string' || !DATETIME_RE.test(value)) return false;
  const d = new Date(value + ':00Z');
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 16) === value;
}

// Tarkistaa ja siistii käyttäjän lähettämän varauksen. Palauttaa { error } tai { value }.
function validateBooking(input) {
  if (!input || typeof input !== 'object') return { error: 'Virheellinen pyyntö.' };
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const { start, end } = input;

  if (!name) return { error: 'Anna varaajan nimi.' };
  if (name.length > 100) return { error: 'Nimi on liian pitkä.' };
  if (notes.length > 2000) return { error: 'Lisätiedot ovat liian pitkät.' };
  if (!isValidDateTime(start) || !isValidDateTime(end)) return { error: 'Virheellinen alku- tai loppuaika.' };
  if (end <= start) return { error: 'Loppuajan pitää olla alkuajan jälkeen.' };

  return {
    value: {
      name,
      start,
      end,
      allDay: Boolean(input.allDay),
      flexible: Boolean(input.flexible),
      notes,
    },
  };
}

// Samassa muodossa olevat aikaleimat voi vertailla merkkijonoina.
function findOverlaps(candidate, ignoreId) {
  return bookings.filter(
    (b) => b.id !== ignoreId && b.start < candidate.end && candidate.start < b.end
  );
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('Pyyntö on liian suuri.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(Object.assign(new Error('Virheellinen JSON.'), { status: 400 }));
      }
    });
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  if (!ACCESS_PASSWORD) return true;
  const header = req.headers.authorization || '';
  if (!header.startsWith('Basic ')) return false;
  const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  const password = decoded.slice(decoded.indexOf(':') + 1);
  const a = Buffer.from(password);
  const b = Buffer.from(ACCESS_PASSWORD);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

async function handleApi(req, res, url) {
  const match = url.pathname.match(/^\/api\/bookings(?:\/([\w-]+))?$/);
  if (!match) return sendJson(res, 404, { error: 'Ei löydy.' });
  const id = match[1];

  if (req.method === 'GET' && !id) {
    const sorted = [...bookings].sort((a, b) => a.start.localeCompare(b.start));
    return sendJson(res, 200, sorted);
  }

  if ((req.method === 'POST' && !id) || (req.method === 'PUT' && id)) {
    const body = await readJsonBody(req);
    const existing = id ? bookings.find((b) => b.id === id) : null;
    if (id && !existing) return sendJson(res, 404, { error: 'Varausta ei löytynyt.' });

    const { error, value } = validateBooking(body);
    if (error) return sendJson(res, 400, { error });

    const overlaps = findOverlaps(value, id);
    if (overlaps.length && !body.force) {
      return sendJson(res, 409, { error: 'Aika on päällekkäin toisen varauksen kanssa.', overlaps });
    }

    const now = new Date().toISOString();
    if (existing) {
      Object.assign(existing, value, { updatedAt: now });
      saveBookings(bookings);
      return sendJson(res, 200, existing);
    }
    const booking = { id: crypto.randomUUID(), ...value, createdAt: now, updatedAt: now };
    bookings.push(booking);
    saveBookings(bookings);
    return sendJson(res, 201, booking);
  }

  if (req.method === 'DELETE' && id) {
    const index = bookings.findIndex((b) => b.id === id);
    if (index === -1) return sendJson(res, 404, { error: 'Varausta ei löytynyt.' });
    bookings.splice(index, 1);
    saveBookings(bookings);
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Menetelmä ei ole sallittu.' });
}

function serveStatic(req, res, url) {
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403);
    return res.end();
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('Ei löydy');
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
    res.end(data);
  });
}

function createServer() {
  return http.createServer(async (req, res) => {
    if (!isAuthorized(req)) {
      res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Auton varauskalenteri", charset="UTF-8"' });
      return res.end('Salasana vaaditaan');
    }
    const url = new URL(req.url, 'http://localhost');
    try {
      if (url.pathname.startsWith('/api/')) return await handleApi(req, res, url);
      if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, { error: 'Menetelmä ei ole sallittu.' });
      return serveStatic(req, res, url);
    } catch (err) {
      if (!res.headersSent) sendJson(res, err.status || 500, { error: err.status ? err.message : 'Palvelinvirhe.' });
      if (!err.status) console.error(err);
    }
  });
}

if (require.main === module) {
  createServer().listen(PORT, () => {
    console.log(`Auton varauskalenteri käynnissä: http://localhost:${PORT}`);
  });
}

module.exports = { createServer, validateBooking };
