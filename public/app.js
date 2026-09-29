'use strict';

const MONTHS = ['tammikuu', 'helmikuu', 'maaliskuu', 'huhtikuu', 'toukokuu', 'kesäkuu',
  'heinäkuu', 'elokuu', 'syyskuu', 'lokakuu', 'marraskuu', 'joulukuu'];
const WEEKDAYS = ['su', 'ma', 'ti', 'ke', 'to', 'pe', 'la'];
const NAME_KEY = 'varauskalenteri.nimi';

const state = {
  bookings: [],
  month: startOfMonth(new Date()),
  editing: null,
};

const $ = (sel) => document.querySelector(sel);
const dialog = $('#booking-dialog');
const form = $('#booking-form');

// --- Päivämääräapurit. Ajat käsitellään paikallisina merkkijonoina "YYYY-MM-DDTHH:MM". ---

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function parseDate(str) { const [y, m, d] = str.split('-').map(Number); return new Date(y, m - 1, d); }
function addDays(str, n) { const d = parseDate(str); d.setDate(d.getDate() + n); return toDateStr(d); }
function startOfMonth(d) { return new Date(d.getFullYear(), d.getMonth(), 1); }
function todayStr() { return toDateStr(new Date()); }
function nowStr() { const d = new Date(); return `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }

function formatDate(str) {
  const d = parseDate(str);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()}.${d.getMonth() + 1}.`;
}

// Koko päivän varauksen loppu tallennetaan seuraavan päivän keskiyönä; näytetään viimeinen päivä.
function lastDay(b) {
  const [date, time] = b.end.split('T');
  return b.allDay || time === '00:00' ? addDays(date, -1) : date;
}

function formatRange(b) {
  const [sd, st] = b.start.split('T');
  const [ed, et] = b.end.split('T');
  if (b.allDay) {
    const last = lastDay(b);
    return last === sd ? `${formatDate(sd)} koko päivä` : `${formatDate(sd)} – ${formatDate(last)}`;
  }
  if (sd === ed) return `${formatDate(sd)} klo ${st}–${et}`;
  return `${formatDate(sd)} klo ${st} – ${formatDate(ed)} klo ${et}`;
}

// Varauksen näkyvä aika yhden päivän solussa.
function labelForDay(b, day) {
  if (b.allDay) return '';
  const [sd, st] = b.start.split('T');
  const [ed, et] = b.end.split('T');
  const from = sd === day ? st : '';
  const to = ed === day ? et : '';
  if (from && to) return `${from}–${to}`;
  if (from) return `${from}→`;
  if (to) return `→${to}`;
  return '';
}

// --- API ---

async function api(method, url, body) {
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Virhe palvelimella.'), { status: res.status, data });
  return data;
}

async function refresh() {
  try {
    state.bookings = await api('GET', '/api/bookings');
  } catch (err) {
    alert('Varausten lataus epäonnistui: ' + err.message);
  }
  render();
}

// --- Näkymät ---

function render() {
  renderMonth();
  renderUpcoming();
}

function renderMonth() {
  const month = state.month;
  $('#month-title').textContent = `${MONTHS[month.getMonth()]} ${month.getFullYear()}`;

  const grid = $('#grid');
  grid.replaceChildren();

  // Aloitetaan maanantaista.
  const first = new Date(month);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const today = todayStr();

  for (let i = 0; i < 42; i++) {
    const date = new Date(first);
    date.setDate(first.getDate() + i);
    const day = toDateStr(date);
    if (i === 35 && date.getMonth() !== month.getMonth()) break;

    const cell = document.createElement('div');
    cell.className = 'day';
    if (date.getMonth() !== month.getMonth()) cell.classList.add('other-month');
    if (day === today) cell.classList.add('today');
    if (day < today) cell.classList.add('past');
    cell.addEventListener('click', () => openDialog(null, day));

    const num = document.createElement('span');
    num.className = 'day-number';
    num.textContent = date.getDate();
    cell.append(num);

    const dayStart = `${day}T00:00`;
    const dayEnd = `${addDays(day, 1)}T00:00`;
    for (const b of state.bookings) {
      if (!(b.start < dayEnd && dayStart < b.end)) continue;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chip' + (b.flexible ? ' flexible' : '');
      const time = labelForDay(b, day);
      chip.textContent = (time ? time + ' ' : '') + b.name + (b.notes ? ' ℹ' : '');
      chip.title = `${b.name}\n${formatRange(b)}${b.flexible ? '\nAuton saa tarvittaessa' : ''}${b.notes ? '\n\n' + b.notes : ''}`;
      chip.addEventListener('click', (e) => { e.stopPropagation(); openDialog(b); });
      cell.append(chip);
    }
    grid.append(cell);
  }
}

