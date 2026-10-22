(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const KEY = 'clinicq-demo-tickets';
  const THEME = 'clinicq-theme';
  const root = document.documentElement;

  /* ---------- Safe storage (demo data only, not secure) ---------- */
  const store = {
    read() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
    write(list) { try { localStorage.setItem(KEY, JSON.stringify(list.slice(-10))); } catch { /* storage unavailable */ } }
  };
  const memory = []; // same-session fallback if storage is blocked
  const SAMPLE = { ticket: 'A024', dept: 'General Outpatient Clinic', status: 'Waiting in Queue', position: 3, wait: 12, sample: true };

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const t = $('emailToast');
    t.hidden = false;
    $('toastMessage').textContent = '';
    setTimeout(() => { $('toastMessage').textContent = msg; }, 60);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, 4500);
  }

  /* ---------- Theme ---------- */
  function applyTheme(dark, save) {
    dark ? root.setAttribute('data-theme', 'dark') : root.removeAttribute('data-theme');
    const b = $('themeToggleBtn');
    b.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    if (save) { try { localStorage.setItem(THEME, dark ? 'dark' : 'light'); } catch { /* ignore */ } }
  }
  applyTheme(root.getAttribute('data-theme') === 'dark', false);
  $('themeToggleBtn').addEventListener('click', () => applyTheme(root.getAttribute('data-theme') !== 'dark', true));

  /* ---------- Mobile menu ---------- */
  const menuBtn = $('menuBtn'), nav = $('siteNav');
  function setMenu(open) {
    nav.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', () => setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
  });
  nav.addEventListener('click', (e) => { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('click', (e) => { if (nav.classList.contains('open') && !e.target.closest('.site-header')) setMenu(false); });
  matchMedia('(min-width: 860px)').addEventListener('change', (m) => { if (m.matches) setMenu(false); });

  /* ---------- Tabs ---------- */
  const tabs = { book: [$('bookTabBtn'), $('bookingFormContainer')], track: [$('trackTabBtn'), $('trackingContainer')] };
  function switchTab(mode) {
    for (const k in tabs) {
      const on = k === mode;
      tabs[k][0].setAttribute('aria-selected', String(on));
      tabs[k][0].tabIndex = on ? 0 : -1;
      tabs[k][1].hidden = !on;
    }
  }
  tabs.book[0].addEventListener('click', () => switchTab('book'));
  tabs.track[0].addEventListener('click', () => switchTab('track'));
  [tabs.book[0], tabs.track[0]].forEach((b) => b.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const next = b === tabs.book[0] ? 'track' : 'book';
      switchTab(next); tabs[next][0].focus();
    }
  }));
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[data-tab]');
    if (!a) return;
    e.preventDefault();
    switchTab(a.dataset.tab);
    goTo(a.dataset.tab);
    history.replaceState(null, '', '#' + a.dataset.tab);
  });
  function goTo(mode) {
    switchTab(mode);
    $('booking').scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    tabs[mode][0].focus({ preventScroll: true });
  }
  const fromHash = () => { if (location.hash === '#track') goTo('track'); else if (location.hash === '#book') goTo('book'); };
  fromHash();
  window.addEventListener('hashchange', fromHash);

  /* ---------- Helpers ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  const localISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const slotMinutes = (s) => { const m = /(\d+):(\d+) (AM|PM)/.exec(s); return (+m[1] % 12 + (m[3] === 'PM' ? 12 : 0)) * 60 + +m[2]; };
  const vitalsFor = (s) => { const t = slotMinutes(s) - 15, h = Math.floor(t / 60); return `${pad(h % 12 || 12)}:${pad(t % 60)} ${h >= 12 ? 'PM' : 'AM'}`; };
  const prettyDate = (iso) => new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  const emailOk = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);

  function setError(id, msg) {
    const input = $(id), err = $('err-' + id);
    if (err) err.textContent = msg || '';
    if (input) { msg ? input.setAttribute('aria-invalid', 'true') : input.removeAttribute('aria-invalid'); }
    return !msg;
  }

  /* ---------- Booking ---------- */
  const dateInput = $('bookingDate');
  let todayISO = localISO(new Date());
  dateInput.min = todayISO;
  dateInput.value = todayISO;

  const form = $('clinicBookingForm'), submitBtn = $('bookSubmit');
  let currentTicket = '';

  function newTicket(dept, used) {
    let t;
    do { t = dept.charAt(0).toUpperCase() + String(Math.floor(Math.random() * 900) + 100); } while (used.includes(t) || t === SAMPLE.ticket);
    return t;
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (submitBtn.disabled) return;
    const name = $('patientName').value.trim();
    const email = $('patientEmail').value.trim();
    const dept = $('patientDept').value;
    const date = dateInput.value;
    const slot = $('bookingSlot').value;
    $('formError').textContent = '';
    todayISO = localISO(new Date());
    dateInput.min = todayISO;

    const checks = [
      setError('patientName', name ? '' : 'Enter your full name.'),
      setError('patientEmail', !email ? 'Enter your email address.' : emailOk(email) ? '' : 'Enter a valid email, like name@example.com.'),
      setError('bookingDate', !date ? 'Choose a date.' : date < todayISO ? 'Choose today or a later date.' : '')
    ];
    if (date === todayISO) {
      const now = new Date();
      if (slotMinutes(slot) <= now.getHours() * 60 + now.getMinutes()) {
        setError('bookingSlot', 'That time has passed today. Choose a later slot or another date.');
        checks.push(false);
      } else setError('bookingSlot', '');
    } else setError('bookingSlot', '');
    if (checks.includes(false)) {
      const first = form.querySelector('[aria-invalid="true"]');
      if (first) first.focus();
      return;
    }

    submitBtn.disabled = true;
    submitBtn.textContent = 'Confirming…';
    setTimeout(() => {
      try {
        const list = store.read();
        const ticket = newTicket(dept, list.map((r) => r.ticket));
        const wait = Math.floor(Math.random() * 14) + 6;
        const vitals = vitalsFor(slot);
        list.push({ ticket, dept, date, slot, vitals, email: email.toLowerCase(), status: 'Booked' });
        store.write(list);
        memory.push(list[list.length - 1]);
        currentTicket = ticket;

        $('displayQueueNumber').textContent = ticket;
        $('displayDeptName').textContent = dept;
        $('displayWaitTime').textContent = 'Not started';
        $('phonePreview').setAttribute('aria-label', `Queue preview, demonstration data: ticket ${ticket}, ${dept}, booked for ${slot}.`);
        $('stepQueue').classList.remove('now');
        $('phoneNotificationText').textContent = `Booked for ${slot}, ${prettyDate(date)}. Demo only.`;

        $('emailRecipientDisplay').textContent = `Saved in this browser for ${name}. No email was sent.`;
        $('mailTicket').textContent = ticket;
        $('mailDept').textContent = dept;
        $('mailDate').textContent = prettyDate(date);
        $('mailVitalsTime').textContent = vitals;
        $('mailConsultTime').textContent = slot;
        form.hidden = true;
        const c = $('emailPreviewCard');
        c.hidden = false;
        c.scrollIntoView({ block: 'nearest' });
        c.focus({ preventScroll: true });
        toast(`Booked. Your queue ticket is ${ticket}.`);
      } catch {
        $('formError').textContent = 'We couldn’t complete your booking. Your details are still here. Please try again.';
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Confirm booking';
      }
    }, 500);
  });

  $('copyTicketBtn').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(currentTicket); toast(`Copied ${currentTicket}.`); }
    catch { toast(`Copy isn’t available here. Your ticket is ${currentTicket}.`); }
  });
  $('newBookingBtn').addEventListener('click', () => {
    form.reset();
    dateInput.value = todayISO;
    $('emailPreviewCard').hidden = true;
    form.hidden = false;
    $('patientName').focus();
  });

  /* ---------- Tracking ---------- */
  const trackForm = $('trackingForm');
  const resultBox = $('trackResultBox'), empty = $('trackEmpty');

  trackForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const q = $('trackInput').value.trim();
    resultBox.hidden = true; empty.hidden = true;
    if (!setError('trackInput', q ? '' : 'Enter a queue number like A024, or your booking email.')) { $('trackInput').focus(); return; }

    const btn = $('trackSubmit');
    btn.disabled = true; btn.textContent = 'Checking…';
    setTimeout(() => {
      btn.disabled = false; btn.textContent = 'Check status';
      const key = q.toLowerCase();
      const records = [SAMPLE, ...store.read(), ...memory];
      const rec = records.filter((r) => r.ticket.toLowerCase() === key || (r.email && r.email === key)).pop();
      if (!rec) {
        empty.textContent = `No ticket found for “${q}”. Check the number, or book a slot first. Only tickets from this browser can be found.`;
        empty.hidden = false;
        return;
      }
      $('resTicket').textContent = rec.ticket;
      $('resStatus').textContent = rec.status;
      if (rec.sample) {
        $('resDetail').textContent = `${rec.dept}. Sample position #${rec.position}, about ${rec.wait} minutes.`;
        $('resNext').textContent = 'Next step: this is a sample ticket showing what a live status would look like.';
      } else {
        $('resDetail').textContent = `${rec.dept}. ${prettyDate(rec.date)} at ${rec.slot}.`;
        $('resNext').textContent = `Next step: arrive at ${rec.vitals} for your vitals check. A queue position appears only when a clinic system is connected.`;
      }
      resultBox.hidden = false;
      resultBox.focus({ preventScroll: true });
    }, 400);
  });
  $('trackInput').addEventListener('input', () => setError('trackInput', ''));
  ['patientName', 'patientEmail', 'bookingDate', 'bookingSlot'].forEach((id) => $(id).addEventListener('input', () => setError(id, '')));
})();