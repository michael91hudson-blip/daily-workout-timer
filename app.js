/* Workout app behavior. All words and numbers come from content.js. */
(function () {
  'use strict';
  var C = window.CONTENT;
  var N = C.num;
  var TEST = /[?&]test\b/.test(location.search);
  var NOFILES = /[?&]nofiles\b/.test(location.search);
  var appEl = document.getElementById('app');

  function nowMs() { return performance.now(); }
  function TESTLOG(ev, a) { if (TEST) { (window.__log = window.__log || []).push([Math.round(nowMs()), ev, a === undefined ? '' : a]); } }

  /* ---------- small helpers ---------- */
  function h(tag, props) {
    var e = document.createElement(tag);
    props = props || {};
    Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (k === 'class') e.className = v;
      else if (k === 'hidden') e.hidden = !!v;
      else if (k.indexOf('on') === 0) e[k] = v;
      else if (v !== false && v != null) e.setAttribute(k, v);
    });
    var kids = Array.prototype.slice.call(arguments, 2);
    (function add(list) {
      list.forEach(function (c) {
        if (c == null || c === false) return;
        if (Array.isArray(c)) { add(c); return; }
        e.appendChild(c.nodeType ? c : document.createTextNode(String(c)));
      });
    })(kids);
    return e;
  }
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ } }
  };

  /* ---------- saved settings (on this phone only) ---------- */
  var S = {
    his: { name: store.get('his_name', ''), say: store.get('his_say', '') },
    her: { name: store.get('her_name', ''), say: store.get('her_say', '') },
    setsHer: store.get('her_sets', 2),
    setsHis: store.get('his_sets', 2),
    lower: store.get('his_lower', N.pushupDownDefault),
    day: store.get('day', 'B'),
    bridge: store.get('her_bridge', N.bridgeHoldDefault),
    short: false,
    verse: store.get('verse', 0)
  };
  if (S.setsHer !== 1 && S.setsHer !== 2 && S.setsHer !== 3) S.setsHer = 2;
  if (S.setsHis !== 2 && S.setsHis !== 3) S.setsHis = 2;
  if (S.lower !== N.pushupDownDefault && S.lower !== N.pushupDownMax) S.lower = N.pushupDownDefault;
  if (!C.days.some(function (d) { return d.key === S.day; })) S.day = 'B';
  if (!(S.bridge >= N.bridgeHoldMin && S.bridge <= N.bridgeHoldMax)) S.bridge = N.bridgeHoldDefault;
  if (!(S.verse >= 0 && S.verse < C.verses.length)) S.verse = 0;

  function named(pid) { return S[pid].name.trim() !== ''; }
  function shownName(pid) { return S[pid].name.trim(); }
  function sayName(pid) { return (S[pid].say.trim() || S[pid].name.trim()); }
  function slotLabel(pid) { return pid === 'her' ? 'Her workout' : 'His workout'; }
  function namedList() { return ['her', 'his'].filter(named); }
  function maxSetsFor(pid) { return pid === 'her' ? S.setsHer : S.setsHis; }
  function activeIn(set, m) { return namedList().filter(function (p) { return set <= maxSetsFor(p) && (!m || m[p]); }); }
  function curDay() { return C.days.filter(function (d) { return d.key === S.day; })[0]; }
  function curMoves() { return curDay().moves; }
  var DONE_CUE = { A: 'day-complete-a', B: 'day-complete', C: 'day-complete-c' };
  function totalSets() { return Math.max.apply(null, namedList().map(maxSetsFor)); }
  function joinNames(pids, fn) { return pids.map(fn).join(' and '); }

  /* ---------- sounds ---------- */
  var Snd = {
    ctx: null, lastBeep: -1000,
    unlock: function () {
      try {
        if (!this.ctx) { var AC = window.AudioContext || window.webkitAudioContext; if (AC) this.ctx = new AC(); }
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume();
      } catch (e) { /* ignore */ }
    },
    tone: function (freq, dur, gain) {
      try {
        if (!this.ctx) return;
        var t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
        o.type = 'sine'; o.frequency.value = freq;
        g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g); g.connect(this.ctx.destination); o.start(t); o.stop(t + dur + 0.02);
      } catch (e) { /* ignore */ }
    },
    beep: function () { var n = nowMs(); if (n - this.lastBeep < 250) return; this.lastBeep = n; TESTLOG('beep'); this.tone(880, 0.18, 0.3); },
    tick: function () { TESTLOG('tick'); this.tone(1300, 0.04, 0.12); }
  };
  /* beep once each time the countdown passes 3, 2, 1 seconds remaining */
  function beepCross(before, after) {
    for (var k = 3; k >= 1; k--) { if (before > k && after <= k) { Snd.beep(); return; } }
  }

  /* ---------- voice: your recordings first, then the phone voice ---------- */
  var SILENT = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA=';
  var Voice = {
    q: [], cur: null, aud: null, missing: {}, lastEnd: 0, partFin: null, picked: null,
    init: function () { if (!this.aud) { try { this.aud = new Audio(); this.aud.preload = 'auto'; } catch (e) { this.aud = null; } } },
    unlock: function () {
      try {
        this.init();
        if (this.aud) { this.aud.src = SILENT; var p = this.aud.play(); if (p && p.catch) p.catch(function () {}); }
        if ('speechSynthesis' in window) { var u = new SpeechSynthesisUtterance(' '); u.volume = 0; window.speechSynthesis.speak(u); }
      } catch (e) { /* ignore */ }
    },
    est: function (text) { return text.trim().split(/\s+/).length / 2.4 + 0.6; },
    estFit: function (text) { return text.trim().split(/\s+/).length / 2.9 + 0.2; },
    say: function (parts, o) {
      o = o || {};
      var self = this;
      var it = { parts: parts, urgent: !!o.urgent, blocking: !!o.blocking, nocap: !!o.nocap, fits: o.fits || null, onDone: o.onDone || null, cancelled: false };
      it.estTotal = parts.reduce(function (a, p) { return a + self.estFit(p.text); }, 0);
      this.q.push(it);
      TESTLOG('queue', parts.map(function (p) { return p.text; }).join(' | '));
      return it;
    },
    busy: function () { return !!this.cur || this.q.length > 0; },
    blockingPending: function () { return !!(this.cur && this.cur.blocking) || this.q.some(function (i) { return i.blocking; }); },
    clear: function () { this.q = []; this.cancelCur(); },
    pauseNow: function () {
      this.paused = true;
      var old = this.cur;
      if (old) {
        this.cancelCur();
        if (!old.urgent) { old.cancelled = false; this.q.unshift(old); }
      }
    },
    cancelCur: function () {
      if (this.cur) this.cur.cancelled = true;
      try { if ('speechSynthesis' in window) window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
      try { if (this.aud) this.aud.pause(); } catch (e) { /* ignore */ }
      if (this.partFin) this.partFin();
    },
    paused: false,
    pump: function () {
      if (this.paused) return;
      if (this.cur && !this.cur.urgent && this.q.some(function (i) { return i.urgent; })) {
        var old = this.cur;
        this.cancelCur();
        if ((old.restarts || 0) < 2) { old.restarts = (old.restarts || 0) + 1; old.cancelled = false; this.q.unshift(old); }
      }
      if (this.cur) return;
      var idx = -1, i;
      for (i = 0; i < this.q.length; i++) { if (this.q[i].urgent) { idx = i; break; } }
      if (idx < 0) {
        for (i = 0; i < this.q.length; i++) {
          var it = this.q[i];
          if (!it.fits) { idx = i; break; }
          var r = it.fits(it);
          if (r === 'drop') { TESTLOG('drop', it.parts[it.parts.length - 1].text.slice(0, 40)); this.q.splice(i, 1); i--; continue; }
          if (r === 'ok') { idx = i; break; }
        }
      }
      if (idx < 0) return;
      this.play(this.q.splice(idx, 1)[0]);
    },
    capTimer: null,
    showCap: function (it) {
      clearTimeout(this.capTimer);
      if (!G.ui || !G.ui.cap) return;
      if (it.nocap) { G.ui.cap.textContent = ''; return; }
      G.ui.cap.textContent = it.parts.map(function (p) { return p.text; }).join(' ');
    },
    hideCapSoon: function () {
      clearTimeout(this.capTimer);
      this.capTimer = setTimeout(function () { if (G.ui && G.ui.cap) G.ui.cap.textContent = ''; }, 1500);
    },
    play: function (it) {
      var self = this;
      this.cur = it;
      this.showCap(it);
      (function run(i) {
        if (it.cancelled || i >= it.parts.length) {
          self.cur = null; self.lastEnd = nowMs(); self.hideCapSoon();
          if (!it.cancelled && it.onDone) { try { it.onDone(); } catch (e) { /* ignore */ } }
          return;
        }
        self.playPart(it.parts[i], function () { run(i + 1); });
      })(0);
    },
    voice: function () {
      if (this.picked) return this.picked;
      try {
        var vs = window.speechSynthesis.getVoices() || [];
        var en = vs.filter(function (v) { return /^en[-_]US/i.test(v.lang); });
        if (!en.length) en = vs.filter(function (v) { return /^en/i.test(v.lang); });
        var pref = en.filter(function (v) { return /samantha|google us|natural|aria|jenny|zira/i.test(v.name); });
        this.picked = (pref[0] || en[0] || null);
      } catch (e) { this.picked = null; }
      return this.picked;
    },
    playPart: function (part, next) {
      var self = this, done = false, ttsStarted = false, wd;
      function fin() {
        if (done) return;
        done = true; clearTimeout(wd); self.partFin = null;
        if (self.aud) { self.aud.onended = null; self.aud.onerror = null; }
        next();
      }
      self.partFin = fin;
      wd = setTimeout(fin, (self.est(part.text) * 1.8 + 4) * 1000);
      TESTLOG('say', part.text);
      function useTts() {
        if (ttsStarted || done) return;
        ttsStarted = true;
        if (!('speechSynthesis' in window)) { setTimeout(fin, 300); return; }
        try {
          var u = new SpeechSynthesisUtterance(part.text);
          u.lang = 'en-US';
          var v = self.voice(); if (v) u.voice = v;
          u.onend = fin; u.onerror = fin;
          window.speechSynthesis.speak(u);
        } catch (e) { setTimeout(fin, 300); }
      }
      if (part.id && !NOFILES && !self.missing[part.id] && self.aud) {
        self.aud.onended = fin;
        self.aud.onerror = function () { self.missing[part.id] = true; useTts(); };
        try {
          self.aud.src = 'Voices/' + part.id + '.m4a';
          var p = self.aud.play();
          if (p && p.catch) p.catch(function () { self.missing[part.id] = true; useTts(); });
        } catch (e) { self.missing[part.id] = true; useTts(); }
      } else { useTts(); }
    }
  };

  /* ---------- screen wake lock ---------- */
  var wl = null;
  function lockScreen() {
    try {
      if ('wakeLock' in navigator) {
        navigator.wakeLock.request('screen').then(function (l) { wl = l; l.addEventListener('release', function () { wl = null; }); }).catch(function () {});
      }
    } catch (e) { /* ignore */ }
  }
  function unlockScreen() { try { if (wl) wl.release(); } catch (e) { /* ignore */ } wl = null; }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible' && G.running && !wl) lockScreen(); });

  /* ---------- session state ---------- */
  var G = { paused: false, running: false, plan: [], i: -1, step: null, mode: 'day', ui: null, lastMot: 0, motOrder: [], motPos: 0 };

  function strList() {
    var keys = curDay().shortKeys;
    return (S.short && keys) ? C.stretches.filter(function (s) { return keys.indexOf(s.key) >= 0; }) : C.stretches;
  }

  function buildDay() {
    var p = [{ t: 'warmup' }];
    var ts = totalSets(), s, n, r;
    for (s = 1; s <= ts; s++) {
      for (n = 1; n <= curMoves().length; n++) { p.push({ t: 'ready', what: 'move', n: n, set: s }); p.push({ t: 'move', n: n, set: s }); }
      if (s < ts) p.push({ t: 'rest', set: s });
    }
    var L = strList();
    for (r = 1; r <= N.stretchRounds; r++) {
      L.forEach(function (st, k) {
        p.push({ t: 'ready', what: 'stretch', st: st, k: k, total: L.length, round: r });
        p.push({ t: 'stretch', st: st, k: k, total: L.length, round: r });
      });
    }
    p.push({ t: 'finish', msg: curDay().title.split(':')[0] + ' complete', voice: true });
    return p;
  }

  /* ---------- playing screens ---------- */
  function scaffold(sec, secName, prog) {
    appEl.textContent = '';
    var ui = {};
    ui.secname = h('span', { class: 'secname' }, secName);
    ui.prog = h('span', { class: 'prog' }, prog || '');
    ui.phase = h('div', { class: 'phase' }, '');
    ui.cards = h('div', { class: 'cards' });
    ui.mot = h('div', { class: 'mot' }, '');
    ui.cap = h('div', { class: 'cap' }, '');
    ui.pause = h('button', { class: 'btn alt', type: 'button', onclick: function () { togglePause(); } }, 'Pause');
    ui.skip = h('button', { class: 'btn', type: 'button', onclick: function () { advance(); } }, 'Skip');
    ui.plus = h('button', { class: 'btn alt', type: 'button', onclick: function () { plus10(); } }, '+10 sec');
    ui.home = h('button', { class: 'btn alt', type: 'button', onclick: function () { goHome(); } }, 'Home');
    ui.root = h('div', { id: 'play', class: sec },
      h('div', { class: 'band' }, ui.secname, ui.prog),
      ui.phase, ui.cards, ui.mot,
      h('div', { class: 'dock' }, ui.cap, h('div', { class: 'ctrls' }, ui.pause, ui.skip, ui.plus, ui.home)));
    appEl.appendChild(ui.root);
    G.ui = ui;
    return ui;
  }

  function makeCard(o) {
    var c = {};
    c.who = h('div', { class: 'who' }, o.who || '');
    c.mv = h('div', { class: 'mv' }, o.mv || '');
    c.amt = h('div', { class: 'amt' }, o.amt || '');
    c.big = h('div', { class: 'big' }, '');
    c.st = h('div', { class: 'st' }, '');
    c.barFill = h('i');
    c.bar = h('div', { class: 'bar' }, c.barFill);
    c.btns = h('div', { class: 'btns' });
    c.strip = h('div', { class: o.rep ? 'strip' : 'strip none' }, '');
    c.doneBtn = null;
    if (o.done) { c.doneBtn = h('button', { class: 'btn small', type: 'button', onclick: o.done }, 'Done'); c.btns.appendChild(c.doneBtn); }
    c.easierBox = null;
    if (o.easier) {
      var box = h('div', { class: 'easier', hidden: true }, h('p', {}, 'Easier version: ' + o.easier.text));
      if (o.easier.how) box.appendChild(h('p', {}, (o.easier.howName ? o.easier.howName + ': ' : '') + o.easier.how));
      c.easierBox = box;
      c.btns.appendChild(h('button', { class: 'btn alt small', type: 'button', onclick: function () { box.hidden = !box.hidden; } }, 'Easier version'));
    }
    c.root = h('div', { class: 'card' }, c.who, c.mv, c.amt, c.big, c.st, c.bar, c.btns, c.strip, c.easierBox);
    G.ui.cards.appendChild(c.root);
    return c;
  }

  function easierOf(m, pid) {
    var x = m[pid];
    return x.easier ? { text: x.easier, how: x.easierHow, howName: x.easierHowName } : null;
  }

  function bridgeStepper(card) {
    var val = h('b', {}, S.bridge + ' sec');
    function set(v) {
      S.bridge = Math.max(N.bridgeHoldMin, Math.min(N.bridgeHoldMax, v));
      store.set('her_bridge', S.bridge); val.textContent = S.bridge + ' sec';
    }
    card.root.insertBefore(h('div', { class: 'stepper' }, h('span', {}, 'Top hold:'),
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Shorter hold', onclick: function () { set(S.bridge - 1); } }, '−'),
      val,
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Longer hold', onclick: function () { set(S.bridge + 1); } }, '+')), card.btns);
  }

  function lowerStepper(card) {
    var val = h('b', {}, S.lower + ' sec');
    function set(v) {
      S.lower = Math.max(N.pushupDownDefault, Math.min(N.pushupDownMax, v));
      store.set('his_lower', S.lower); val.textContent = S.lower + ' sec';
    }
    card.root.insertBefore(h('div', { class: 'stepper' }, h('span', {}, 'Lowering:'),
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Shorter lowering', onclick: function () { set(S.lower - 1); } }, '\u2212'),
      val,
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Longer lowering', onclick: function () { set(S.lower + 1); } }, '+')), card.btns);
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- tracks (one per person per move) ---------- */
  function mkTrack(pid, m) {
    var c = m[pid].cfg, ph = [];
    function rep(label) {
      var up = N.bridgeUp, down = c.lower ? S.lower : N.bridgeDown, seq, repSec;
      if (c.bridge) { repSec = up + S.bridge + down; seq = [['UP', up], ['HOLD', S.bridge], ['DOWN', down]]; }
      else if (c.yt) { repSec = c.repSec; var hd = c.repSec - up - down; seq = [['UP', up]]; if (hd > 0) seq.push(['HOLD', hd]); seq.push(['DOWN', down]); }
      else if (c.pauseSec) { repSec = down + c.pauseSec + up; seq = [['DOWN', down], ['PAUSE', c.pauseSec], ['UP', up]]; }
      else { repSec = down + up; seq = [['DOWN', down], ['UP', up]]; }
      return { k: 'reps', n: c.top, repSec: repSec, dur: c.top * repSec, label: label, done: !!c.done, bridge: !!c.bridge, hold: S.bridge, seq: seq };
    }
    if (c.kind === 'hold') ph.push({ k: 'hold', dur: c.sec, beep: true, label: 'Hold' });
    else if (c.kind === 'timed') ph.push({ k: 'hold', dur: c.sec, beep: true, label: 'Timed set' });
    else if (c.perSide) ph.push(rep('Side 1'), { k: 'pause', dur: N.pause, beep: true, label: 'Switch sides', cue: 'switch-sides' }, rep('Side 2'));
    else if (c.yt) ph.push(rep('Y'), { k: 'pause', dur: N.pause, beep: true, label: 'Now T', cue: 'now-t', named: true }, rep('T'));
    else ph.push(rep(''));
    return { pid: pid, ph: ph, pi: 0, el: 0, fin: false, repIdx: -1, upSaid: false, downSaid: false };
  }
  function mkStretchTrack(st) {
    var ph = [];
    if (st.kind === 'once') ph.push({ k: 'hold', dur: N.hold, beep: true, label: 'Hold' });
    else if (st.kind === 'rounds') ph.push({ k: 'reps', n: N.catCowRounds, repSec: N.catCowRepSec, dur: N.catCowRounds * N.catCowRepSec, label: 'Slow rounds', done: true, bridge: false });
    else ph.push({ k: 'hold', dur: N.hold, beep: true, label: 'Side 1' }, { k: 'pause', dur: N.pause, beep: true, label: 'Switch sides', cue: 'switch-sides' }, { k: 'hold', dur: N.hold, beep: true, label: 'Side 2' });
    return { pid: null, ph: ph, pi: 0, el: 0, fin: false, repIdx: -1, upSaid: false, downSaid: false };
  }

  function announcePause(s, t, p) {
    var parts = [];
    if (p.named && s.activeCount > 1) parts.push({ text: sayName(t.pid) + '.' });
    parts.push({ id: p.cue, text: p.cue === 'now-t' ? 'Now T: arms out to the sides.' : 'Switch sides.' });
    Voice.say(parts, { urgent: true });
  }
  function nextPhase(s, t) {
    t.pi++; t.el = 0; t.repIdx = -1; t.upSaid = false; t.downSaid = false;
    if (t.pi >= t.ph.length) { t.fin = true; return; }
    var p = t.ph[t.pi];
    if (p.k === 'pause') announcePause(s, t, p);
  }
  function trackDone(s, t) {
    if (t.fin) return;
    var p = t.ph[t.pi];
    if (p.k === 'reps' && p.done) nextPhase(s, t);
  }
  function trackTick(s, t, dt) {
    if (t.fin) return;
    var p = t.ph[t.pi], before = t.el;
    t.el += dt;
    if (p.k === 'reps') {
      var ri = Math.min(Math.floor(t.el / p.repSec), p.n - 1);
      if (ri > t.repIdx) { t.repIdx = ri; t.upSaid = false; t.downSaid = false; if (!p.bridge) Snd.tick(); }
      if (p.bridge) {
        var inRep = t.el - ri * p.repSec;
        if (!t.upSaid) { t.upSaid = true; Voice.say([{ id: 'up', text: 'Up.' }], { urgent: true, nocap: true }); }
        if (!t.downSaid && inRep >= N.bridgeUp + p.hold) { t.downSaid = true; Voice.say([{ id: 'down', text: 'Down.' }], { urgent: true, nocap: true }); }
      }
      if (t.el >= p.dur) nextPhase(s, t);
    } else {
      if (p.beep) beepCross(p.dur - before, p.dur - t.el);
      if (t.el >= p.dur) nextPhase(s, t);
    }
  }
  function clearStrip(c) { c.strip.textContent = ''; c.strip.className = c.strip.className.indexOf('none') >= 0 ? 'strip none' : 'strip'; }
  function renderTrack(s, t, c, inactive) {
    if (inactive) { clearStrip(c); c.big.textContent = 'Done'; c.st.textContent = 'Done — rest'; c.barFill.style.width = '100%'; return; }
    if (t.fin) {
      clearStrip(c); c.big.textContent = 'Hold'; c.st.textContent = 'Finished — wait for the others'; c.barFill.style.width = '100%';
      if (c.doneBtn) c.doneBtn.disabled = true;
      return;
    }
    var p = t.ph[t.pi], frac;
    if (p.k === 'reps') {
      var ri = Math.max(0, Math.min(Math.floor(t.el / p.repSec), p.n - 1));
      var repTxt = 'Rep ' + (ri + 1) + ' of ' + p.n;
      var lab = p.label ? p.label + ' · ' : '';
      var inRep = t.el - ri * p.repSec;
      if (p.seq) {
        var acc = 0, word = p.seq[p.seq.length - 1][0], left = 1, q;
        for (q = 0; q < p.seq.length; q++) {
          if (inRep < acc + p.seq[q][1]) { word = p.seq[q][0]; left = acc + p.seq[q][1] - inRep; break; }
          acc += p.seq[q][1];
        }
        c.strip.textContent = word + ' ' + Math.max(1, Math.ceil(left - 0.001));
        c.strip.className = 'strip ' + word.toLowerCase();
      } else { clearStrip(c); }
      c.big.textContent = (ri + 1) + ' / ' + p.n;
      c.st.textContent = lab + repTxt;
      frac = (t.el - ri * p.repSec) / p.repSec;
    } else {
      clearStrip(c);
      c.big.textContent = String(Math.max(0, Math.ceil(p.dur - t.el)));
      c.st.textContent = p.label; frac = t.el / p.dur;
    }
    c.barFill.style.width = Math.max(0, Math.min(1, frac)) * 100 + '%';
  }

  /* how much quiet time is left for a spoken cue (never in the last 3 seconds of a hold or the segment) */
  function windowLeft(s) {
    var end = 0, hold = Infinity;
    s.tracks.forEach(function (t) {
      if (t.fin) return;
      var rem = 0, i;
      for (i = t.pi; i < t.ph.length; i++) rem += t.ph[i].dur - (i === t.pi ? t.el : 0);
      end = Math.max(end, rem);
      var p = t.ph[t.pi];
      if (p.beep) hold = Math.min(hold, Math.max(0, (p.dur - t.el) - 3.2));
    });
    var urg = Infinity;
    s.tracks.forEach(function (t) { urg = Math.min(urg, urgentIn(t)); });
    return { end: end - 3.5, hold: hold, urgent: urg };
  }
  /* seconds until this track next needs a spoken cue (Up, Down, Switch sides) */
  function urgentIn(t) {
    if (t.fin) return Infinity;
    var p = t.ph[t.pi], rem = p.dur - t.el, best = Infinity;
    var nextIsPause = !!(t.ph[t.pi + 1] && t.ph[t.pi + 1].k === 'pause');
    if (p.k === 'reps') {
      if (p.bridge) {
        var ri = Math.min(Math.floor(t.el / p.repSec), p.n - 1), inRep = t.el - ri * p.repSec, downAt = N.bridgeUp + p.hold;
        if (!t.downSaid && inRep < downAt) best = Math.min(best, downAt - inRep);
        if (ri < p.n - 1) best = Math.min(best, p.repSec - inRep);
      }
      if (nextIsPause) best = Math.min(best, rem);
    } else if (p.k === 'hold') { if (nextIsPause) best = Math.min(best, rem); }
    return best;
  }
  function fitCheck(s, it) {
    var w = windowLeft(s), need = it.estTotal + 0.3;
    if (need <= w.hold && need <= w.end && need <= w.urgent - 0.2) return 'ok';
    if (need <= w.end) return 'wait';
    return 'drop';
  }

  /* group cues for the people doing them: identical wording is spoken once for both */
  function cueGroups(pids, getCue, types) {
    var list = [];
    pids.forEach(function (pid) {
      types.forEach(function (typ) {
        var c = getCue(pid, typ);
        var ex = null;
        list.forEach(function (x) { if (!ex && x.cue.id === c.id) ex = x; });
        if (ex) ex.pids.push(pid); else list.push({ pids: [pid], cue: c });
      });
    });
    return list;
  }
  function queueCueGroups(pids, getCue, types, opts) {
    cueGroups(pids, getCue, types).forEach(function (x) {
      var parts = [];
      if (pids.length > 1) parts.push({ text: joinNames(x.pids, sayName) + '.' });
      parts.push({ id: x.cue.id, text: x.cue.text });
      Voice.say(parts, opts);
    });
  }

  /* ---------- motivational lines ---------- */
  function nextMot() {
    if (G.motPos >= G.motOrder.length) {
      G.motOrder = C.motivation.map(function (_, i) { return i; });
      for (var i = G.motOrder.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var tmp = G.motOrder[i]; G.motOrder[i] = G.motOrder[j]; G.motOrder[j] = tmp; }
      G.motPos = 0;
    }
    return C.motivation[G.motOrder[G.motPos++]];
  }
  function maybeMotivate(s, windowEnd) {
    var n = nowMs();
    if (Voice.busy() || n - Voice.lastEnd < 4000 || n - G.lastMot < 25000 || s.age < 5) return;
    var m = nextMot();
    if (Voice.est(m.text) + 1 > windowEnd) { G.motPos--; return; }
    G.lastMot = n;
    Voice.say([{ id: m.id, text: m.text }], { nocap: true });
    G.ui.mot.textContent = m.text + (m.ref ? ' — ' + m.ref : '');
    s.motUntil = s.age + 7;
  }
  function clearMot(s) { if (s.motUntil && s.age > s.motUntil) { G.ui.mot.textContent = ''; s.motUntil = 0; } }

  /* ---------- step: warm-up ---------- */
  var stepEnter = {}, stepTick = {};

  stepEnter.warmup = function (s) {
    var ui = scaffold('warm', 'Warm-up', C.warmup.label);
    s.age = 0; s.pi = 0; s.pel = 0;
    s.parts = [
      { part: 1, name: 'WALK IN PLACE', sec: N.warmWalk },
      { gap: true, next: 'Arm circles', cue: { id: 'warmup-arms', text: 'Arm circles.' }, sec: N.warmSwitch },
      { part: 2, name: 'ARM CIRCLES', sec: N.warmArms },
      { gap: true, next: 'Leg swings', cue: { id: 'warmup-legs', text: 'Leg swings.' }, sec: N.warmSwitch },
      { part: 3, name: 'LEG SWINGS \u00b7 LEG 1', sec: N.warmLeg },
      { gap: true, next: 'Leg 2', cue: { id: 'switch-legs', text: 'Switch legs.' }, sec: N.warmLegSwitch },
      { part: 4, name: 'LEG SWINGS \u00b7 LEG 2', sec: N.warmLeg }
    ];
    var who = namedList().map(shownName).join(' & ');
    s.card = makeCard({ who: who, mv: C.warmup.label, amt: C.warmup.spoken, rep: true });
    ui.phase.textContent = 'Listen';
    s.listenWait = 0;
    if (G.mode === 'day') Voice.say([{ id: 'safety', text: C.safety[1] }], { blocking: true });
    Voice.say([{ id: 'section-warmup', text: 'Warm-up.' }], { blocking: true });
    Voice.say([{ id: 'warmup-how', text: C.warmup.spoken }], { blocking: true });
  };
  stepTick.warmup = function (s, dt) {
    s.age += dt;
    if (s.listenWait !== null && s.listenWait !== undefined) {
      if (Voice.blockingPending() && s.listenWait < 120) {
        s.listenWait += dt;
        G.ui.phase.textContent = 'Listen';
        s.card.big.textContent = 'LISTEN'; s.card.barFill.style.width = '0%';
        s.card.strip.textContent = 'LISTEN'; s.card.strip.className = 'strip wswitch';
        s.card.st.textContent = 'Listen to the instructions';
        return;
      }
      s.listenWait = null; G.ui.phase.textContent = 'Warm-up';
    }
    var p = s.parts[s.pi], before = p.sec - s.pel;
    s.pel += dt;
    beepCross(before, p.sec - s.pel);
    var card = s.card;
    card.big.textContent = fmtClock(p.sec - s.pel);
    card.barFill.style.width = Math.min(1, s.pel / p.sec) * 100 + '%';
    if (p.gap) { card.strip.textContent = 'SWITCH'; card.strip.className = 'strip wswitch'; card.st.textContent = 'Next: ' + p.next; }
    else { card.strip.textContent = p.name; card.strip.className = 'strip wpart'; card.st.textContent = 'Part ' + p.part + ' of 4'; }
    if (s.pel >= p.sec) {
      s.pi++; s.pel = 0;
      if (s.pi >= s.parts.length) { advance(); return; }
      var q = s.parts[s.pi];
      if (q.gap) Voice.say([q.cue], { urgent: true });
    }
  };

  /* ---------- step: get ready ---------- */
  stepEnter.ready = function (s) {
    var ui, isMove = s.what === 'move', ts = totalSets();
    s.dur = N.ready; s.el = 0; s.age = 0; s.listenWait = 0; s.listen = false; s.cardsList = [];
    if (isMove) {
      var m = curMoves()[s.n - 1];
      ui = scaffold('work', 'Workout', 'Move ' + s.n + ' of ' + curMoves().length + ' · Set ' + s.set + ' of ' + (s.single ? 1 : ts));
      var act = activeIn(s.set, m);
      namedList().forEach(function (pid) {
        var on = act.indexOf(pid) >= 0;
        var card = makeCard({ who: shownName(pid), mv: m[pid] ? m[pid].name : '', amt: m[pid] ? m[pid].amount : '', easier: on ? easierOf(m, pid) : null, rep: on && m[pid].cfg.kind === 'reps' });
        if (!on) card.root.className += ' dim';
        if (on && m[pid].cfg.bridge) bridgeStepper(card);
        if (on && m[pid].cfg.lower) lowerStepper(card);
        s.cardsList.push({ card: card, on: on });
      });
      s.listen = (s.set === 1);
      // voice
      if (!s.single && s.n === 1 && s.set === 1) Voice.say([{ id: 'section-workout', text: 'Workout.' }], { blocking: s.listen });
      if (!s.single && s.n === 1 && s.set === 2) Voice.say([{ id: 'set-2', text: 'Set two.' }], { blocking: s.listen });
      if (!s.single && s.n === 1 && s.set === 3) Voice.say([{ id: 'set-3', text: 'Set three.' }], { blocking: s.listen });
      Voice.say([{ id: 'move-' + s.n, text: 'Move ' + s.n }], { blocking: s.listen });
      if (s.set === 1) queueCueGroups(act, function (pid, typ) { return m[pid].cues[typ]; }, ['how'], { blocking: true });
    } else {
      ui = scaffold('cool', 'Cool-down', 'Stretch ' + (s.k + 1) + ' of ' + s.total + ' · Round ' + s.round + ' of ' + N.stretchRounds);
      s.listen = (s.round === 1);
      var who = namedList().map(shownName).join(' & ');
      var c2 = makeCard({ who: who, mv: s.st.name, amt: s.st.targets });
      s.cardsList.push({ card: c2, on: true });
      if (!s.single && s.k === 0 && s.round === 1) Voice.say([{ id: 'section-cooldown', text: 'Cool-down.' }], { blocking: s.listen });
      if (!s.single && s.k === 0 && s.round === 2) Voice.say([{ id: 'round-2', text: 'Round two.' }], { blocking: s.listen });
      if (s.round === 1) Voice.say([{ id: s.st.cues.how.id, text: s.st.cues.how.text }], { blocking: true });
    }
    ui.phase.textContent = s.listen ? 'Listen' : 'Get ready';
  };
  stepTick.ready = function (s, dt) {
    s.age += dt;
    var shown;
    if (s.listen && Voice.blockingPending() && s.listenWait < 120) {
      s.listenWait += dt;
      G.ui.phase.textContent = 'Listen';
      s.cardsList.forEach(function (x) {
        x.card.big.textContent = x.on ? 'LISTEN' : 'Done';
        x.card.st.textContent = x.on ? 'Listen to how to do it' : 'Done \u2014 rest';
        x.card.barFill.style.width = '0%';
      });
      return;
    }
    var before = s.dur - s.el;
    s.el += dt;
    beepCross(before, s.dur - s.el);
    shown = String(Math.max(0, Math.ceil(s.dur - s.el)));
    G.ui.phase.textContent = 'Get ready';
    s.cardsList.forEach(function (x) {
      x.card.big.textContent = x.on ? shown : 'Done';
      x.card.st.textContent = x.on ? 'Get into position' : 'Done \u2014 rest';
      x.card.barFill.style.width = Math.min(1, s.el / s.dur) * 100 + '%';
    });
    if (s.el >= s.dur) advance();
  };

  /* ---------- step: a move ---------- */
  stepEnter.move = function (s) {
    var m = curMoves()[s.n - 1], ts = totalSets();
    var ui = scaffold('work', 'Workout', 'Move ' + s.n + ' of ' + curMoves().length + ' · Set ' + s.set + ' of ' + (s.single ? 1 : ts));
    var act = activeIn(s.set, m);
    s.age = 0; s.frozen = 0; s.tracks = []; s.cardsList = []; s.activeCount = act.length;
    namedList().forEach(function (pid) {
      var on = act.indexOf(pid) >= 0, t = null, card;
      if (on) {
        t = mkTrack(pid, m);
        var c = m[pid].cfg;
        card = makeCard({
          who: shownName(pid), mv: m[pid].name, amt: m[pid].amount, easier: easierOf(m, pid), rep: m[pid].cfg.kind === 'reps',
          done: c.done ? function () { trackDone(s, t); } : null
        });
        s.tracks.push(t);
      } else {
        card = makeCard({ who: shownName(pid), mv: m[pid] ? m[pid].name : '', amt: m[pid] ? m[pid].amount : '' });
        card.root.className += ' dim';
      }
      s.cardsList.push({ card: card, t: t, on: on });
    });
    ui.phase.textContent = 'Go';
    queueCueGroups(act, function (pid, typ) { return m[pid].cues[typ]; }, ['feel', 'fix'], { fits: function (it) { return fitCheck(s, it); } });
  };
  stepTick.move = function (s, dt) {
    s.age += dt;
    clearMot(s);
    if (s.frozen > 0) { s.frozen -= dt; G.ui.phase.textContent = 'Paused — ' + Math.ceil(s.frozen); }
    else {
      G.ui.phase.textContent = 'Go';
      s.tracks.forEach(function (t) { trackTick(s, t, dt); });
    }
    s.cardsList.forEach(function (x) { renderTrack(s, x.t, x.card, !x.on); });
    if (s.tracks.every(function (t) { return t.fin; })) { advance(); return; }
    var w = windowLeft(s);
    maybeMotivate(s, Math.min(w.end, w.hold, w.urgent - 0.3));
  };

  /* ---------- step: rest ---------- */
  stepEnter.rest = function (s) {
    var ui = scaffold('work', 'Workout', 'Rest · after set ' + s.set + ' of ' + totalSets());
    s.dur = N.rest; s.el = 0; s.age = 0;
    s.card = makeCard({ who: namedList().map(shownName).join(' & '), mv: 'Rest', amt: 'Next: set ' + (s.set + 1) });
    ui.phase.textContent = 'Rest';
    Voice.say([{ id: 'rest', text: 'Rest.' }], { nocap: true });
  };
  stepTick.rest = function (s, dt) {
    s.age += dt; clearMot(s);
    var before = s.dur - s.el;
    s.el += dt;
    beepCross(before, s.dur - s.el);
    s.card.big.textContent = String(Math.max(0, Math.ceil(s.dur - s.el)));
    s.card.barFill.style.width = Math.min(1, s.el / s.dur) * 100 + '%';
    G.ui.plus.disabled = s.dur + N.plus > N.restMax;
    if (s.el >= s.dur) { advance(); return; }
    maybeMotivate(s, s.dur - s.el - 3.5);
  };

  /* ---------- step: a stretch ---------- */
  stepEnter.stretch = function (s) {
    var ui = scaffold('cool', 'Cool-down', 'Stretch ' + (s.k + 1) + ' of ' + s.total + ' · Round ' + s.round + ' of ' + N.stretchRounds);
    var t = mkStretchTrack(s.st);
    s.age = 0; s.frozen = 0; s.tracks = [t]; s.activeCount = namedList().length;
    var who = namedList().map(shownName).join(' & ');
    var card = makeCard({ who: who, mv: s.st.name, amt: s.st.targets, done: s.st.kind === 'rounds' ? function () { trackDone(s, t); } : null });
    s.cardsList = [{ card: card, t: t, on: true }];
    ui.phase.textContent = 'Go';
    [s.st.cues.feel, s.st.cues.fix].forEach(function (c) {
      Voice.say([{ id: c.id, text: c.text }], { fits: function (it) { return fitCheck(s, it); } });
    });
  };
  stepTick.stretch = stepTick.move;

  /* ---------- step: finish ---------- */
  stepEnter.finish = function (s) {
    appEl.textContent = '';
    G.ui = null;
    unlockScreen();
    G.running = false;
    appEl.appendChild(h('div', { class: 'screen finish' },
      h('h1', {}, s.msg || 'Done'),
      h('button', { class: 'btn start', type: 'button', onclick: function () { goHome(); } }, 'Home')));
    if (s.voice) Voice.say([{ id: DONE_CUE[S.day], text: curDay().title.split(':')[0] + ' complete.' }], { nocap: true });
  };
  stepTick.finish = function () {};

  /* ---------- engine ---------- */
  function enter(step) {
    G.step = step;
    TESTLOG('step', step.t + (step.n ? ' m' + step.n : '') + (step.set ? ' s' + step.set : '') + (step.st ? ' ' + step.st.key : '') + (step.round ? ' r' + step.round : ''));
    stepEnter[step.t](step);
  }
  function setPaused(on) {
    G.paused = on; Voice.paused = on;
    var ui = G.ui;
    if (!ui) return;
    ui.pause.textContent = on ? 'Resume' : 'Pause';
    ui.pause.className = on ? 'btn' : 'btn alt';
    ui.root.className = ui.root.className.replace(/ ?\bpaused\b/, '') + (on ? ' paused' : '');
    ui.plus.disabled = on;
    Array.prototype.forEach.call(ui.root.querySelectorAll('.card button'), function (b) { b.disabled = on; });
    if (on) ui.phase.textContent = 'Paused';
    TESTLOG(on ? 'pause' : 'resume');
  }
  function togglePause() {
    if (!G.running || !G.step || G.step.t === 'finish') return;
    if (G.paused) { setPaused(false); } else { Voice.pauseNow(); setPaused(true); }
  }
  function advance() {
    if (!G.running || !G.step) return;
    G.paused = false; Voice.paused = false;
    var prev = G.step;
    Voice.clear();
    if (prev.t === 'warmup') Voice.say([{ id: 'warmup-done', text: 'Warm-up done.' }]);
    G.i++;
    if (G.i >= G.plan.length) { goHome(); return; }
    enter(G.plan[G.i]);
  }
  function plus10() {
    var s = G.step;
    if (!s) return;
    if (s.t === 'ready') s.dur += N.plus;
    else if (s.t === 'warmup') s.parts[s.pi].sec += N.plus;
    else if (s.t === 'rest') { if (s.dur + N.plus <= N.restMax) s.dur += N.plus; }
    else if (s.frozen !== undefined) s.frozen += N.plus;
    TESTLOG('plus10');
  }
  function startPlan(plan, mode) {
    if (!namedList().length) { showMsg('Type a name to begin.'); return; }
    Snd.unlock(); Voice.unlock(); lockScreen();
    Voice.clear();
    G.plan = plan; G.mode = mode; G.i = 0; G.running = true; G.lastMot = nowMs();
    enter(G.plan[0]);
  }
  function startDay() { startPlan(buildDay(), 'day'); }
  function startSingle(kind, a) {
    var p;
    if (kind === 'warmup') p = [{ t: 'warmup' }, { t: 'finish', msg: 'Done' }];
    else if (kind === 'move') p = [{ t: 'ready', what: 'move', n: a, set: 1, single: true }, { t: 'move', n: a, set: 1, single: true }, { t: 'finish', msg: 'Done' }];
    else {
      var k = C.stretches.indexOf(a);
      p = [{ t: 'ready', what: 'stretch', st: a, k: k, total: C.stretches.length, round: 1, single: true }, { t: 'stretch', st: a, k: k, total: C.stretches.length, round: 1, single: true }, { t: 'finish', msg: 'Done' }];
    }
    startPlan(p, 'single');
  }
  function goHome() {
    G.paused = false; Voice.paused = false;
    G.running = false; G.step = null; G.ui = null;
    Voice.clear(); unlockScreen();
    renderHome();
  }
  var lastT = nowMs();
  setInterval(function () {
    var n = nowMs(), dt = Math.min(0.5, (n - lastT) / 1000);
    lastT = n;
    Voice.pump();
    if (G.paused) return;
    if (G.running && G.step && stepTick[G.step.t]) stepTick[G.step.t](G.step, dt);
  }, 100);

  /* ---------- first-open safety screen ---------- */
  function renderSafety() {
    appEl.textContent = '';
    appEl.appendChild(h('div', { class: 'screen safety' },
      h('h1', {}, 'Before You Start'),
      h('ol', {}, C.safety.map(function (r) { return h('li', {}, r); })),
      h('button', { class: 'btn start', type: 'button', onclick: function () { store.set('safety_ok', true); renderHome(); } },
        store.get('safety_ok', false) ? 'Back' : "I've read this")));
  }

  /* ---------- home ---------- */
  var msgEl = null;
  function showMsg(t) { if (msgEl) { msgEl.textContent = t; msgEl.hidden = !t; } }

  function slotBox(pid) {
    var nameIn = h('input', { type: 'text', id: pid + '-name', value: S[pid].name, autocomplete: 'off', placeholder: 'Name', 'aria-label': 'Name for ' + slotLabel(pid) });
    var sayIn = h('input', { type: 'text', id: pid + '-say', value: S[pid].say, autocomplete: 'off', placeholder: 'Say it as (optional)', 'aria-label': 'Say it as, for ' + slotLabel(pid) });
    nameIn.oninput = function () { S[pid].name = nameIn.value; store.set(pid + '_name', nameIn.value); showMsg(''); renderRows(); };
    sayIn.oninput = function () { S[pid].say = sayIn.value; store.set(pid + '_say', sayIn.value); };
    var box = h('div', { class: 'slot' }, h('h2', {}, slotLabel(pid)),
      h('label', { for: pid + '-name' }, 'Name'), nameIn,
      h('label', { for: pid + '-say' }, 'Say it as'), sayIn);
    function segSets(values, get, put) {
      var wrap = h('div', { class: 'seg' }), btns = [];
      values.forEach(function (v) {
        var b = h('button', { class: 'btn small', type: 'button', 'aria-pressed': get() === v ? 'true' : 'false' }, v + (v === 1 ? ' set' : ' sets'));
        b.onclick = function () { put(v); btns.forEach(function (x) { x.b.setAttribute('aria-pressed', get() === x.v ? 'true' : 'false'); }); };
        btns.push({ b: b, v: v }); wrap.appendChild(b);
      });
      return wrap;
    }
    if (pid === 'his') {
      box.appendChild(h('label', {}, 'Sets (weeks 1\u20132: 2. Weeks 3\u20134: 3)'));
      box.appendChild(segSets([2, 3], function () { return S.setsHis; }, function (v) { S.setsHis = v; store.set('his_sets', v); }));
      var lval = h('b', {}, S.lower + ' sec');
      function setLower(v) { S.lower = Math.max(N.pushupDownDefault, Math.min(N.pushupDownMax, v)); store.set('his_lower', S.lower); lval.textContent = S.lower + ' sec'; }
      box.appendChild(h('label', {}, 'Slow Floor Pushups: lowering'));
      box.appendChild(h('div', { class: 'stepper' },
        h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Shorter lowering', onclick: function () { setLower(S.lower - 1); } }, '\u2212'), lval,
        h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Longer lowering', onclick: function () { setLower(S.lower + 1); } }, '+')));
    }
    if (pid === 'her') {
      box.appendChild(h('label', {}, 'Sets (weeks 1\u20132: 2, or 1 if 2 is too hard. Weeks 3\u20134: 3)'));
      box.appendChild(segSets([1, 2, 3], function () { return S.setsHer; }, function (v) { S.setsHer = v; store.set('her_sets', v); }));
      var val = h('b', {}, S.bridge + ' sec');
      function setHold(v) { S.bridge = Math.max(N.bridgeHoldMin, Math.min(N.bridgeHoldMax, v)); store.set('her_bridge', S.bridge); val.textContent = S.bridge + ' sec'; }
      box.appendChild(h('label', {}, 'Glute Bridge top hold'));
      box.appendChild(h('div', { class: 'stepper' },
        h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Shorter hold', onclick: function () { setHold(S.bridge - 1); } }, '−'), val,
        h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Longer hold', onclick: function () { setHold(S.bridge + 1); } }, '+')));
    }
    return box;
  }

  var warmBox, workBox, coolBox;
  function rowBtn(num, lines, onclick) {
    return h('button', { class: 'row', type: 'button', onclick: onclick },
      h('span', { class: 'n' }, num), h('span', { class: 't' }, lines));
  }
  function renderRows() {
    if (!workBox) return;
    var who = namedList(), i;
    var pids = who.length ? who : ['her', 'his'];
    workBox.rows.textContent = '';
    curMoves().forEach(function (m) {
      var lines = pids.filter(function (pid) { return m[pid]; }).map(function (pid) {
        return h('span', { class: 'who' }, (who.length ? shownName(pid) : slotLabel(pid)) + ': ' + m[pid].name + ' · ' + m[pid].amount);
      });
      workBox.rows.appendChild(rowBtn(String(m.n), lines, function () { startSingle('move', m.n); }));
    });
  }
  function renderCoolRows() {
    coolBox.rows.textContent = '';
    strList().forEach(function (st, k) {
      coolBox.rows.appendChild(rowBtn(String(k + 1), st.name, function () { startSingle('stretch', st); }));
    });
  }

  function renderHome() {
    appEl.textContent = '';
    var root = h('div', { class: 'screen' });
    var picker = h('div', { class: 'days', role: 'group', 'aria-label': 'Choose a day' });
    C.days.forEach(function (d) {
      picker.appendChild(h('button', { class: 'btn day', type: 'button', 'aria-pressed': d.key === S.day ? 'true' : 'false',
        onclick: function () { S.day = d.key; store.set('day', d.key); S.short = false; renderHome(); } }, d.title));
    });
    root.appendChild(picker);
    root.appendChild(h('p', { class: 'sub' }, curDay().subtitle));
    root.appendChild(h('div', { class: 'slots' }, slotBox('her'), slotBox('his')));
    msgEl = h('p', { class: 'msg', role: 'alert', hidden: true });
    msgEl.style.fontWeight = '700'; msgEl.style.color = '#b42318';
    root.appendChild(msgEl);

    // warm-up
    var wr = h('div', { class: 'rows' });
    wr.appendChild(rowBtn('', [h('span', {}, C.warmup.sentence)], function () { startSingle('warmup'); }));
    warmBox = { rows: wr };
    root.appendChild(h('section', { class: 'sec warm' }, h('h2', {}, 'Warm-up'), wr));

    // workout
    var kr = h('div', { class: 'rows' });
    workBox = { rows: kr };
    root.appendChild(h('section', { class: 'sec work' }, h('h2', {}, 'Workout'), kr));
    renderRows();

    // cool-down
    var cr = h('div', { class: 'rows' });
    coolBox = { rows: cr };
    var tgl = h('button', { class: 'btn alt small', type: 'button', 'aria-pressed': S.short ? 'true' : 'false' }, S.short ? 'On' : 'Off');
    var note = h('p', { class: 'sub', hidden: !S.short }, curDay().shortSentence || '');
    tgl.onclick = function () {
      S.short = !S.short;
      tgl.setAttribute('aria-pressed', S.short ? 'true' : 'false'); tgl.textContent = S.short ? 'On' : 'Off';
      note.hidden = !S.short; renderCoolRows();
    };
    root.appendChild(h('section', { class: 'sec cool' }, h('h2', {}, 'Cool-down'),
      curDay().shortKeys ? [h('div', { class: 'toggle' }, h('span', {}, 'Short on time'), tgl), note] : null, cr));
    renderCoolRows();

    root.appendChild(h('button', { class: 'btn start', type: 'button', onclick: startDay }, 'Start ' + curDay().title.split(':')[0]));

    // verse
    var vtxt = h('div', {}, C.verses[S.verse].text);
    root.appendChild(h('div', { class: 'verse' }, vtxt,
      h('button', { class: 'btn alt small', type: 'button', onclick: function () {
        S.verse = (S.verse + 1) % C.verses.length; store.set('verse', S.verse); vtxt.textContent = C.verses[S.verse].text;
      } }, 'Next verse')));
    root.appendChild(h('button', { class: 'link', type: 'button', onclick: renderSafety }, 'Before You Start'));
    appEl.appendChild(root);
  }

  /* ---------- go ---------- */
  if (TEST) window.__app = { S: S, G: G, Voice: Voice, Snd: Snd, N: N, startDay: startDay, togglePause: togglePause, startSingle: startSingle, renderHome: renderHome, advance: advance, store: store, windowLeft: windowLeft };
  if (store.get('safety_ok', false)) renderHome(); else renderSafety();
})();