function renderUpcoming() {
  const list = $('#upcoming-list');
  list.replaceChildren();
  const now = nowStr();
  const upcoming = state.bookings.filter((b) => b.end > now);

  if (!upcoming.length) {
    const li = document.createElement('li');
    li.className = 'empty';
    li.textContent = 'Ei tulevia varauksia – auto on vapaana.';
    list.append(li);
    return;
  }

  for (const b of upcoming) {
    const li = document.createElement('li');
    li.className = 'booking' + (b.flexible ? ' flexible' : '');
    if (b.start <= now) li.classList.add('ongoing');
    li.tabIndex = 0;

    const when = document.createElement('div');
    when.className = 'when';
    when.textContent = formatRange(b) + (b.start <= now ? ' · käynnissä' : '');

    const who = document.createElement('div');
    who.className = 'who';
    who.textContent = b.name;
    if (b.flexible) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = 'saa tarvittaessa';
      who.append(' ', tag);
    }
    li.append(when, who);

    if (b.notes) {
      const notes = document.createElement('div');
      notes.className = 'notes';
      notes.textContent = b.notes;
      li.append(notes);
    }
    li.addEventListener('click', () => openDialog(b));
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') openDialog(b); });
    list.append(li);
  }
}

// --- Lomake ---

function setAllDay(allDay) {
  form.startTime.disabled = allDay;
  form.endTime.disabled = allDay;
}

function openDialog(booking, date) {
  state.editing = booking;
  form.reset();
  $('#form-error').hidden = true;
  $('#dialog-title').textContent = booking ? 'Muokkaa varausta' : 'Uusi varaus';
  $('#delete-booking').hidden = !booking;

  if (booking) {
    const [sd, st] = booking.start.split('T');
    const [ed, et] = booking.end.split('T');
    form.name.value = booking.name;
    form.allDay.checked = booking.allDay;
    form.startDate.value = sd;
    form.startTime.value = booking.allDay ? '08:00' : st;
    form.endDate.value = booking.allDay ? lastDay(booking) : ed;
    form.endTime.value = booking.allDay ? '16:00' : et;
    form.flexible.checked = booking.flexible;
    form.notes.value = booking.notes;
  } else {
    const day = date || todayStr();
    form.name.value = localStorage.getItem(NAME_KEY) || '';
    form.startDate.value = day;
    form.endDate.value = day;
    form.startTime.value = '08:00';
    form.endTime.value = '16:00';
  }
  setAllDay(form.allDay.checked);
  dialog.showModal();
  (form.name.value ? form.startDate : form.name).focus();
}

function readForm() {
  const allDay = form.allDay.checked;
  const start = `${form.startDate.value}T${allDay ? '00:00' : form.startTime.value}`;
  const end = allDay
    ? `${addDays(form.endDate.value, 1)}T00:00`
    : `${form.endDate.value}T${form.endTime.value}`;
  return {
    name: form.name.value.trim(),
    start,
    end,
    allDay,
    flexible: form.flexible.checked,
    notes: form.notes.value.trim(),
  };
}

function showError(message) {
  const el = $('#form-error');
  el.textContent = message;
  el.hidden = false;
}

async function save(e) {
  e.preventDefault();
  const booking = readForm();
  if (!allDayOrTimesValid()) return showError('Anna alku- ja loppukellonaika.');
  if (booking.end <= booking.start) return showError('Loppuajan pitää olla alkuajan jälkeen.');

  const url = state.editing ? `/api/bookings/${state.editing.id}` : '/api/bookings';
  const method = state.editing ? 'PUT' : 'POST';
  try {
    try {
      await api(method, url, booking);
    } catch (err) {
      if (err.status !== 409) throw err;
      const lines = err.data.overlaps.map((o) =>
        `• ${o.name}: ${formatRange(o)}${o.flexible ? ' (auton saa tarvittaessa)' : ''}`);
      const ok = confirm(`Aika menee päällekkäin näiden varausten kanssa:\n\n${lines.join('\n')}\n\n` +
        'Sovithan asiasta varaajan kanssa. Tallennetaanko silti?');
      if (!ok) return;
      await api(method, url, { ...booking, force: true });
    }
    localStorage.setItem(NAME_KEY, booking.name);
    dialog.close();
    await refresh();
  } catch (err) {
    showError(err.message);
  }
}

function allDayOrTimesValid() {
  return form.allDay.checked || (form.startTime.value && form.endTime.value);
}

async function remove() {
  const b = state.editing;
  if (!b || !confirm(`Poistetaanko varaus?\n\n${b.name}: ${formatRange(b)}`)) return;
  try {
    await api('DELETE', `/api/bookings/${b.id}`);
    dialog.close();
    await refresh();
  } catch (err) {
    showError(err.message);
  }
}

// --- Tapahtumat ---

form.addEventListener('submit', save);
form.allDay.addEventListener('change', () => setAllDay(form.allDay.checked));
form.startDate.addEventListener('change', () => {
  if (!form.endDate.value || form.endDate.value < form.startDate.value) form.endDate.value = form.startDate.value;
});
$('#cancel').addEventListener('click', () => dialog.close());
$('#delete-booking').addEventListener('click', remove);
$('#new-booking').addEventListener('click', () => openDialog(null));
$('#prev-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() - 1); render(); });
$('#next-month').addEventListener('click', () => { state.month.setMonth(state.month.getMonth() + 1); render(); });
$('#today').addEventListener('click', () => { state.month = startOfMonth(new Date()); render(); });

// Päivitetään näkymä, kun välilehti tulee takaisin näkyviin (joku muu on voinut varata välissä).
document.addEventListener('visibilitychange', () => { if (!document.hidden && !dialog.open) refresh(); });

refresh();
