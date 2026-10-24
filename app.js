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
    verse: store.get('verse', 0),
    vspeed: store.get('vspeed', 2),
    vgender: 'woman'
  };
  function planWeek(dt) {
    var P = C.plan, a = P.start.split('-'), d = dt || new Date();
    var days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
    return Math.max(1, Math.min(P.weeks, Math.floor(days / 7) + 1));
  }
  var WEEK = planWeek();
  if (store.get('plan_week', 0) !== WEEK) {
    S.setsHer = C.plan.setsHer[WEEK - 1]; S.setsHis = C.plan.setsHis[WEEK - 1];
    store.set('her_sets', S.setsHer); store.set('his_sets', S.setsHis); store.set('plan_week', WEEK);
  }
  var RATES = [0.7, 0.85, 1, 1.2, 1.4];
  var SPEEDNAMES = ['Slowest', 'Slow', 'Normal', 'Fast', 'Faster'];
  if (!(S.vspeed >= 0 && S.vspeed < RATES.length)) S.vspeed = 2;
  if (S.vgender !== 'woman' && S.vgender !== 'man') S.vgender = 'woman';
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
    rate: function () { return RATES[S.vspeed] || 1; },
    est: function (text) { return (text.trim().split(/\s+/).length / 2.4 + 0.6) / this.rate(); },
    estFit: function (text) { return (text.trim().split(/\s+/).length / 2.9 + 0.2) / this.rate(); },
    say: function (parts, o) {
      o = o || {};
      var self = this;
      var it = { parts: parts, urgent: !!o.urgent, blocking: !!o.blocking, nocap: !!o.nocap, dropIfCut: !!o.dropIfCut, fits: o.fits || null, onDone: o.onDone || null, cancelled: false };
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
        if ((old.restarts || 0) < 2 && !old.dropIfCut) { old.restarts = (old.restarts || 0) + 1; old.cancelled = false; this.q.unshift(old); }
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
    genderOk: true,
    voice: function () {
      if (this.picked && this.pickedFor === S.vgender) return this.picked;
      this.genderOk = true;
      try {
        var vs = window.speechSynthesis.getVoices() || [];
        var en = vs.filter(function (v) { return /^en[-_]US/i.test(v.lang); });
        if (!en.length) en = vs.filter(function (v) { return /^en/i.test(v.lang); });
        var fem = /female|samantha|victoria|karen|moira|tessa|fiona|zira|jenny|aria|susan|hazel|catherine|serena|allison|ava\b|nicky|kathy|heather|linda/i;
        var mal = /(^|[^e])male|daniel|alex\b|fred|david|mark\b|guy\b|george|ryan|james|oliver|aaron|arthur|christopher|eric|roger|steffan|tom\b|matthew/i;
        function nm(v) { return (v.name || '') + ' ' + (v.voiceURI || ''); }
        var pick = null;
        if (S.vgender === 'man') {
          pick = en.filter(function (v) { return !/female/i.test(nm(v)) && mal.test(nm(v)); })[0] || null;
          if (!pick) this.genderOk = false;
        } else {
          pick = en.filter(function (v) { return fem.test(nm(v)); })[0] || en.filter(function (v) { return /google us|natural/i.test(v.name); })[0] || null;
        }
        if (!pick && !this.genderOk) pick = en.filter(function (v) { return /samantha|google us|natural|aria|jenny|zira/i.test(v.name); })[0] || en[0] || null;
        if (!pick && this.genderOk) pick = en[0] || null;
        this.picked = pick; this.pickedFor = S.vgender;
        if (!vs.length) this.picked = null;
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
          u.lang = 'en-US'; u.rate = self.rate();
          var v = self.voice(); if (v) u.voice = v;
          u.onend = fin; u.onerror = fin;
          window.speechSynthesis.speak(u);
        } catch (e) { setTimeout(fin, 300); }
      }
      if (part.id && !NOFILES && !self.missing[part.id] && self.aud) {
        self.aud.onended = fin;
        self.aud.onerror = function () { self.missing[part.id] = true; useTts(); };
        try {
          self.aud.defaultPlaybackRate = self.rate(); self.aud.playbackRate = self.rate();
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
  var G = { activeSec: 0, finishSay: false, paused: false, running: false, plan: [], i: -1, step: null, mode: 'day', ui: null, lastMot: 0, motOrder: [], motPos: 0 };

  function strList() {
    var keys = curDay().shortKeys;
    return (S.short && keys) ? C.stretches.filter(function (s) { return keys.indexOf(s.key) >= 0; }) : C.stretches;
  }

  function buildDay(cardio) {
    var p = [{ t: 'warmup' }];
    var ts = totalSets(), s, n, r;
    for (s = 1; s <= ts; s++) {
      for (n = 1; n <= curMoves().length; n++) { p.push({ t: 'ready', what: 'move', n: n, set: s }); p.push({ t: 'move', n: n, set: s }); }
      if (s < ts) p.push({ t: 'rest', set: s });
    }
    if (cardio) { p.push({ t: 'ready', what: 'cardio', kind: cardio.kind, mins: cardio.mins }); p.push({ t: 'timer', kind: cardio.kind, mins: cardio.mins, inDay: true }); }
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
    ui.next = h('div', { class: 'next' }, '');
    ui.cards = h('div', { class: 'cards' });
    ui.mot = h('div', { class: 'mot' }, '');
    ui.cap = h('div', { class: 'cap' }, '');
    ui.pause = h('button', { class: 'btn alt', type: 'button', onclick: function () { togglePause(); } }, 'Pause');
    ui.repeat = h('button', { class: 'btn alt', type: 'button', onclick: function () { repeatStep(); } }, 'Repeat');
    ui.skip = h('button', { class: 'btn', type: 'button', onclick: function () { advance(); } }, 'Skip');
    ui.plus = h('button', { class: 'btn alt', type: 'button', onclick: function () { plus10(); } }, '+10 sec');
    ui.home = h('button', { class: 'btn alt', type: 'button', onclick: function () { goHome(); } }, 'Home');
    ui.root = h('div', { id: 'play', class: sec },
      h('div', { class: 'band' }, ui.secname, ui.prog),
      ui.phase, ui.next, ui.cards, ui.mot,
      h('div', { class: 'dock' }, ui.cap, h('div', { class: 'ctrls' }, ui.pause, ui.repeat, ui.skip, ui.plus, ui.home)));
    appEl.appendChild(ui.root);
    G.ui = ui;
    return ui;
  }

  function makeCard(o) {
    var c = {};
    c.who = h('div', { class: 'who' }, o.who || '');
    c.mv = h('div', { class: 'mv' }, o.mv || '');
    c.amt = h('div', { class: 'amt' }, o.amt || '');
    c.repsTxt = o.repsN ? h('div', { class: 'amt reps' }, 'Reps: ' + o.repsN + (o.repsSfx || '')) : null;
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
    c.root = h('div', { class: 'card' }, c.who, c.mv, c.amt, c.repsTxt, c.big, c.st, c.bar, c.btns, c.strip, c.easierBox);
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

  /* ---------- reps range (from the amount shown) ---------- */
  function repRange(m, pid) {
    var x = m[pid];
    if (!x || x.cfg.kind !== 'reps') return null;
    var r = /^(\d+)\s*[\u2013-]\s*(\d+)/.exec(x.amount || '');
    if (!r) return null;
    var lo = parseInt(r[1], 10), hi = parseInt(r[2], 10);
    if (!(hi > lo) || x.cfg.top !== hi) return null;
    return { min: lo, max: hi };
  }
  function repsKey(m, pid) { return 'reps_' + S.day + '_' + m.n + '_' + pid; }
  function repsFor(m, pid) {
    var rg = repRange(m, pid), top = m[pid].cfg.top;
    if (!rg) return top;
    var v = store.get(repsKey(m, pid), rg.max);
    return (v >= rg.min && v <= rg.max) ? v : rg.max;
  }
  function repsControl(m, pid, label) {
    var rg = repRange(m, pid);
    if (!rg) return null;
    var val = h('b', {}, String(repsFor(m, pid)));
    function set(v) {
      v = Math.max(rg.min, Math.min(rg.max, v));
      store.set(repsKey(m, pid), v); val.textContent = String(v);
    }
    return h('div', { class: 'stepper repsline' }, h('span', {}, label + ' reps:'),
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Fewer reps for ' + label, onclick: function () { set(repsFor(m, pid) - 1); } }, '\u2212'),
      val,
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'More reps for ' + label, onclick: function () { set(repsFor(m, pid) + 1); } }, '+'));
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- tracks (one per person per move) ---------- */
  function mkTrack(pid, m) {
    var c = m[pid].cfg, ph = [], top = repsFor(m, pid), nTot = c.alt ? top * 2 : top;
    function rep(label) {
      var up = N.bridgeUp, down = c.lower ? S.lower : N.bridgeDown, seq, repSec;
      if (c.bridge) { repSec = up + S.bridge + down; seq = [['UP', up], ['HOLD', S.bridge], ['DOWN', down]]; }
      else if (c.yt) { repSec = c.repSec; var hd = c.repSec - up - down; seq = [['UP', up]]; if (hd > 0) seq.push(['HOLD', hd]); seq.push(['DOWN', down]); }
      else if (c.pauseSec) { repSec = down + c.pauseSec + up; seq = [['DOWN', down], ['PAUSE', c.pauseSec], ['UP', up]]; }
      else { repSec = down + up; seq = [['DOWN', down], ['UP', up]]; }
      return { k: 'reps', n: nTot, repSec: repSec, dur: nTot * repSec, label: label, done: !!c.done, bridge: !!c.bridge, hold: S.bridge, seq: seq };
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
    else ph.push({ k: 'hold', dur: N.hold, beep: true, label: 'Side 1' }, { k: 'pause', dur: N.pause, beep: true, label: 'Switch sides', cue: 'switch-sides' }, { k: 'hold', dur: N.hold, beep: true, label: 'Side 2' });
    return { pid: null, ph: ph, pi: 0, el: 0, fin: false, repIdx: -1, upSaid: false, downSaid: false };
  }

  function sayUpDown(s, t, word) {
    var mode = s.udMode;
    if (!mode || mode.silent.indexOf(t) >= 0) return;
    var parts = [];
    if (mode.names && t.pid) parts.push({ text: sayName(t.pid) + '.' });
    parts.push(word === 'UP' ? { id: 'up', text: 'Up.' } : { id: 'down', text: 'Down.' });
    Voice.say(parts, { urgent: true, nocap: true });
  }
  function setUpDownMode(s) {
    var rt = s.tracks.filter(function (t) { return t.ph.some(function (p) { return p.seq; }); });
    var sig = function (t) { return JSON.stringify(t.ph.map(function (p) { return [p.k, p.seq || null, p.repSec || 0, p.dur]; })); };
    var mode = { names: false, silent: [] };
    if (rt.length > 1) {
      if (rt.every(function (t) { return sig(t) === sig(rt[0]); })) mode.silent = rt.slice(1);
      else mode.names = true;
    }
    s.udMode = mode;
  }
  function announcePause(s, t, p) {
    var parts = [];
    if (p.named && s.activeCount > 1) parts.push({ text: sayName(t.pid) + '.' });
    parts.push({ id: p.cue, text: p.cue === 'now-t' ? 'Now T: arms out to the sides.' : 'Switch sides.' });
    Voice.say(parts, { urgent: true });
  }
  function nextPhase(s, t) {
    t.pi++; t.el = 0; t.repIdx = -1; t.upSaid = false; t.downSaid = false; t.lastSeq = null;
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
      if (p.seq) {
        var inRep = t.el - ri * p.repSec, acc = 0, qi = p.seq.length - 1, q;
        for (q = 0; q < p.seq.length; q++) {
          if (inRep < acc + p.seq[q][1]) { qi = q; break; }
          acc += p.seq[q][1];
        }
        var key = ri + ':' + qi;
        if (t.lastSeq !== key) {
          t.lastSeq = key;
          var word = p.seq[qi][0];
          if (word === 'UP' || word === 'DOWN') sayUpDown(s, t, word);
        }
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
      if (p.seq) {
        var ri = Math.min(Math.floor(t.el / p.repSec), p.n - 1), inRep = t.el - ri * p.repSec, acc = 0, q, isUD = function (w) { return w === 'UP' || w === 'DOWN'; };
        for (q = 0; q < p.seq.length; q++) {
          if (acc > inRep + 0.001 && isUD(p.seq[q][0])) best = Math.min(best, acc - inRep);
          acc += p.seq[q][1];
        }
        if (ri < p.n - 1 && isUD(p.seq[0][0])) best = Math.min(best, p.repSec - inRep);
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
  function motAllowed(s) {
    if (s.t === 'rest') return true;
    if (!s.tracks) return false;
    var live = s.tracks.filter(function (t) { return !t.fin; });
    return live.length > 0 && live.every(function (t) { var p = t.ph[t.pi]; return p.k === 'hold' && p.label !== 'Timed set'; });
  }
  function maybeMotivate(s, windowEnd) {
    var n = nowMs();
    if (!motAllowed(s)) return;
    if (Voice.busy() || n - Voice.lastEnd < 4000 || n - G.lastMot < 25000 || s.age < 5) return;
    var m = nextMot();
    if (Voice.est(m.text) * 1.2 + 3 > windowEnd) { G.motPos--; return; }
    G.lastMot = n;
    Voice.say([{ id: m.id, text: m.text }], { nocap: true, dropIfCut: true });
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
    if (G.mode === 'day') {
      var gn = namedList();
      Voice.say([{ text: gn.length ? 'Hey ' + joinNames(gn, sayName) + ', are you ready?' : 'Are you ready?' }], { blocking: true });
      Voice.say([{ id: 'safety', text: C.safety[1] }], { blocking: true });
    }
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
        var card = makeCard({ who: shownName(pid), mv: m[pid] ? m[pid].name : '', amt: m[pid] ? m[pid].amount : '', easier: on ? easierOf(m, pid) : null, rep: on && m[pid].cfg.kind === 'reps', repsN: (on && repRange(m, pid)) ? repsFor(m, pid) : null, repsSfx: (on && m[pid].cfg.alt) ? ' each side' : '' });
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
      if (s.set === 1) {
        ['how', 'feel', 'fix'].forEach(function (typ) {
          queueCueGroups(act, function (pid, t2) { return m[pid].cues[t2]; }, [typ], { blocking: true });
        });
      }
    } else if (s.what === 'cardio') {
      ui = scaffold('work', 'Cardio', (s.kind === 'tread' ? 'Treadmill' : 'Circuit') + ' \u00b7 ' + s.mins + ' min');
      var cw = namedList().map(shownName).join(' & ');
      s.cardsList.push({ card: makeCard({ who: cw, mv: 'Cardio', amt: (s.kind === 'tread' ? 'Treadmill' : 'Circuit') + ' \u00b7 ' + s.mins + ' min' }), on: true });
      Voice.say([{ id: 'section-cardio', text: 'Cardio.' }], {});
    } else {
      ui = scaffold('cool', 'Cool-down', 'Stretch ' + (s.k + 1) + ' of ' + s.total + ' · Round ' + s.round + ' of ' + N.stretchRounds);
      s.listen = (s.round === 1);
      var who = namedList().map(shownName).join(' & ');
      var c2 = makeCard({ who: who, mv: s.st.name, amt: s.st.targets });
      s.cardsList.push({ card: c2, on: true });
      if (!s.single && s.k === 0 && s.round === 1) Voice.say([{ id: 'section-cooldown', text: 'Cool-down.' }], { blocking: s.listen });
      if (!s.single && s.k === 0 && s.round === 2) Voice.say([{ id: 'round-2', text: 'Round two.' }], { blocking: s.listen });
      if (s.round === 1) {
        ['how', 'feel', 'fix'].forEach(function (typ) {
          Voice.say([{ id: s.st.cues[typ].id, text: s.st.cues[typ].text }], { blocking: true });
        });
      }
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
          who: shownName(pid), mv: m[pid].name, amt: m[pid].amount, easier: easierOf(m, pid), rep: m[pid].cfg.kind === 'reps', repsN: repRange(m, pid) ? repsFor(m, pid) : null, repsSfx: m[pid].cfg.alt ? ' each side' : '',
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
    setUpDownMode(s);
    Voice.say([{ id: 'start', text: 'Start.' }], { urgent: true, nocap: true });
    if (s.set !== 1) queueCueGroups(act, function (pid, typ) { return m[pid].cues[typ]; }, ['feel', 'fix'], { fits: function (it) { return fitCheck(s, it); } });
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
    if (s.tracks.every(function (t) { return t.fin; })) { G.finishSay = true; advance(); return; }
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
    var card = makeCard({ who: who, mv: s.st.name, amt: s.st.targets });
    s.cardsList = [{ card: card, t: t, on: true }];
    ui.phase.textContent = 'Go';
    setUpDownMode(s);
    Voice.say([{ id: 'start', text: 'Start.' }], { urgent: true, nocap: true });
    if (s.round !== 1) [s.st.cues.feel, s.st.cues.fix].forEach(function (c) {
      Voice.say([{ id: c.id, text: c.text }], { fits: function (it) { return fitCheck(s, it); } });
    });
  };
  stepTick.stretch = stepTick.move;

  /* ---------- step: walk, treadmill or circuit timer ---------- */
  stepEnter.timer = function (s) {
    var T = C.cardio, title = s.kind === 'walk' ? 'Walk' : 'Cardio';
    var label = s.kind === 'walk' ? 'Walk' : (s.kind === 'tread' ? 'Treadmill' : 'Circuit');
    var ui = scaffold(s.kind === 'walk' ? 'warm' : 'work', title, label + ' \u00b7 ' + s.mins + ' min');
    ui.noPlus = true; ui.plus.disabled = true;
    s.total = s.mins * 60; s.el = 0; s.age = 0; s.lastKey = null;
    s.nb = Math.floor(s.total / (T.workSec + T.easySec));
    var who = namedList().map(shownName).join(' & ');
    s.card = makeCard({ who: who, mv: label, amt: s.mins + ' min', rep: true });
    s.easierEl = null;
    if (s.kind === 'circuit') { s.easierEl = h('div', { class: 'easier' }, ''); s.card.root.appendChild(s.easierEl); }
    ui.phase.textContent = 'Go';
    if (s.kind === 'walk') Voice.say([{ id: 'walk-start', text: 'Start walking.' }], { urgent: true });
    else if (s.kind === 'tread') Voice.say([{ id: 'start', text: 'Start.' }], { urgent: true, nocap: true });
  };
  stepTick.timer = function (s, dt) {
    s.age += dt;
    var T = C.cardio, before = s.el, card = s.card;
    s.el += dt;
    var left = s.total - s.el;
    if (s.kind !== 'circuit') {
      var half = s.total / 2;
      if (before < half && s.el >= half) Voice.say([{ id: 'halfway', text: 'Halfway.' }], { urgent: true });
      if (before < s.total - 60 && s.el >= s.total - 60) Voice.say([{ id: 'one-minute', text: 'One minute left.' }], { urgent: true });
      beepCross(s.total - before, left);
      card.big.textContent = fmtClock(left);
      card.barFill.style.width = Math.min(1, s.el / s.total) * 100 + '%';
      card.st.textContent = s.kind === 'walk' ? 'Keep walking' : 'Treadmill';
      card.strip.textContent = s.kind === 'walk' ? 'WALK' : 'TREADMILL'; card.strip.className = 'strip hold';
    } else {
      var blk = T.workSec + T.easySec;
      var bi = Math.min(Math.floor(s.el / blk), s.nb - 1), inb = s.el - bi * blk, work = inb < T.workSec;
      var mv = T.moves[bi % T.moves.length], nx = T.moves[(bi + 1) % T.moves.length];
      var key = bi + (work ? 'w' : 'e');
      if (s.lastKey !== key) {
        s.lastKey = key;
        if (work) {
          var parts = [];
          if (s.nb > 2 && bi === Math.floor(s.nb / 2)) parts.push({ id: 'halfway', text: 'Halfway.' });
          if (bi === s.nb - 1) parts.push({ id: 'one-minute', text: 'One minute left.' });
          parts.push({ id: 'cardio-' + mv.key, text: mv.name.split(' (')[0] + '.' }, { id: 'go', text: 'Go.' });
          Voice.say(parts, { urgent: true });
        } else Voice.say([{ id: 'easy', text: 'Easy.' }], { urgent: true });
      }
      var phEnd = bi * blk + (work ? T.workSec : blk), rem = phEnd - s.el;
      beepCross(rem + dt, rem);
      card.big.textContent = String(Math.max(0, Math.ceil(rem)));
      card.barFill.style.width = Math.max(0, Math.min(1, 1 - rem / (work ? T.workSec : T.easySec))) * 100 + '%';
      card.mv.textContent = work ? mv.name : 'Easy';
      card.amt.textContent = work ? 'Work \u00b7 ' + T.workSec + ' sec' : T.easyName;
      G.ui.next.textContent = 'Next: ' + (bi === s.nb - 1 ? (G.mode === 'day' ? planNextText(G.i) : 'Finished') : (work ? 'Easy' : nx.name));
      card.st.textContent = fmtClock(left) + ' left \u00b7 Minute ' + (bi + 1) + ' of ' + s.nb;
      card.strip.textContent = work ? 'WORK' : 'EASY'; card.strip.className = 'strip ' + (work ? 'up' : 'hold');
      s.easierEl.textContent = work ? 'Easier: ' + mv.easier : '';
      s.easierEl.hidden = !work;
    }
    if (s.el >= s.total) {
      G.finishSay = true;
      if (s.inDay) G.cardioDone = { k: s.kind, m: s.mins }; else recordTimer(s);
      advance();
    }
  };

  /* ---------- step: finish ---------- */
  stepEnter.finish = function (s) {
    appEl.textContent = '';
    G.ui = null;
    unlockScreen();
    if (s.voice) recordSession();
    G.running = false;
    appEl.appendChild(h('div', { class: 'screen finish' },
      h('h1', {}, s.msg || 'Done'),
      h('button', { class: 'btn start', type: 'button', onclick: function () { goHome(); } }, 'Home')));
    if (s.voice) Voice.say([{ id: DONE_CUE[S.day], text: curDay().title.split(':')[0] + ' complete.' }], { nocap: true });
  };
  stepTick.finish = function () {};

  /* ---------- engine ---------- */
  /* what comes after the step you are on (full days only) */
  function nextLabel(st) {
    if (st.t === 'finish') return 'Finished';
    if (st.t === 'rest') return 'Rest';
    if (st.what === 'cardio') return 'Cardio';
    if (st.what === 'stretch') return st.st.name;
    var m = curMoves()[st.n - 1], act = activeIn(st.set, m);
    var names = act.map(function (pid) { return m[pid].name; });
    if (names.every(function (x) { return x === names[0]; })) return names[0];
    return act.map(function (pid) { return shownName(pid) + ': ' + m[pid].name; }).join(' \u00b7 ');
  }
  function planNextText(i) {
    var cur = G.plan[i], base = cur.t === 'ready' ? i + 1 : i, j;
    for (j = base + 1; j < G.plan.length; j++) {
      var st = G.plan[j];
      if (st.t === 'ready' || st.t === 'rest' || st.t === 'finish') {
        var lab = nextLabel(st);
        if (cur.t === 'rest' && st.t === 'ready' && st.what === 'move') lab = 'Set ' + st.set + ', Move ' + st.n + ': ' + lab;
        return lab;
      }
    }
    return 'Finished';
  }
  function enter(step) {
    G.step = step;
    TESTLOG('step', step.t + (step.n ? ' m' + step.n : '') + (step.set ? ' s' + step.set : '') + (step.st ? ' ' + step.st.key : '') + (step.round ? ' r' + step.round : ''));
    stepEnter[step.t](step);
    if (G.ui && G.ui.next) G.ui.next.textContent = (G.mode === 'day' && step.t !== 'finish') ? 'Next: ' + planNextText(G.i) : '';
  }
  function setPaused(on) {
    G.paused = on; Voice.paused = on;
    var ui = G.ui;
    if (!ui) return;
    ui.pause.textContent = on ? 'Resume' : 'Pause';
    ui.pause.className = on ? 'btn' : 'btn alt';
    ui.root.className = ui.root.className.replace(/ ?\bpaused\b/, '') + (on ? ' paused' : '');
    ui.plus.disabled = on || !!ui.noPlus;
    Array.prototype.forEach.call(ui.root.querySelectorAll('.card button'), function (b) { b.disabled = on; });
    if (on) ui.phase.textContent = 'Paused';
    TESTLOG(on ? 'pause' : 'resume');
  }
  function togglePause() {
    if (!G.running || !G.step || G.step.t === 'finish') return;
    if (G.paused) { setPaused(false); } else { Voice.pauseNow(); setPaused(true); }
  }
  /* restart the step you are on (sets already finished stay counted) */
  function repeatStep() {
    if (!G.running || !G.step || G.step.t === 'finish') return;
    var s = G.step;
    G.paused = false; Voice.paused = false; G.finishSay = false;
    Voice.clear();
    TESTLOG('repeat', s.t);
    if (s.t === 'warmup') {
      var ui = G.ui;
      ui.pause.textContent = 'Pause'; ui.pause.className = 'btn alt';
      ui.root.className = ui.root.className.replace(/ ?\bpaused\b/, '');
      ui.plus.disabled = false;
      Array.prototype.forEach.call(ui.root.querySelectorAll('.card button'), function (b) { b.disabled = false; });
      if (s.listenWait !== null && s.listenWait !== undefined) { s.listenWait = null; }
      s.pel = 0; ui.phase.textContent = 'Warm-up';
      var q = s.parts[s.pi];
      if (q.gap) Voice.say([q.cue], { urgent: true });
      return;
    }
    enter(s);
  }
  function advance() {
    if (!G.running || !G.step) return;
    G.paused = false; Voice.paused = false;
    var prev = G.step;
    Voice.clear();
    if (G.finishSay && (prev.t === 'move' || prev.t === 'stretch' || prev.t === 'timer')) Voice.say([{ id: 'finished', text: 'Finished.' }], { urgent: true, nocap: true });
    G.finishSay = false;
    if (prev.t === 'warmup') Voice.say([{ id: 'warmup-done', text: 'Warm-up done.' }]);
    G.i++;
    if (G.i >= G.plan.length) { goHome(); return; }
    enter(G.plan[G.i]);
  }
  function plus10() {
    var s = G.step;
    if (!s || s.t === 'timer') return;
    if (s.t === 'ready') s.dur += N.plus;
    else if (s.t === 'warmup') s.parts[s.pi].sec += N.plus;
    else if (s.t === 'rest') { if (s.dur + N.plus <= N.restMax) s.dur += N.plus; }
    else if (s.frozen !== undefined) s.frozen += N.plus;
    TESTLOG('plus10');
  }
  function startPlan(plan, mode) {
    if (mode !== 'timer' && !namedList().length) { showMsg('Type a name to begin.'); return; }
    Snd.unlock(); Voice.unlock(); lockScreen();
    Voice.clear();
    G.plan = plan; G.mode = mode; G.i = 0; G.running = true; G.cardioDone = null; G.lastMot = nowMs(); G.activeSec = 0;
    enter(G.plan[0]);
  }
  function startDay() {
    if (!namedList().length) { showMsg('Type a name to begin.'); return; }
    timerSetup({ title: 'Cardio today?', mins: C.cardio.cardioMins, def: C.cardio.cardioDefault, key: 'cardio_min',
      go: [{ t: 'Treadmill', fn: function (m) { startPlan(buildDay({ kind: 'tread', mins: m }), 'day'); } },
           { t: 'Circuit', fn: function (m) { startPlan(buildDay({ kind: 'circuit', mins: m }), 'day'); } },
           { t: 'Skip cardio', fn: function () { startPlan(buildDay(null), 'day'); } }] });
  }
  function startTimer(kind, mins) { startPlan([{ t: 'timer', kind: kind, mins: mins }, { t: 'finish', msg: 'Done' }], 'timer'); }
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
    if (G.running) G.activeSec = (G.activeSec || 0) + dt;
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
      box.appendChild(h('p', { class: 'sub' }, 'Week ' + WEEK + ': ' + C.plan.setsHis[WEEK - 1] + ' sets suggested'));
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
      box.appendChild(h('p', { class: 'sub' }, 'Week ' + WEEK + ': ' + C.plan.setsHer[WEEK - 1] + ' sets suggested'));
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
      var ctl = pids.filter(function (pid) { return m[pid] && repRange(m, pid); }).map(function (pid) {
        return repsControl(m, pid, who.length ? shownName(pid) : (pid === 'her' ? 'Her' : 'His'));
      });
      if (ctl.length) workBox.rows.appendChild(h('div', { class: 'repsrow' }, ctl));
    });
  }
  function renderCoolRows() {
    coolBox.rows.textContent = '';
    strList().forEach(function (st, k) {
      coolBox.rows.appendChild(rowBtn(String(k + 1), st.name, function () { startSingle('stretch', st); }));
    });
  }

  function voiceBox() {
    function seg(list, get, put) {
      var btns = [];
      var row = h('div', { class: 'seg vseg' });
      list.forEach(function (o) {
        var b = h('button', { class: 'btn small', type: 'button', 'aria-pressed': get() === o.v ? 'true' : 'false' }, o.t);
        b.onclick = function () { put(o.v); btns.forEach(function (x) { x.b.setAttribute('aria-pressed', get() === x.v ? 'true' : 'false'); }); };
        btns.push({ b: b, v: o.v }); row.appendChild(b);
      });
      return row;
    }
    var speedRow = seg(SPEEDNAMES.map(function (n, i) { return { t: n, v: i }; }), function () { return S.vspeed; }, function (v) { S.vspeed = v; store.set('vspeed', v); });
    var test = h('button', { class: 'btn alt small', type: 'button', onclick: function () {
      Voice.unlock(); Voice.clear();
      Voice.picked = null; Voice.voice();
      Voice.say([{ text: 'This is how the voice sounds.' }], { urgent: true, nocap: true });
    } }, 'Test voice');
    return h('section', { class: 'sec voicebox' }, h('h2', {}, 'Voice'),
      h('label', {}, 'Speed'), speedRow, h('div', { class: 'vtest' }, test));
  }

  function timerSetup(o) {
    var saved = o.key ? store.get(o.key, null) : null;
    var pick = (o.mins.indexOf(saved) >= 0) ? saved : o.def, btns = [];
    var wrap = h('div', { class: 'seg' });
    o.mins.forEach(function (v) {
      var b = h('button', { class: 'btn small', type: 'button', 'aria-pressed': v === pick ? 'true' : 'false' }, v + ' min');
      b.onclick = function () { pick = v; btns.forEach(function (x) { x.b.setAttribute('aria-pressed', x.v === pick ? 'true' : 'false'); }); };
      btns.push({ b: b, v: v }); wrap.appendChild(b);
    });
    appEl.textContent = '';
    appEl.appendChild(h('div', { class: 'screen' },
      h('h1', {}, o.title), o.sub ? h('p', { class: 'sub' }, o.sub) : null,
      h('label', { class: 'sub' }, 'Minutes'), wrap,
      o.go.map(function (g) { return h('button', { class: 'btn start', type: 'button', onclick: function () { if (o.key) store.set(o.key, pick); if (g.fn) g.fn(pick); else startTimer(g.kind, pick); } }, g.t); }),
      h('button', { class: 'btn alt start', type: 'button', onclick: renderHome }, 'Back')));
  }
  function renderWalk() { timerSetup({ title: 'Walk', key: 'walk_min', mins: C.cardio.walkMins, def: C.cardio.walkDefault, go: [{ t: 'Start walk', kind: 'walk' }] }); }
  function renderCardio() { timerSetup({ title: 'Cardio', key: 'cardio_min', sub: 'Are we doing the treadmill?', mins: C.cardio.cardioMins, def: C.cardio.cardioDefault, go: [{ t: 'Yes, treadmill', kind: 'tread' }, { t: 'No, circuit', kind: 'circuit' }] }); }

  function renderHome() {
    appEl.textContent = '';
    var root = h('div', { class: 'screen' });
    var picker = h('div', { class: 'days', role: 'group', 'aria-label': 'Choose a day' });
    C.days.forEach(function (d) {
      picker.appendChild(h('button', { class: 'btn day', type: 'button', 'aria-pressed': d.key === S.day ? 'true' : 'false',
        onclick: function () { S.day = d.key; store.set('day', d.key); S.short = false; renderHome(); } }, d.title));
    });
    root.appendChild(picker);
    root.appendChild(h('p', { class: 'hist' }, histLine()));
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

    var wc = h('div', { class: 'rows' });
    wc.appendChild(rowBtn('', [h('span', {}, 'Walk')], renderWalk));
    wc.appendChild(rowBtn('', [h('span', {}, 'Cardio: treadmill or circuit')], renderCardio));
    root.appendChild(h('section', { class: 'sec warm' }, h('h2', {}, 'Walk and cardio'), wc));

    root.appendChild(h('button', { class: 'btn start', type: 'button', onclick: startDay }, 'Start ' + curDay().title.split(':')[0]));
    root.appendChild(voiceBox());

    // verse
    var vtxt = h('div', {}, C.verses[S.verse].text);
    root.appendChild(h('div', { class: 'verse' }, vtxt,
      h('button', { class: 'btn alt small', type: 'button', onclick: function () {
        S.verse = (S.verse + 1) % C.verses.length; store.set('verse', S.verse); vtxt.textContent = C.verses[S.verse].text;
      } }, 'Next verse')));
    root.appendChild(h('button', { class: 'link', type: 'button', onclick: renderSafety }, 'Before You Start'));
    root.appendChild(h('div', {}, h('button', { class: 'link', type: 'button', onclick: renderHistory }, 'Past sessions')));
    appEl.appendChild(root);
  }

  /* ---------- history (on this phone only, no names) ---------- */
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function histCounts() {
    var c = store.get('hist_counts', {});
    return (c && typeof c === 'object' && !Array.isArray(c)) ? c : {};
  }
  function histList() { var l = store.get('hist', []); return Array.isArray(l) ? l : []; }
  function dayLabel(iso, withYear) {
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return MON[d.getMonth()] + ' ' + d.getDate() + (withYear ? ', ' + d.getFullYear() : '');
  }
  function recordSession() {
    try {
      var now = new Date().toISOString();
      var e = { d: now, day: S.day, min: Math.max(1, Math.round((G.activeSec || 0) / 60)) };
      if (named('her')) e.her = S.setsHer;
      if (named('his')) e.his = S.setsHis;
      if (G.cardioDone) { e.c = G.cardioDone.k; e.cm = G.cardioDone.m; }
      var l = histList(); l.unshift(e); store.set('hist', l.slice(0, 30));
      var c = histCounts(), k = c[S.day] || { n: 0, last: '' };
      c[S.day] = { n: (k.n || 0) + 1, last: now };
      store.set('hist_counts', c);
    } catch (e2) { /* ignore */ }
  }
  var KIND = { walk: 'Walk', tread: 'Treadmill', circuit: 'Circuit' };
  function recordTimer(s) {
    try {
      var l = histList(); l.unshift({ d: new Date().toISOString(), t: s.kind, min: s.mins }); store.set('hist', l.slice(0, 30));
    } catch (e2) { /* ignore */ }
  }
  function histLine() {
    var k = histCounts()[S.day];
    if (!k || !k.n) return 'Not done yet';
    return 'Done ' + k.n + (k.n === 1 ? ' time' : ' times') + ' \u00b7 Last: ' + dayLabel(k.last, false);
  }
  function renderHistory() {
    appEl.textContent = '';
    var l = histList(), armed = false, tm = null;
    var rows = h('div', { class: 'rows' });
    if (!l.length) rows.appendChild(h('p', { class: 'sub' }, 'No sessions yet.'));
    l.forEach(function (e) {
      var bits = e.t ? [dayLabel(e.d, true), (KIND[e.t] || 'Cardio') + ' \u00b7 ' + e.min + ' min'] : [dayLabel(e.d, true), 'Day ' + e.day, e.min + ' min'];
      if (e.c && KIND[e.c]) bits.push(KIND[e.c] + ' ' + e.cm + ' min');
      if (e.her) bits.push('Her ' + e.her + (e.her === 1 ? ' set' : ' sets'));
      if (e.his) bits.push('His ' + e.his + (e.his === 1 ? ' set' : ' sets'));
      rows.appendChild(h('div', { class: 'row hrow' }, h('span', { class: 't' }, bits.join(' \u00b7 '))));
    });
    var clr = h('button', { class: 'btn alt', type: 'button' }, 'Clear history');
    clr.onclick = function () {
      if (!armed) {
        armed = true; clr.textContent = 'Tap again to clear';
        tm = setTimeout(function () { armed = false; clr.textContent = 'Clear history'; }, 4000);
        return;
      }
      clearTimeout(tm); store.set('hist', []); store.set('hist_counts', {}); renderHistory();
    };
    appEl.appendChild(h('div', { class: 'screen' },
      h('h1', {}, 'Past sessions'), h('p', { class: 'sub' }, 'Your last 30 full sessions, on this phone only.'), rows,
      h('div', { class: 'hbtns' }, h('button', { class: 'btn', type: 'button', onclick: renderHome }, 'Back'), l.length ? clr : null)));
  }

  /* ---------- go ---------- */
  if (TEST) window.__app = { S: S, G: G, Voice: Voice, Snd: Snd, N: N, startDay: startDay, repsFor: repsFor, histLine: histLine, togglePause: togglePause, startSingle: startSingle, startTimer: startTimer, repeatStep: repeatStep, planWeek: planWeek, histList: histList, renderHome: renderHome, advance: advance, store: store, windowLeft: windowLeft };
  if (store.get('safety_ok', false)) renderHome(); else renderSafety();
})();
