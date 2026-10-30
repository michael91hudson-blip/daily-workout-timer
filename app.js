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
  /* Oct 30: Pace now sets the break length; the old rep-speed choice moves to Rep speed once */
  if (store.get('reset_oct30', 0) !== 1) {
    var oldPace = store.get('pace', 1);
    if (oldPace === 0 || oldPace === 2) store.set('repspeed', oldPace);
    store.set('pace', 1);
    store.set('reset_oct30', 1);
  }
  var S = {
    his: { name: store.get('his_name', ''), say: store.get('his_say', '') },
    her: { name: store.get('her_name', ''), say: store.get('her_say', '') },
    setsHer: store.get('her_sets', 2),
    setsHis: store.get('his_sets', 2),
    day: ({ 1: 'A', 3: 'B', 5: 'C' })[new Date().getDay()] || store.get('day', 'B'),
    verse: store.get('verse', 0),
    vspeed: store.get('vspeed', 2),
    pace: store.get('pace', N.paceDefault),
    repspeed: store.get('repspeed', N.paceDefault),
    talk: store.get('talk', 1),
    rounds: store.get('rounds', N.roundsDefault)
  };
  /* week 1 starts on plan.start; weeks keep counting after week 4 (Next Phase) */
  function planWeek(dt) {
    var P = C.plan, a = P.start.split('-'), d = dt || new Date();
    var days = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(+a[0], +a[1] - 1, +a[2])) / 86400000);
    return Math.max(1, Math.floor(days / 7) + 1);
  }
  function setsForWeek(w) { var P = C.plan; return w <= P.setsByWeek.length ? P.setsByWeek[w - 1] : P.setsAfter; }
  /* 0: weeks 1-4, 1: weeks 5-8, 2: weeks 9-12, 3: weeks 13-16, 4: week 17 on */
  function bracket(w) { return Math.min(4, Math.floor(((w || planWeek()) - 1) / C.plan.bracket)); }
  /* the Oct 28 documents renumbered some ladders: saved steps and hold patterns go back to the documents' starting steps once */
  if (store.get('reset_oct28', 0) !== 1) {
    try {
      var kill = [], i0, k0;
      for (i0 = 0; i0 < localStorage.length; i0++) { k0 = localStorage.key(i0); if (/^(step_|holds_|hp_)/.test(k0)) kill.push(k0); }
      kill.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
    store.set('reset_oct28', 1);
  }
  /* the Oct 28 documents gave her Thursday cardio and new minutes: her saved cardio minutes clear once */
  if (store.get('reset_oct28b', 0) !== 1) {
    try {
      var killb = [], i1, k1;
      for (i1 = 0; i1 < localStorage.length; i1++) { k1 = localStorage.key(i1); if (/^cm_her_/.test(k1)) killb.push(k1); }
      killb.forEach(function (k) { localStorage.removeItem(k); });
    } catch (e) { /* ignore */ }
    store.set('reset_oct28b', 1);
  }
  /* the Oct 29 documents start her shoulder taps on the knee version: her saved taps step clears once */
  if (store.get('reset_oct29', 0) !== 1) {
    try { localStorage.removeItem('step_her_taps'); } catch (e) { /* ignore */ }
    store.set('reset_oct29', 1);
  }
  var WEEK = planWeek();
  if (store.get('plan_week2', 0) !== WEEK) {
    S.setsHer = setsForWeek(WEEK); S.setsHis = setsForWeek(WEEK);
    store.set('her_sets', S.setsHer); store.set('his_sets', S.setsHis); store.set('plan_week2', WEEK);
  }
  var RATES = [0.7, 0.85, 1, 1.2, 1.4];
  var SPEEDNAMES = ['Slowest', 'Slow', 'Normal', 'Fast', 'Faster'];
  if (!(S.vspeed >= 0 && S.vspeed < RATES.length)) S.vspeed = 2;
  if (N.sets.indexOf(S.setsHer) < 0) S.setsHer = setsForWeek(WEEK);
  if (N.sets.indexOf(S.setsHis) < 0) S.setsHis = setsForWeek(WEEK);
  if (!C.days.some(function (d) { return d.key === S.day; })) S.day = 'B';
  if (!(S.verse >= 0 && S.verse < C.verses.length)) S.verse = 0;
  if (!(S.pace >= 0 && S.pace < N.paceNames.length)) S.pace = N.paceDefault;
  if (!(S.repspeed >= 0 && S.repspeed < N.paceNames.length)) S.repspeed = N.paceDefault;
  if (S.talk !== 0 && S.talk !== 1) S.talk = 1;
  if (N.rounds.indexOf(S.rounds) < 0) S.rounds = N.roundsDefault;

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
  var CUEBY = {};
  C.cues.forEach(function (c) { CUEBY[c.id] = { id: c.id, text: c.text }; });

  /* ---------- picks saved per person: ladder step, reps, plank seconds, starting holds ---------- */
  function clampInt(v, lo, hi, d) { return (typeof v === 'number' && v >= lo && v <= hi) ? v : d; }
  function stepFor(pid, slot) { return clampInt(store.get('step_' + pid + '_' + slot.ladder, slot.start), 1, C.ladders[slot.ladder].steps.length, slot.start); }
  function setStepFor(pid, slot, v) { store.set('step_' + pid + '_' + slot.ladder, v); }
  function repsOf(pid, lk) { return clampInt(store.get('reps_' + pid + '_' + lk, N.repsDefault), N.repsMin, N.repsMax, N.repsDefault); }
  function setRepsOf(pid, lk, v) { store.set('reps_' + pid + '_' + lk, Math.max(N.repsMin, Math.min(N.repsMax, v))); }
  function plankOf(pid) { return clampInt(store.get('plank_' + pid, N.plankDefault), N.plankMin, N.plankMax, N.plankDefault); }
  function setPlankOf(pid, v) { store.set('plank_' + pid, Math.max(N.plankMin, Math.min(N.plankMax, v))); }
  function holdPatOf(pid, lk) { return clampInt(store.get('hp_' + pid + '_' + lk, N.holdDefault[pid]), 0, N.holdPatterns.length - 1, N.holdDefault[pid]); }
  function setHoldPatOf(pid, lk, v) { store.set('hp_' + pid + '_' + lk, Math.max(0, Math.min(N.holdPatterns.length - 1, v))); }
  /* holds in a set: the chosen pattern, set by set (3-2-1-1, 4-3-2-1, 5-3-1-1, ...) */
  function holdsIn(pat, set) { var p = N.holdPatterns[pat]; return p[Math.min(set, p.length) - 1]; }
  function ytLongOf(pid) { return clampInt(store.get('ytlong_' + pid, N.ytLongDefault), 30, 45, N.ytLongDefault); }
  function setYtLongOf(pid, v) { store.set('ytlong_' + pid, Math.max(30, Math.min(45, v))); }

  /* minutes: the document default for the week, kept only until the plan moves to the next block of weeks */
  function minsGet(key, list, def) {
    var o = store.get(key, null);
    return (o && o.w === bracket() && list.indexOf(o.v) >= 0) ? o.v : def;
  }
  function minsSet(key, v) { store.set(key, { w: bracket(), v: v }); }
  function walkDefault() { return C.cardio.walkDefaults[bracket()]; }
  var WDKEY = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  function isRestDay() { return C.cardio.restDays.indexOf(WDKEY[new Date().getDay()]) >= 0; }
  function cardioDefault(pid) {
    var wd = WDKEY[new Date().getDay()], t = C.cardio.defaults[pid];
    return (t[wd] || t.tue)[bracket()];
  }

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
    voice: function () {
      if (this.picked) return this.picked;
      try {
        var vs = window.speechSynthesis.getVoices() || [];
        var en = vs.filter(function (v) { return /^en[-_]US/i.test(v.lang); });
        if (!en.length) en = vs.filter(function (v) { return /^en/i.test(v.lang); });
        var fem = /female|samantha|victoria|karen|moira|tessa|fiona|zira|jenny|aria|susan|hazel|catherine|serena|allison|ava\b|nicky|kathy|heather|linda/i;
        function nm(v) { return (v.name || '') + ' ' + (v.voiceURI || ''); }
        var pick = en.filter(function (v) { return fem.test(nm(v)); })[0] || en.filter(function (v) { return /google us|natural/i.test(v.name); })[0] || en[0] || null;
        this.picked = vs.length ? pick : null;
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

  /* ---------- what a person does for a move: their chosen ladder step, resolved ---------- */
  function ladderStep(lk, n) { return C.ladders[lk].steps[n - 1]; }
  function rowFor(name, fallback) {
    var k = Object.keys(C.rows).filter(function (r) { return r.toLowerCase() === name.toLowerCase(); })[0];
    return C.rows[k || fallback];
  }
  function holdPattern(pat, sets) {
    var a = [], n = Math.min(N.holdPatterns[pat].length, Math.max(3, sets)), i;
    for (i = 1; i <= n; i++) a.push(holdsIn(pat, i));
    return a.join(', ');
  }
  function howText(st, pid) { return (pid === 'her' && st.howHer) ? st.howHer : st.how; }
  function resolve(m, pid) {
    var slot = m[pid];
    if (!slot) return null;
    var lad = C.ladders[slot.ladder], n = stepFor(pid, slot), st = lad.steps[n - 1], atStart = (n === slot.start), cfg = st.cfg;
    var R = { slot: slot, ladder: slot.ladder, step: n, atStart: atStart, cfg: cfg, kind: cfg.kind, side: cfg.kind === 'reps' && !!cfg.side, yt: !!cfg.yt };
    R.name = atStart ? slot.name : (lad.prefix.indexOf(n) >= 0 ? lad.short + ': ' + st.name : st.name);
    R.how = atStart ? slot.how : ((pid === 'her' && st.cueHer) ? st.cueHer : st.cue);
    R.row = atStart ? C.rows[slot.row] : rowFor(st.name, slot.row);
    R.cues = { how: R.how, feel: R.row.cues.feel, fix: R.row.cues.fix };
    R.reps = (cfg.kind === 'reps' || cfg.kind === 'taps') ? repsOf(pid, slot.ladder) : null;
    R.startLine = atStart ? slot.startLine : st.startLine;
    R.first = atStart ? slot.first : st.first;
    R.startShow = R.startLine || R.how.text;
    if (cfg.kind === 'reps') R.amount = N.repsMin + '–' + N.repsMax + (R.side ? '/side' : '') + (R.yt ? ' each' : '');
    else if (cfg.kind === 'plank') R.amount = plankOf(pid) + ' sec';
    else if (cfg.kind === 'taps') R.amount = N.repsMin + '–' + N.repsMax + '/side';
    else R.amount = cfg.sec + '-sec holds: ' + holdPattern(holdPatOf(pid, slot.ladder), maxSetsFor(pid)) + (cfg.sides === 'legs' ? ' on each leg' : (cfg.sides === 'none' ? '' : ' per side'));
    if (atStart && slot.easier) {
      R.easier = { text: slot.easier, items: slot.easierSteps.map(function (e) { var s2 = ladderStep(e.ladder, e.n); return { name: s2.name, how: howText(s2, pid) }; }) };
    } else if (!atStart && n > 1) {
      var below = lad.steps[n - 2];
      R.easier = { text: below.name, items: [{ name: below.name, how: howText(below, pid) }] };
    } else R.easier = null;
    return R;
  }
  function repsLabel(R) { return R.reps ? 'Reps: ' + R.reps + (R.side || R.kind === 'taps' ? ' per side' : (R.yt ? ' each' : '')) : null; }

  function buildDay(walk) {
    var p = [{ t: 'warmup' }, { t: 'practice' }];
    var ts = totalSets(), s, n, moves = curMoves();
    for (s = 1; s <= ts; s++) {
      for (n = 1; n <= moves.length; n++) { p.push({ t: 'ready', what: 'move', n: n, set: s }); p.push({ t: 'move', n: n, set: s }); }
      if (s < ts) p.push({ t: 'rest', set: s });
    }
    if (walk) { p.push({ t: 'ready', what: 'walk', mins: walk.mins }); p.push({ t: 'timer', kind: 'walk', mins: walk.mins, inDay: true }); }
    addStretches(p, 'cool'); addStretches(p, 'hip');
    p.push({ t: 'finish', msg: curDay().title.split(':')[0] + ' complete', voice: true });
    return p;
  }
  function addStretches(p, grp) {
    var L = grp === 'hip' ? C.hip : C.stretches, r;
    for (r = 1; r <= S.rounds; r++) {
      L.forEach(function (st, k) {
        p.push({ t: 'ready', what: 'stretch', st: st, k: k, total: L.length, round: r, rounds: S.rounds, grp: grp });
        p.push({ t: 'stretch', st: st, k: k, total: L.length, round: r, rounds: S.rounds, grp: grp });
      });
    }
  }

  /* ---------- playing screens ---------- */
  function paceLabel() { return 'Pace: ' + N.paceNames[S.pace]; }
  function cyclePace() {
    S.pace = (S.pace + 1) % N.paceNames.length; store.set('pace', S.pace);
    if (G.ui && G.ui.pace) G.ui.pace.textContent = paceLabel();
    TESTLOG('pace', S.pace);
  }
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
    ui.skip = h('button', { class: 'btn', type: 'button', onclick: function () { skipPress(); } }, 'Skip');
    ui.plus = h('button', { class: 'btn alt', type: 'button', onclick: function () { plus10(); } }, '+10 sec');
    ui.pace = h('button', { class: 'btn alt', type: 'button', onclick: function () { cyclePace(); } }, paceLabel());
    ui.home = h('button', { class: 'btn alt', type: 'button' }, 'Home');
    (function (b) {
      var armed = false, tm = null;
      b.onclick = function () {
        if (!armed) { armed = true; b.textContent = 'Tap again to leave'; tm = setTimeout(function () { armed = false; b.textContent = 'Home'; }, 4000); return; }
        clearTimeout(tm); goHome();
      };
    })(ui.home);
    ui.root = h('div', { id: 'play', class: sec },
      h('div', { class: 'band' }, ui.secname, ui.prog),
      ui.phase, ui.next, ui.cards, ui.mot,
      h('div', { class: 'dock' }, ui.cap, h('div', { class: 'ctrls' }, ui.pause, ui.repeat, ui.skip, ui.plus, ui.pace, ui.home)));
    appEl.appendChild(ui.root);
    G.ui = ui;
    return ui;
  }

  function makeCard(o) {
    var c = {};
    c.who = h('div', { class: 'who' }, o.who || '');
    c.mv = h('div', { class: 'mv' }, o.mv || '');
    c.amt = h('div', { class: 'amt' }, o.amt || '');
    c.startLine = o.startLine ? h('div', { class: 'startline' }, o.startLine) : null;
    c.repsTxt = o.repsLabel ? h('div', { class: 'amt reps' }, o.repsLabel) : null;
    c.big = h('div', { class: 'big' }, '');
    c.st = h('div', { class: 'st' }, '');
    c.barFill = h('i');
    c.bar = h('div', { class: 'bar' }, c.barFill);
    c.btns = h('div', { class: 'btns' });
    c.strip = h('div', { class: o.rep ? 'strip' : 'strip none' }, '');
    c.doneBtn = null;
    if (o.done) { c.doneBtn = h('button', { class: 'btn small', type: 'button', onclick: o.done }, 'Done early'); c.btns.appendChild(c.doneBtn); }
    c.easierBox = null;
    if (o.easier) {
      var box = h('div', { class: 'easier', hidden: true }, h('p', {}, 'Easier version: ' + o.easier.text));
      o.easier.items.forEach(function (it) { box.appendChild(h('p', {}, it.name + ': ' + it.how)); });
      c.easierBox = box;
      c.btns.appendChild(h('button', { class: 'btn alt small', type: 'button', onclick: function () { box.hidden = !box.hidden; } }, 'Easier version'));
    }
    c.howBox = null;
    if (o.howText) {
      var hb = h('div', { class: 'howbox', hidden: !o.howOpen }, o.howText);
      c.howBox = hb;
      if (!o.howOpen) c.btns.appendChild(h('button', { class: 'btn alt small', type: 'button', onclick: function () { hb.hidden = !hb.hidden; } }, 'How to do it'));
    }
    c.root = h('div', { class: 'card' }, c.who, c.mv, c.amt, c.startLine, c.repsTxt, c.big, c.st, c.bar, c.btns, c.strip, c.howBox, c.easierBox);
    G.ui.cards.appendChild(c.root);
    return c;
  }

  function fmtClock(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  /* ---------- tracks (one per person per move) ---------- */
  var CUE = { hold: CUEBY.hold, rest: CUEBY.rest, sides: CUEBY['switch-sides'], legs: CUEBY['switch-legs'],
              nowT: { id: CUEBY['now-t'].id, text: CUEBY['now-t'].text, named: true } };
  function paceMult() { return N.repMult[S.repspeed]; }
  function breakSec() { return N.breakSec[S.pace]; }
  function scaleSeq(seq) { var k = paceMult(); return seq.map(function (q) { return [q[0], Math.round(q[1] * k * 100) / 100]; }); }
  function seqSum(seq) { return seq.reduce(function (a, q) { return a + q[1]; }, 0); }
  function holdPh(dur, label) { return { k: 'hold', dur: dur, beep: true, label: label, strip: 'HOLD', cls: 'hold', say: CUE.hold }; }
  function brkPh() { return { k: 'brk', dur: N.holdBreak, label: 'Rest', strip: 'REST', cls: 'pause', say: CUE.rest }; }
  function switchPh(cue, label) { return { k: 'pause', dur: breakSec(), beep: true, label: label, strip: 'SWITCH', cls: 'wswitch', say: cue }; }
  function holdPhases(pid, R, set) {
    var c = R.cfg, n = holdsIn(holdPatOf(pid, R.ladder), set), ph = [], i, sd, unit;
    if (c.sides === 'legs' || c.sides === 'sides') {
      unit = c.sides === 'legs' ? 'Leg' : 'Side';
      for (sd = 1; sd <= 2; sd++) {
        for (i = 1; i <= n; i++) { ph.push(holdPh(c.sec, unit + ' ' + sd + ' · Hold ' + i + ' of ' + n)); if (i < n) ph.push(brkPh()); }
        if (sd === 1) ph.push(switchPh(c.sides === 'legs' ? CUE.legs : CUE.sides, c.sides === 'legs' ? 'Switch legs' : 'Switch sides'));
      }
    } else {
      for (i = 1; i <= n; i++) { ph.push(holdPh(c.sec, 'Hold ' + i + ' of ' + n)); if (i < n) ph.push(brkPh()); }
    }
    return ph;
  }
  function mkTrack(pid, m, set) {
    var R = resolve(m, pid), c = R.cfg, ph = [];
    function rep(label, n) { var seq = scaleSeq(c.seq), rs = seqSum(seq); return { k: 'reps', n: n, repSec: rs, dur: n * rs, label: label, done: true, seq: seq, words: c.words || '' }; }
    function taps(n) { var seq = scaleSeq([['TAP', N.tapSec]]), rs = seqSum(seq); return { k: 'reps', n: n, repSec: rs, dur: n * rs, label: '', done: true, seq: seq, unit: 'Tap' }; }
    if (c.kind === 'plank') ph.push({ k: 'hold', dur: plankOf(pid), beep: true, label: 'Hold' });
    else if (c.kind === 'taps') ph.push(taps(R.reps * 2));
    else if (c.kind === 'holds') ph = holdPhases(pid, R, set);
    else if (c.yt) {
      if (c.longLast && set === maxSetsFor(pid)) ph.push(holdPh(ytLongOf(pid), 'Y hold'), switchPh(CUE.nowT, 'Now T'), holdPh(ytLongOf(pid), 'T hold'));
      else ph.push(rep('Y', R.reps), switchPh(CUE.nowT, 'Now T'), rep('T', R.reps));
    } else if (c.side) ph.push(rep('Side 1', R.reps), switchPh(CUE.sides, 'Switch sides'), rep('Side 2', R.reps));
    else ph.push(rep('', R.reps));
    return { pid: pid, ph: ph, pi: 0, el: 0, fin: false, repIdx: -1, upSaid: false, downSaid: false, R: R };
  }
  function mkStretchTrack(st) {
    var ph = [];
    if (st.kind === 'once') ph.push({ k: 'hold', dur: N.hold, beep: true, label: 'Hold' });
    else ph.push({ k: 'hold', dur: N.hold, beep: true, label: 'Side 1' }, { k: 'pause', dur: breakSec(), beep: true, label: 'Switch sides', say: CUE.sides }, { k: 'hold', dur: N.hold, beep: true, label: 'Side 2' });
    return { pid: null, ph: ph, pi: 0, el: 0, fin: false, repIdx: -1, upSaid: false, downSaid: false };
  }

  /* spoken cues from a track: with two people doing the same thing it is said once, otherwise with names */
  function sayCue(s, t, cue) {
    var mode = s.udMode;
    if (mode && mode.silent.indexOf(t) >= 0) return;
    var parts = [], short = (cue.id === 'up' || cue.id === 'down' || cue.id === 'in' || cue.id === 'out' || cue.id === 'tap' || cue.id === 'hold' || cue.id === 'rest');
    if (t.pid && ((mode && mode.names) || (cue.named && s.activeCount > 1))) parts.push({ text: sayName(t.pid) + '.' });
    parts.push({ id: cue.id, text: cue.text });
    Voice.say(parts, { urgent: true, nocap: short });
  }
  function sayUpDown(s, t, word, words) {
    if (word === 'TAP') { sayCue(s, t, CUEBY.tap); return; }
    var wall = (words === 'wall');
    sayCue(s, t, word === 'UP' ? (wall ? CUEBY.out : CUEBY.up) : (wall ? CUEBY['in'] : CUEBY.down));
  }
  function setUpDownMode(s) {
    var rt = s.tracks.filter(function (t) { return t.ph.some(function (p) { return p.seq || p.say; }); });
    var sig = function (t) { return JSON.stringify(t.ph.map(function (p) { return [p.k, p.seq || null, p.repSec || 0, p.dur, p.say ? p.say.id : '', p.words || '']; })); };
    var mode = { names: false, silent: [] };
    if (rt.length > 1) {
      if (rt.every(function (t) { return sig(t) === sig(rt[0]); })) mode.silent = rt.slice(1);
      else mode.names = true;
    }
    s.udMode = mode;
  }
  /* what is said when a move or stretch starts */
  function startCues(s) {
    var withSay = s.tracks.filter(function (t) { return t.ph[0].say; });
    if (withSay.length < s.tracks.length) Voice.say([CUEBY.start], { urgent: true, nocap: true });
    withSay.forEach(function (t) { sayCue(s, t, t.ph[0].say); });
  }
  function nextPhase(s, t) {
    t.pi++; t.el = 0; t.repIdx = -1; t.upSaid = false; t.downSaid = false; t.lastSeq = null;
    if (t.pi >= t.ph.length) { t.fin = true; return; }
    var p = t.ph[t.pi];
    if (p.say) sayCue(s, t, p.say);
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
      if (ri > t.repIdx) { t.repIdx = ri; t.upSaid = false; t.downSaid = false; Snd.tick(); }
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
          if (word === 'UP' || word === 'DOWN' || word === 'TAP') sayUpDown(s, t, word, p.words);
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
      var repTxt = (p.unit || 'Rep') + ' ' + (ri + 1) + ' of ' + p.n;
      var lab = p.label ? p.label + ' · ' : '';
      var inRep = t.el - ri * p.repSec;
      if (p.seq) {
        var acc = 0, word = p.seq[p.seq.length - 1][0], left = 1, q;
        for (q = 0; q < p.seq.length; q++) {
          if (inRep < acc + p.seq[q][1]) { word = p.seq[q][0]; left = acc + p.seq[q][1] - inRep; break; }
          acc += p.seq[q][1];
        }
        var shownWord = (p.words === 'wall') ? (word === 'UP' ? 'OUT' : (word === 'DOWN' ? 'IN' : word)) : word;
        c.strip.textContent = shownWord + ' \u00b7 ' + Math.max(1, Math.ceil(left - 0.001)) + ' sec';
        c.strip.className = 'strip ' + word.toLowerCase();
      } else { clearStrip(c); }
      c.big.textContent = (ri + 1) + ' / ' + p.n;
      c.st.textContent = lab + repTxt;
      frac = (t.el - ri * p.repSec) / p.repSec;
    } else {
      if (p.strip) { c.strip.textContent = p.strip; c.strip.className = 'strip ' + p.cls; } else clearStrip(c);
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
  /* seconds until this track next needs a spoken cue (Up, Down, Hold, Rest, Switch sides) */
  function urgentIn(t) {
    if (t.fin) return Infinity;
    var p = t.ph[t.pi], rem = p.dur - t.el, best = Infinity;
    var nextSays = !!(t.ph[t.pi + 1] && t.ph[t.pi + 1].say);
    if (p.k === 'reps' && p.seq) {
      var ri = Math.min(Math.floor(t.el / p.repSec), p.n - 1), inRep = t.el - ri * p.repSec, acc = 0, q, isUD = function (w) { return w === 'UP' || w === 'DOWN' || w === 'TAP'; };
      for (q = 0; q < p.seq.length; q++) {
        if (acc > inRep + 0.001 && isUD(p.seq[q][0])) best = Math.min(best, acc - inRep);
        acc += p.seq[q][1];
      }
      if (ri < p.n - 1 && isUD(p.seq[0][0])) best = Math.min(best, p.repSec - inRep);
    }
    if (nextSays) best = Math.min(best, rem);
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
    return live.length > 0 && live.every(function (t) { var p = t.ph[t.pi]; return p.k === 'hold'; });
  }
  function maybeMotivate(s, windowEnd) {
    var n = nowMs();
    if (!motAllowed(s)) return;
    if (Voice.busy() || n - Voice.lastEnd < 4000 || n - G.lastMot < 25000 || s.age < 5) return;
    var m = nextMot();
    if (Voice.est(m.say) * 1.2 + 3 > windowEnd) { G.motPos--; return; }
    G.lastMot = n;
    Voice.say([{ id: m.id, text: m.say }], { nocap: true, dropIfCut: true });
    G.ui.mot.textContent = m.text;
    s.motUntil = s.age + 7;
  }
  function clearMot(s) { if (s.motUntil && s.age > s.motUntil) { G.ui.mot.textContent = ''; s.motUntil = 0; } }

  /* ---------- step: warm-up ---------- */
  var stepEnter = {}, stepTick = {};

  stepEnter.warmup = function (s) {
    var ui = scaffold('warm', 'Warm-up', C.warmup.label);
    s.age = 0; s.pi = 0; s.pel = 0; s.said = -1; s.parts = []; s.prep = 0;
    C.warmup.parts.forEach(function (p, i) {
      if (i > 0) s.parts.push({ gap: true, next: p.name, cue: p.next, sec: breakSec() });
      s.parts.push({ part: i + 1, name: p.name.toUpperCase(), sec: p.sec, how: p.how });
    });
    var who = namedList().map(shownName).join(' & ');
    s.card = makeCard({ who: who, mv: C.warmup.label, amt: '', rep: true });
    ui.phase.textContent = 'Listen';
    s.listenWait = 0;
    if (G.mode === 'day') {
      var gn = namedList();
      Voice.say([{ text: gn.length ? 'Hey ' + joinNames(gn, sayName) + ', are you ready?' : 'Are you ready?' }], { blocking: true });
      Voice.say([CUEBY.safety], { blocking: true });
    }
    Voice.say([CUEBY['section-warmup']], { blocking: true });
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
    var p = s.parts[s.pi];
    if (s.prep > 0) {
      var pb = s.prep;
      s.prep -= dt;
      beepCross(pb, s.prep);
      G.ui.phase.textContent = 'Get in position';
      s.card.big.textContent = String(Math.max(0, Math.ceil(s.prep)));
      s.card.barFill.style.width = Math.min(1, (SKIP_PREP - s.prep) / SKIP_PREP) * 100 + '%';
      s.card.strip.textContent = 'GET IN POSITION'; s.card.strip.className = 'strip wswitch';
      s.card.st.textContent = 'Next: ' + p.name;
      if (s.prep > 0) return;
      s.prep = 0; G.ui.phase.textContent = 'Warm-up';
    }
    if (s.said !== s.pi) { s.said = s.pi; if (!p.gap && S.talk) Voice.say([p.how], {}); }
    var before = p.sec - s.pel;
    s.pel += dt;
    beepCross(before, p.sec - s.pel);
    var card = s.card;
    card.big.textContent = fmtClock(p.sec - s.pel);
    card.barFill.style.width = Math.min(1, s.pel / p.sec) * 100 + '%';
    if (p.gap) { card.strip.textContent = 'SWITCH'; card.strip.className = 'strip wswitch'; card.st.textContent = 'Next: ' + p.next; }
    else { card.strip.textContent = p.name; card.strip.className = 'strip wpart'; card.st.textContent = 'Part ' + p.part + ' of ' + C.warmup.parts.length; }
    if (s.pel >= p.sec) {
      s.pi++; s.pel = 0;
      if (s.pi >= s.parts.length) { advance(); return; }
      var q = s.parts[s.pi];
      if (q.gap) Voice.say([q.cue], { urgent: true });
    }
  };

  /* ---------- step: practice (a few easy reps of each person's first move) ---------- */
  stepEnter.practice = function (s) {
    var ui = scaffold('warm', 'Practice', 'Before move 1');
    s.dur = N.practice; s.el = 0; s.age = 0; s.cardsList = [];
    var m = curMoves()[0];
    namedList().forEach(function (pid) {
      var R = resolve(m, pid);
      s.cardsList.push(makeCard({ who: shownName(pid), mv: 'Practice: a few easy reps of ' + R.name, amt: '' }));
    });
    ui.phase.textContent = 'Practice';
    Voice.say([CUEBY.practice], {});
  };
  stepTick.practice = function (s, dt) {
    s.age += dt;
    var before = s.dur - s.el;
    s.el += dt;
    beepCross(before, s.dur - s.el);
    s.cardsList.forEach(function (c) {
      c.big.textContent = String(Math.max(0, Math.ceil(s.dur - s.el)));
      c.st.textContent = 'Easy reps';
      c.barFill.style.width = Math.min(1, s.el / s.dur) * 100 + '%';
    });
    if (s.el >= s.dur) advance();
  };

  /* ---------- step: get ready ---------- */
  stepEnter.ready = function (s) {
    var ui, ts = totalSets();
    s.dur = breakSec(); s.el = 0; s.age = 0; s.listenWait = 0; s.listen = false; s.cardsList = [];
    if (s.what === 'move') {
      var m = curMoves()[s.n - 1], res = {};
      ui = scaffold('work', 'Workout', 'Move ' + s.n + ' of ' + curMoves().length + ' · Set ' + s.set + ' of ' + (s.single ? 1 : ts));
      var act = activeIn(s.set, m);
      namedList().forEach(function (pid) {
        var on = act.indexOf(pid) >= 0, R = resolve(m, pid);
        if (on) res[pid] = R;
        var card = makeCard({ who: shownName(pid), mv: R.name, amt: R.amount, startLine: on ? R.startShow : null, howText: on ? R.how.text : null, easier: on ? R.easier : null, rep: on && R.kind === 'reps', repsLabel: on ? repsLabel(R) : null });
        if (!on) card.root.className += ' dim';
        s.cardsList.push({ card: card, on: on });
      });
      s.listen = (s.set === 1);
      if (!s.single && s.n === 1 && s.set === 1) Voice.say([CUEBY['section-workout']], { blocking: s.listen });
      if (!s.single && s.n === 1 && s.set >= 2) Voice.say([CUEBY['set-' + s.set]], { blocking: s.listen });
      Voice.say([CUEBY['move-' + s.n]], { blocking: s.listen });
      if (s.set >= 2) {
        var firsts = act.filter(function (pid) { return res[pid].first; });
        if (firsts.length) queueCueGroups(firsts, function (pid) { return res[pid].first; }, ['first'], {});
      }
      if (s.set === 1) {
        if (S.talk) ['how', 'feel', 'fix'].forEach(function (typ) {
          queueCueGroups(act, function (pid, t2) { return res[pid].cues[t2]; }, [typ], { blocking: true });
        });
      }
    } else if (s.what === 'walk') {
      ui = scaffold('warm', 'Walk', 'Walk · ' + s.mins + ' min');
      s.cardsList.push({ card: makeCard({ who: namedList().map(shownName).join(' & '), mv: 'Walk', amt: s.mins + ' min' }), on: true });
      Voice.say([CUEBY['walk-go']], {});
    } else {
      var hip = s.grp === 'hip', secName = hip ? 'Hip Flexibility' : 'Cool-down';
      ui = scaffold('cool', secName, 'Stretch ' + (s.k + 1) + ' of ' + s.total + ((s.rounds > 1 && !s.single) ? ' · Round ' + s.round + ' of ' + s.rounds : ''));
      s.listen = (s.round === 1);
      var c2 = makeCard({ who: namedList().map(shownName).join(' & '), mv: s.st.name, amt: s.st.targets, startLine: s.st.startLine, howText: s.st.how });
      s.cardsList.push({ card: c2, on: true });
      if (!s.single && s.k === 0 && s.round === 1) Voice.say([CUEBY[hip ? 'section-hip' : 'section-cooldown']], { blocking: s.listen });
      if (!s.single && s.k === 0 && s.round === 2) Voice.say([CUEBY['round-2']], { blocking: s.listen });
      if (s.round === 1 && S.talk) {
        ['how', 'feel', 'fix'].forEach(function (typ) { Voice.say([s.st.cues[typ]], { blocking: true }); });
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
        x.card.st.textContent = x.on ? 'Listen to how to do it' : 'Done — rest';
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
      x.card.st.textContent = x.on ? (s.what === 'walk' ? 'Get ready' : 'Get into position') : 'Done — rest';
      x.card.barFill.style.width = Math.min(1, s.el / s.dur) * 100 + '%';
    });
    if (s.el >= s.dur) advance();
  };

  /* ---------- step: a move ---------- */
  stepEnter.move = function (s) {
    var m = curMoves()[s.n - 1], ts = totalSets(), res = {};
    var ui = scaffold('work', 'Workout', 'Move ' + s.n + ' of ' + curMoves().length + ' · Set ' + s.set + ' of ' + (s.single ? 1 : ts));
    var act = activeIn(s.set, m);
    s.age = 0; s.frozen = 0; s.tracks = []; s.cardsList = []; s.activeCount = act.length;
    namedList().forEach(function (pid) {
      var on = act.indexOf(pid) >= 0, t = null, card, R = resolve(m, pid);
      if (on) {
        t = mkTrack(pid, m, s.set); res[pid] = R;
        card = makeCard({ who: shownName(pid), mv: R.name, amt: R.amount, howText: R.how.text, easier: R.easier, rep: true, repsLabel: repsLabel(R),
          done: (R.kind === 'reps' || R.kind === 'taps') ? function () { trackDone(s, t); } : null });
        s.tracks.push(t);
      } else {
        card = makeCard({ who: shownName(pid), mv: R.name, amt: R.amount });
        card.root.className += ' dim';
      }
      s.cardsList.push({ card: card, t: t, on: on });
    });
    ui.phase.textContent = 'Go';
    setUpDownMode(s);
    startCues(s);
    if (s.set !== 1 && S.talk) queueCueGroups(act, function (pid, typ) { return res[pid].cues[typ]; }, ['feel', 'fix'], { fits: function (it) { return fitCheck(s, it); } });
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
    Voice.say([CUEBY.rest], { nocap: true });
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

  /* ---------- step: a stretch (cool-down or Hip Flexibility) ---------- */
  stepEnter.stretch = function (s) {
    var ui = scaffold('cool', s.grp === 'hip' ? 'Hip Flexibility' : 'Cool-down', 'Stretch ' + (s.k + 1) + ' of ' + s.total + ((s.rounds > 1 && !s.single) ? ' · Round ' + s.round + ' of ' + s.rounds : ''));
    var t = mkStretchTrack(s.st);
    s.age = 0; s.frozen = 0; s.tracks = [t]; s.activeCount = namedList().length;
    var card = makeCard({ who: namedList().map(shownName).join(' & '), mv: s.st.name, amt: s.st.targets, howText: s.st.how, howOpen: true });
    s.cardsList = [{ card: card, t: t, on: true }];
    ui.phase.textContent = 'Go';
    setUpDownMode(s);
    startCues(s);
    if (s.round !== 1 && S.talk) [s.st.cues.feel, s.st.cues.fix].forEach(function (c) {
      Voice.say([c], { fits: function (it) { return fitCheck(s, it); } });
    });
  };
  stepTick.stretch = stepTick.move;

  /* ---------- step: walk, treadmill, VR combat or circuit timer ---------- */
  var KINDNAME = { walk: 'Walk', tread: 'Treadmill', vr: 'VR combat', circuit: 'No-Treadmill Circuit' };
  function perText(s) {
    if (!s.per) return s.mins + ' min';
    var vals = s.pids.map(function (p) { return s.per[p]; });
    if (vals.every(function (v) { return v === vals[0]; })) return vals[0] + ' min';
    return s.pids.map(function (p) { return shownName(p) + ' ' + s.per[p] + ' min'; }).join(' · ');
  }
  function circuitBegin(s) {
    var mvs = C.cardio.circuit.moves, mv = mvs[s.mi % mvs.length], k = paceMult();
    s.mv = mv; s.per2 = {}; s.moveDur = 0; s.ticked = -1;
    s.pids.forEach(function (pid) {
      var d = mv[pid], rs = mv.timed ? 0 : d.sec * k, dur = mv.timed ? s.opts.stepSec : s.opts.reps * rs;
      s.per2[pid] = { d: d, rs: rs, dur: dur, n: mv.timed ? 0 : s.opts.reps };
      s.moveDur = Math.max(s.moveDur, dur);
    });
    var parts = [], first = s.per2[s.pids[0]].d;
    if (s.pids.every(function (p) { return s.per2[p].d.name === first.name; })) parts.push(first.cue);
    else s.pids.forEach(function (p) { parts.push({ text: sayName(p) + '.' }); parts.push(s.per2[p].d.cue); });
    parts.push(CUEBY.go);
    Voice.say(parts, { urgent: true });
  }
  stepEnter.timer = function (s) {
    var label = KINDNAME[s.kind], isCirc = s.kind === 'circuit';
    s.pids = s.pids || namedList();
    var ui = scaffold(s.kind === 'walk' ? 'warm' : 'work', s.kind === 'walk' ? 'Walk' : 'Cardio', label + ' · ' + perText(s));
    ui.noPlus = true; ui.plus.disabled = true;
    s.total = s.mins * 60; s.el = 0; s.age = 0; s.fin = {};
    ui.phase.textContent = 'Go';
    if (!isCirc) {
      s.card = makeCard({ who: s.pids.map(shownName).join(' & '), mv: label, amt: perText(s), rep: true });
      if (s.kind === 'walk') Voice.say([CUEBY['walk-start']], { urgent: true });
      else Voice.say([CUEBY.start], { urgent: true, nocap: true });
    } else {
      s.cards = {};
      s.pids.forEach(function (pid) {
        var c = makeCard({ who: shownName(pid), mv: '', amt: '', rep: true });
        c.how = h('div', { class: 'easier' }, ''); c.root.appendChild(c.how);
        s.cards[pid] = c;
      });
      s.mi = 0; s.phase = 'move'; s.pel = 0;
      circuitBegin(s);
    }
  };
  function circuitTick(s, dt, left) {
    var pids = s.pids, mvs = C.cardio.circuit.moves, mv = s.mv;
    s.pel += dt;
    function nextNames() {
      var nm = mvs[(s.mi + 1) % mvs.length], names = pids.map(function (p) { return nm[p].name; });
      return names.filter(function (x, i) { return names.indexOf(x) === i; }).join(' / ');
    }
    if (s.phase === 'move') {
      pids.forEach(function (pid, i) {
        var p2 = s.per2[pid], c = s.cards[pid], done = s.pel >= p2.dur, k;
        c.mv.textContent = p2.d.name; c.how.textContent = p2.d.how; c.how.hidden = false;
        if (mv.timed) {
          c.amt.textContent = 'Work · ' + s.opts.stepSec + ' sec';
          c.big.textContent = done ? 'Done' : String(Math.ceil(Math.max(0, p2.dur - s.pel)));
          c.st.textContent = done ? 'Done — wait for the jog' : fmtClock(left) + ' left';
        } else {
          k = Math.min(Math.floor(s.pel / p2.rs) + 1, p2.n);
          c.amt.textContent = 'Reps: ' + p2.n;
          c.big.textContent = done ? 'Done' : k + ' / ' + p2.n;
          c.st.textContent = done ? 'Done — wait for the jog' : 'Rep ' + k + ' of ' + p2.n + ' · ' + fmtClock(left) + ' left';
          if (i === 0 && !done && k - 1 > s.ticked) { s.ticked = k - 1; Snd.tick(); }
        }
        c.barFill.style.width = Math.min(1, s.pel / p2.dur) * 100 + '%';
        c.strip.textContent = done ? 'WAIT' : 'GO'; c.strip.className = 'strip ' + (done ? 'pause' : 'up');
      });
      G.ui.next.textContent = 'Next: Jog';
      if (mv.timed) beepCross(s.moveDur - (s.pel - dt), s.moveDur - s.pel);
      if (s.pel >= s.moveDur) { s.phase = 'jog'; s.pel = 0; Voice.say([CUEBY.jog], { urgent: true }); }
    } else {
      var jl = Math.max(0, s.opts.jog - s.pel);
      pids.forEach(function (pid) {
        var c = s.cards[pid];
        c.mv.textContent = 'Jog in place'; c.amt.textContent = 'Jog · ' + s.opts.jog + ' sec'; c.how.textContent = ''; c.how.hidden = true;
        c.big.textContent = String(Math.ceil(jl)); c.st.textContent = fmtClock(left) + ' left';
        c.barFill.style.width = Math.min(1, s.pel / s.opts.jog) * 100 + '%';
        c.strip.textContent = 'JOG'; c.strip.className = 'strip hold';
      });
      G.ui.next.textContent = 'Next: ' + nextNames();
      beepCross(jl + dt, jl);
      if (s.pel >= s.opts.jog) { s.mi++; s.phase = 'move'; s.pel = 0; circuitBegin(s); }
    }
  }
  stepTick.timer = function (s, dt) {
    s.age += dt;
    var before = s.el, card = s.card;
    s.el += dt;
    var left = s.total - s.el, half = s.total / 2;
    if (before < half && s.el >= half) Voice.say([CUEBY.halfway], { urgent: true });
    if (before < s.total - 60 && s.el >= s.total - 60) Voice.say([CUEBY['one-minute']], { urgent: true });
    if (s.per) s.pids.forEach(function (pid) {
      var pm = s.per[pid] * 60;
      if (pm < s.total && !s.fin[pid] && s.el >= pm) { s.fin[pid] = true; Voice.say([{ text: sayName(pid) + ', your cardio is done.' }], { urgent: true }); }
    });
    if (s.kind !== 'circuit') {
      beepCross(s.total - before, left);
      card.big.textContent = fmtClock(left);
      card.barFill.style.width = Math.min(1, s.el / s.total) * 100 + '%';
      card.st.textContent = s.kind === 'walk' ? 'Keep walking' : KINDNAME[s.kind];
      card.strip.textContent = s.kind === 'walk' ? 'WALK' : (s.kind === 'vr' ? 'VR COMBAT' : 'TREADMILL'); card.strip.className = 'strip hold';
    } else circuitTick(s, dt, left);
    if (s.el >= s.total) {
      G.finishSay = true;
      if (s.inDay) { G.cardioDone = { k: s.kind, m: s.mins }; if (G.recorded) recordSession(false); } else recordTimer(s);
      advance();
    }
  };

  /* ---------- step: finish ---------- */
  stepEnter.finish = function (s) {
    appEl.textContent = '';
    G.ui = null;
    unlockScreen();
    if (s.voice) { recordSession(true); clearResume(); }
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
    if (st.t === 'practice') return 'Practice';
    if (st.what === 'walk') return 'Walk';
    if (st.what === 'stretch') return st.st.name;
    var m = curMoves()[st.n - 1], act = activeIn(st.set, m);
    var names = act.map(function (pid) { return resolve(m, pid).name; });
    if (names.every(function (x) { return x === names[0]; })) return names[0];
    return act.map(function (pid, i) { return shownName(pid) + ': ' + names[i]; }).join(' · ');
  }
  function planNextText(i) {
    var cur = G.plan[i], base = cur.t === 'ready' ? i + 1 : i, j;
    for (j = base + 1; j < G.plan.length; j++) {
      var st = G.plan[j];
      if (st.t === 'ready' || st.t === 'rest' || st.t === 'finish' || st.t === 'practice') {
        var lab = nextLabel(st);
        if (cur.t === 'rest' && st.t === 'ready' && st.what === 'move') lab = 'Set ' + st.set + ', Move ' + st.n + ': ' + lab;
        return lab;
      }
    }
    return 'Finished';
  }
  function lastMoveIdx() { var j, k = -1; for (j = 0; j < G.plan.length; j++) if (G.plan[j].t === 'move') k = j; return k; }
  function enter(step) {
    G.step = step;
    if (G.mode === 'day') {
      if (!G.recorded && G.i > lastMoveIdx()) { recordSession(false); G.recorded = true; }
      if (step.t !== 'finish') saveResume();
    }
    TESTLOG('step', step.t + (step.what && step.what !== 'move' ? ' ' + step.what : '') + (step.n ? ' m' + step.n : '') + (step.set ? ' s' + step.set : '') + (step.st ? ' ' + step.st.key : '') + (step.round ? ' r' + step.round : ''));
    stepEnter[step.t](step);
    if (G.ui && G.ui.skip) G.ui.skip.textContent = skipLabel();
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
      s.pel = 0; s.prep = 0; ui.phase.textContent = 'Warm-up';
      var q = s.parts[s.pi];
      s.said = s.pi;
      if (q.gap) Voice.say([q.cue], { urgent: true }); else if (S.talk) Voice.say([q.how], {});
      return;
    }
    enter(s);
  }
  var SKIP_PREP = 5;
  /* Skip only skips what is on screen; anything that leads into an exercise gets a short get-in-position wait */
  function skipPress() {
    if (!G.running || !G.step) return;
    var s = G.step;
    if (s.t === 'warmup') {
      if (s.prep > 0) return;
      if (s.listenWait !== null && s.listenWait !== undefined) {
        Voice.clear(); s.listenWait = null; s.said = -1; s.pel = 0; s.prep = SKIP_PREP;
        TESTLOG('skip', 'warm-talk'); return;
      }
      var p = s.parts[s.pi];
      if (p.gap) {
        if (p.sec - s.pel > SKIP_PREP) s.pel = p.sec - SKIP_PREP;
        TESTLOG('skip', 'warm-wait'); return;
      }
      var j = s.pi + 1;
      while (j < s.parts.length && s.parts[j].gap) j++;
      Voice.clear();
      if (j >= s.parts.length) { TESTLOG('skip', 'warm-end'); advance(); return; }
      if (s.parts[j - 1].gap) Voice.say([s.parts[j - 1].cue], { urgent: true });
      s.pi = j; s.pel = 0; s.said = -1; s.prep = SKIP_PREP;
      TESTLOG('skip', 'warm-part'); return;
    }
    if (s.t === 'ready') {
      if (s.listen && Voice.blockingPending() && s.listenWait < 120) {
        Voice.clear(); s.listenWait = 120; s.dur = SKIP_PREP; s.el = 0;
        TESTLOG('skip', 'talk'); return;
      }
      if (s.dur - s.el > SKIP_PREP) s.el = s.dur - SKIP_PREP;
      TESTLOG('skip', 'wait'); return;
    }
    advance();
  }
  function skipLabel() {
    var s = G.step;
    if (!s) return 'Skip';
    if (s.t === 'warmup') {
      if (s.prep > 0) return 'Skip wait';
      if (s.listenWait !== null && s.listenWait !== undefined) return 'Skip talk';
      var p = s.parts[s.pi];
      return p && p.gap ? 'Skip wait' : 'Skip part';
    }
    if (s.t === 'ready') return (s.listen && Voice.blockingPending() && s.listenWait < 120) ? 'Skip talk' : 'Skip wait';
    if (s.t === 'move' || s.t === 'stretch') return 'Skip move';
    if (s.t === 'rest') return 'Skip rest';
    return 'Skip';
  }
  function advance() {
    if (!G.running || !G.step) return;
    G.paused = false; Voice.paused = false;
    var prev = G.step;
    Voice.clear();
    if (G.finishSay && (prev.t === 'move' || prev.t === 'stretch' || prev.t === 'timer')) Voice.say([CUEBY.finished], { urgent: true, nocap: true });
    G.finishSay = false;
    if (prev.t === 'warmup') Voice.say([CUEBY['warmup-done']]);
    G.i++;
    if (G.i >= G.plan.length) { goHome(); return; }
    enter(G.plan[G.i]);
  }
  function plus10() {
    var s = G.step;
    if (!s || s.t === 'timer') return;
    if (s.t === 'ready' || s.t === 'practice') s.dur += N.plus;
    else if (s.t === 'warmup') s.parts[s.pi].sec += N.plus;
    else if (s.t === 'rest') { if (s.dur + N.plus <= N.restMax) s.dur += N.plus; }
    else if (s.frozen !== undefined) s.frozen += N.plus;
    TESTLOG('plus10');
  }
  function startPlan(plan, mode, opts) {
    if (mode !== 'timer' && !namedList().length) { showMsg('Open Settings (at the bottom) and type a name to begin.'); return; }
    Snd.unlock(); Voice.unlock(); lockScreen();
    Voice.clear();
    G.plan = plan; G.mode = mode; G.i = 0; G.running = true; G.cardioDone = null; G.lastMot = nowMs(); G.activeSec = 0;
    G.sid = null; G.recorded = false;
    if (mode === 'day') { G.walk = plan.filter(function (x) { return x.t === 'timer'; }).map(function (x) { return x.mins; })[0] || 0; }
    var at = (opts && opts.at) || 0;
    if (opts && opts.res) { G.activeSec = opts.res.sec || 0; G.sid = opts.res.sid || null; G.recorded = !!opts.res.rec; G.cardioDone = opts.res.cd || null; }
    G.i = at;
    enter(G.plan[at]);
  }
  function startDay() {
    if (!namedList().length) { showMsg('Open Settings (at the bottom) and type a name to begin.'); return; }
    timerSetup({ title: 'Walk today?', key: 'walk_min2', mins: C.cardio.mins, def: walkDefault(),
      go: [{ t: 'Walk (treadmill or outside)', fn: function (m) { clearResume(); startPlan(buildDay({ mins: m }), 'day'); } },
           { t: 'Skip', fn: function () { clearResume(); startPlan(buildDay(null), 'day'); }, noSave: true }] });
  }
  function startTimer(kind, mins) { startPlan([{ t: 'timer', kind: kind, mins: mins }, { t: 'finish', msg: 'Done' }], 'timer'); }
  function startCardio(kind, per, pids, opts) {
    var mins = Math.max.apply(null, pids.map(function (p) { return per[p]; }));
    startPlan([{ t: 'timer', kind: kind, mins: mins, per: per, pids: pids, opts: opts }, { t: 'finish', msg: 'Done' }], 'timer');
  }
  function startHip() {
    var p = [];
    addStretches(p, 'hip'); p.push({ t: 'finish', msg: 'Done' });
    startPlan(p, 'single');
  }
  function startSingle(kind, a) {
    var p;
    if (kind === 'warmup') p = [{ t: 'warmup' }, { t: 'finish', msg: 'Done' }];
    else if (kind === 'move') p = [{ t: 'ready', what: 'move', n: a, set: 1, single: true }, { t: 'move', n: a, set: 1, single: true }, { t: 'finish', msg: 'Done' }];
    else {
      var hip = C.hip.indexOf(a) >= 0, L = hip ? C.hip : C.stretches, k = L.indexOf(a), grp = hip ? 'hip' : 'cool';
      p = [{ t: 'ready', what: 'stretch', st: a, k: k, total: L.length, round: 1, rounds: 1, grp: grp, single: true }, { t: 'stretch', st: a, k: k, total: L.length, round: 1, rounds: 1, grp: grp, single: true }, { t: 'finish', msg: 'Done' }];
    }
    startPlan(p, 'single');
  }
  /* Resume: the place in a full day is saved at each step, kept for 12 hours */
  var RESUME_MS = 12 * 3600 * 1000;
  function saveResume() {
    var j = G.i;
    while (j > 0 && G.plan[j].t !== 'ready' && G.plan[j].t !== 'warmup' && G.plan[j].t !== 'practice' && G.plan[j].t !== 'rest') j--;
    store.set('resume', { day: S.day, walk: G.walk || 0, i: j, ts: Date.now(), setsHer: S.setsHer, setsHis: S.setsHis, rounds: S.rounds,
      sec: G.activeSec || 0, sid: G.sid, rec: !!G.recorded, cd: G.cardioDone, n: G.plan.length });
  }
  function clearResume() { store.set('resume', null); }
  function getResume() {
    var r = store.get('resume', null);
    if (!r || typeof r !== 'object' || !r.ts || Date.now() - r.ts > RESUME_MS) return null;
    if (!C.days.some(function (d) { return d.key === r.day; })) return null;
    return r;
  }
  function resumeLabel(r) {
    var p = r.plan[r.i], d = C.days.filter(function (x) { return x.key === r.day; })[0].title.split(':')[0];
    if (p.t === 'warmup' || p.t === 'practice') return d + ' \u00b7 Warm-up';
    if (p.t === 'rest') return d + ' \u00b7 Rest after set ' + p.set;
    if (p.what === 'move') return d + ' \u00b7 Move ' + p.n + ' of ' + C.days.filter(function (x) { return x.key === r.day; })[0].moves.length + ' \u00b7 Set ' + p.set + ' of ' + Math.max(r.setsHer, r.setsHis);
    if (p.what === 'walk') return d + ' \u00b7 Walk';
    if (p.what === 'stretch') return d + ' \u00b7 ' + (p.grp === 'hip' ? 'Hip Flexibility' : 'Cool-down') + ' \u00b7 Stretch ' + (p.k + 1) + ' of ' + p.total;
    return d;
  }
  function resumePlan(apply) {
    var r = getResume();
    if (!r) return null;
    var keep = { day: S.day, her: S.setsHer, his: S.setsHis, rounds: S.rounds };
    S.day = r.day; S.setsHer = r.setsHer; S.setsHis = r.setsHis; S.rounds = r.rounds;
    var plan = buildDay(r.walk ? { mins: r.walk } : null), ok = plan.length === r.n && r.i < plan.length;
    if (!ok || !apply) { S.day = keep.day; S.setsHer = keep.her; S.setsHis = keep.his; S.rounds = keep.rounds; }
    if (!ok) { clearResume(); return null; }
    r.plan = plan;
    return r;
  }
  function doResume() {
    var r = resumePlan(true);
    if (!r) { renderHome(); return; }
    store.set('day', r.day);
    startPlan(r.plan, 'day', { at: r.i, res: r });
  }
  function resumeCard() {
    var r = resumePlan(false);
    if (!r) return null;
    var lab = resumeLabel(r);
    return h('section', { class: 'today resume' }, h('h2', {}, 'Unfinished workout'), h('p', { class: 'tname' }, lab),
      h('button', { class: 'btn start', type: 'button', onclick: doResume }, 'Resume'),
      h('button', { class: 'btn alt small', type: 'button', onclick: function () { clearResume(); renderHome(); } }, 'Start over'));
  }
  window.__appBusy = function () { return !!G.running; };
  function goHome() {
    if (window.__updateReady) { location.reload(); return; }
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
    if (G.running && G.step && G.ui && G.ui.skip) { var sl = skipLabel(); if (G.ui.skip.textContent !== sl) G.ui.skip.textContent = sl; }
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

  function segOf(items, get, put, cls) {
    var wrap = h('div', { class: 'seg' + (cls ? ' ' + cls : '') }), btns = [];
    items.forEach(function (o) {
      var b = h('button', { class: 'btn small', type: 'button', 'aria-pressed': get() === o.v ? 'true' : 'false' }, o.t);
      b.onclick = function () { put(o.v); btns.forEach(function (x) { x.b.setAttribute('aria-pressed', get() === x.v ? 'true' : 'false'); }); };
      btns.push({ b: b, v: o.v }); wrap.appendChild(b);
    });
    return wrap;
  }
  function stepperOf(label, get, put, fmt, what, step) {
    var d = step || 1;
    var val = h('b', {}, fmt(get()));
    function set(v) { put(v); val.textContent = fmt(get()); }
    return h('div', { class: 'stepper' }, h('span', {}, label),
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'Less ' + what, onclick: function () { set(get() - d); } }, '−'),
      val,
      h('button', { class: 'btn alt small', type: 'button', 'aria-label': 'More ' + what, onclick: function () { set(get() + d); } }, '+'));
  }

  function slotBox(pid) {
    var nameIn = h('input', { type: 'text', id: pid + '-name', value: S[pid].name, autocomplete: 'off', placeholder: 'Name', 'aria-label': 'Name for ' + slotLabel(pid) });
    var sayIn = h('input', { type: 'text', id: pid + '-say', value: S[pid].say, autocomplete: 'off', placeholder: 'Say it as (optional)', 'aria-label': 'Say it as, for ' + slotLabel(pid) });
    nameIn.oninput = function () { S[pid].name = nameIn.value; store.set(pid + '_name', nameIn.value); showMsg(''); };
    sayIn.oninput = function () { S[pid].say = sayIn.value; store.set(pid + '_say', sayIn.value); };
    var box = h('div', { class: 'slot' }, h('h2', {}, slotLabel(pid)),
      h('label', { for: pid + '-name' }, 'Name'), nameIn,
      h('label', { for: pid + '-say' }, 'Say it as'), sayIn);
    box.appendChild(h('label', {}, 'Sets'));
    box.appendChild(segOf(N.sets.map(function (v) { return { t: v + (v === 1 ? ' set' : ' sets'), v: v }; }),
      function () { return maxSetsFor(pid); },
      function (v) { if (pid === 'her') { S.setsHer = v; store.set('her_sets', v); } else { S.setsHis = v; store.set('his_sets', v); } }, 'setseg'));
    box.appendChild(h('p', { class: 'sub' }, 'Week ' + WEEK + ': ' + setsForWeek(WEEK) + ' sets suggested'));
    return box;
  }

  var workBox = null, openMoves = {};
  function rowBtn(num, lines, onclick) {
    return h('button', { class: 'row', type: 'button', onclick: onclick },
      h('span', { class: 'n' }, num), h('span', { class: 't' }, lines));
  }
  /* each person's ladder step and number picks under a move */
  function moveControls(m, pids, who) {
    var wrap = h('div', { class: 'ctls' });
    pids.forEach(function (pid) {
      var slot = m[pid], R = resolve(m, pid), lad = C.ladders[slot.ladder], label = who.length ? shownName(pid) : (pid === 'her' ? 'Her' : 'His');
      var sel = h('select', { 'aria-label': label + ': step for ' + lad.short });
      lad.steps.forEach(function (st) { sel.appendChild(h('option', { value: String(st.n) }, st.n + '. ' + st.name + (st.n === slot.start ? ' (start)' : ''))); });
      sel.value = String(R.step);
      sel.onchange = function () { setStepFor(pid, slot, parseInt(sel.value, 10)); renderRows(); };
      var line = h('div', { class: 'ctl' }, h('span', { class: 'cwho' }, label + ' step:'), sel);
      var pick = null, pick2 = null;
      if (R.kind === 'reps') pick = stepperOf('Reps:', function () { return repsOf(pid, slot.ladder); }, function (v) { setRepsOf(pid, slot.ladder, v); }, String, label + ' reps');
      else if (R.kind === 'taps') pick = stepperOf('Reps per side:', function () { return repsOf(pid, slot.ladder); }, function (v) { setRepsOf(pid, slot.ladder, v); }, String, label + ' reps');
      else if (R.kind === 'plank') pick = stepperOf('Plank:', function () { return plankOf(pid); }, function (v) { setPlankOf(pid, v); }, function (v) { return v + ' sec'; }, label + ' plank seconds', N.plankStep);
      else pick = stepperOf('Holds:', function () { return holdPatOf(pid, slot.ladder); }, function (v) { setHoldPatOf(pid, slot.ladder, v); renderRows(); }, function (v) { return N.holdPatterns[v].join('-'); }, label + ' holds pattern');
      if (R.cfg.longLast) pick2 = stepperOf('Long hold:', function () { return ytLongOf(pid); }, function (v) { setYtLongOf(pid, v); }, function (v) { return v + ' sec'; }, label + ' long hold seconds', 5);
      wrap.appendChild(h('div', { class: 'ctlrow' }, line, pick, pick2));
    });
    return wrap;
  }
  function renderRows() {
    if (!workBox || !workBox.rows.isConnected) return;
    var who = namedList();
    var pids = who.length ? who : ['her', 'his'];
    workBox.box.textContent = '';
    var dy = curDay();
    function bl(t) { workBox.box.appendChild(h('p', { class: 'boxline' }, t)); }
    if (named('her') && !named('his')) dy.boxHer.forEach(bl);
    else if (named('his') && !named('her')) dy.box.forEach(bl);
    else {
      var lab = function (t) { return t.split(':')[0]; }, herBy = {};
      dy.boxHer.forEach(function (t) { herBy[lab(t)] = t; });
      dy.box.forEach(function (line) {
        var hr = herBy[lab(line)];
        if (line === hr) bl(line);
        else { bl('His: ' + line); if (hr) bl('Hers: ' + hr); }
      });
    }
    workBox.rows.textContent = '';
    curMoves().forEach(function (m) {
      var lines = pids.map(function (pid) {
        var R = resolve(m, pid);
        return h('span', { class: 'who' }, (who.length ? shownName(pid) : slotLabel(pid)) + ': ' + R.name + ' · ' + R.amount);
      });
      var ctl = moveControls(m, pids, who);
      ctl.appendChild(h('button', { class: 'btn alt small', type: 'button', onclick: function () { startSingle('move', m.n); } }, 'Do this move alone'));
      ctl.hidden = !openMoves[S.day + m.n];
      var row = h('button', { class: 'row', type: 'button', 'aria-expanded': ctl.hidden ? 'false' : 'true' }, h('span', { class: 'n' }, String(m.n)), h('span', { class: 't' }, lines));
      row.onclick = function () { ctl.hidden = !ctl.hidden; openMoves[S.day + m.n] = !ctl.hidden; row.setAttribute('aria-expanded', ctl.hidden ? 'false' : 'true'); };
      workBox.rows.appendChild(row);
      workBox.rows.appendChild(ctl);
    });
  }

  function voiceBox() {
    var speedRow = segOf(SPEEDNAMES.map(function (n, i) { return { t: n, v: i }; }), function () { return S.vspeed; }, function (v) { S.vspeed = v; store.set('vspeed', v); }, 'vseg');
    var test = h('button', { class: 'btn alt small', type: 'button', onclick: function () {
      Voice.unlock(); Voice.clear();
      Voice.picked = null; Voice.voice();
      Voice.say([{ text: 'This is how the voice sounds.' }], { urgent: true, nocap: true });
    } }, 'Test voice');
    return h('section', { class: 'sec voicebox' }, h('h2', {}, 'Voice'),
      h('label', {}, 'Speed'), speedRow,
      h('label', {}, 'Spoken instructions (how to do each move)'),
      segOf([{ t: 'On', v: 1 }, { t: 'Off', v: 0 }], function () { return S.talk; }, function (v) { S.talk = v; store.set('talk', v); }),
      h('div', { class: 'vtest' }, test));
  }
  function settingsBox() {
    return h('section', { class: 'sec voicebox' }, h('h2', {}, 'Pace, rep speed and rounds'),
      h('label', {}, 'Pace (time to get ready and to switch sides)'),
      segOf(N.paceNames.map(function (n, i) { return { t: n, v: i }; }), function () { return S.pace; }, function (v) { S.pace = v; store.set('pace', v); }),
      h('label', {}, 'Rep speed (reps, and the circuit)'),
      segOf(N.paceNames.map(function (n, i) { return { t: n, v: i }; }), function () { return S.repspeed; }, function (v) { S.repspeed = v; store.set('repspeed', v); }),
      h('label', {}, 'Rounds (cool-down and Hip Flexibility)'),
      segOf(N.rounds.map(function (v) { return { t: v + (v === 1 ? ' round' : ' rounds'), v: v }; }), function () { return S.rounds; }, function (v) { S.rounds = v; store.set('rounds', v); }));
  }

  function timerSetup(o) {
    var pick = minsGet(o.key, o.mins, o.def);
    var wrap = segOf(o.mins.map(function (v) { return { t: v + ' min', v: v }; }), function () { return pick; }, function (v) { pick = v; }, 'wrap');
    appEl.textContent = '';
    appEl.appendChild(h('div', { class: 'screen' },
      h('h1', {}, o.title), o.sub ? h('p', { class: 'sub' }, o.sub) : null,
      h('label', { class: 'sub' }, 'Minutes'), wrap,
      o.go.map(function (g) { return h('button', { class: 'btn start', type: 'button', onclick: function () { if (o.key && !g.noSave) minsSet(o.key, pick); if (g.fn) g.fn(pick); else startTimer(g.kind, pick); } }, g.t); }),
      h('button', { class: 'btn alt start', type: 'button', onclick: renderHome }, 'Back')));
  }
  function renderWalk() { timerSetup({ title: 'Walk', key: 'walk_min2', mins: C.cardio.mins, def: walkDefault(), go: [{ t: 'Start walk', kind: 'walk' }] }); }

  /* cardio: minutes for each person, circuit settings, then the kind */
  function renderCardio() {
    var cc = C.cardio, circ = cc.circuit, who = namedList(), wd = new Date().getDay();
    var pids = who.length ? who : ['her'], picks = {};
    pids.forEach(function (pid) { picks[pid] = minsGet('cm_' + pid + '_' + wd, cc.mins.concat([0]), isRestDay() ? 0 : cardioDefault(pid)); });
    var opt = {
      reps: clampInt(store.get('circ_reps', circ.repsDefault), 15, 24, circ.repsDefault),
      jog: circ.jog.indexOf(store.get('circ_jog', 0)) >= 0 ? store.get('circ_jog', 0) : circ.jogDefault,
      stepSec: circ.stepSec.indexOf(store.get('circ_step', 0)) >= 0 ? store.get('circ_step', 0) : circ.stepDefault
    };
    function go(kind) {
      var use = (kind === 'vr' ? ['his'] : pids).filter(function (pid) { return picks[pid] > 0; });
      pids.forEach(function (pid) { minsSet('cm_' + pid + '_' + wd, picks[pid]); });
      if (!use.length) { cmsg.hidden = false; return; }
      store.set('circ_reps', opt.reps); store.set('circ_jog', opt.jog); store.set('circ_step', opt.stepSec);
      startCardio(kind, picks, use, { reps: opt.reps, jog: opt.jog, stepSec: opt.stepSec });
    }
    var cmsg = h('p', { class: 'msg', role: 'alert', hidden: true }, 'Pick the minutes for whoever is doing cardio.');
    cmsg.style.fontWeight = '700'; cmsg.style.color = '#b42318';
    var kids = [h('h1', {}, 'Cardio'), h('p', { class: 'sub' }, 'Pick the minutes, then what you are doing. On a rest day, pick Rest.'), cmsg];
    pids.forEach(function (pid) {
      kids.push(h('label', { class: 'sub' }, who.length ? shownName(pid) + ': minutes' : 'Minutes'));
      kids.push(segOf([{ t: 'Rest', v: 0 }].concat(cc.mins.map(function (v) { return { t: v + ' min', v: v }; })), function () { return picks[pid]; }, function (v) { picks[pid] = v; cmsg.hidden = true; }, 'wrap'));
    });
    kids.push(h('h2', {}, circ.title));
    kids.push(h('p', { class: 'sub' }, circ.intro[1]));
    kids.push(h('ul', { class: 'sub circbul' }, circ.bullets.map(function (b) { return h('li', {}, b); })));
    kids.push(h('label', { class: 'sub' }, 'Circuit: reps for each move'));
    kids.push(segOf(circ.reps.map(function (v) { return { t: String(v), v: v }; }), function () { return opt.reps; }, function (v) { opt.reps = v; }, 'wrap'));
    kids.push(h('label', { class: 'sub' }, 'Circuit: jog between moves'));
    kids.push(segOf(circ.jog.map(function (v) { return { t: v + ' sec', v: v }; }), function () { return opt.jog; }, function (v) { opt.jog = v; }));
    kids.push(h('label', { class: 'sub' }, 'Circuit: Fast Step-Ups'));
    kids.push(segOf(circ.stepSec.map(function (v) { return { t: v + ' sec', v: v }; }), function () { return opt.stepSec; }, function (v) { opt.stepSec = v; }));
    kids.push(h('p', { class: 'sub' }, "Then tap what you're doing to start:"));
    kids.push(h('button', { class: 'btn start', type: 'button', onclick: function () { go('tread'); } }, 'Treadmill'));
    kids.push(h('button', { class: 'btn start', type: 'button', onclick: function () { go('circuit'); } }, circ.title));
    if (named('his')) {
      kids.push(h('button', { class: 'btn start', type: 'button', onclick: function () { go('vr'); } }, 'VR combat'));
      kids.push(h('p', { class: 'sub' }, 'VR combat uses his minutes only.'));
    }
    kids.push(h('button', { class: 'btn alt start', type: 'button', onclick: renderHome }, 'Back'));
    appEl.textContent = '';
    appEl.appendChild(h('div', { class: 'screen' }, kids));
  }

  /* every version of each move, easiest to hardest */
  function renderLadders() {
    appEl.textContent = '';
    var pid = (named('her') && !named('his')) ? 'her' : 'his';
    var blocks = C.ladderOrder.map(function (lk) {
      var lad = C.ladders[lk];
      return h('section', { class: 'sec work' }, h('h2', {}, lad.title + (lad.only ? (lad.only === 'his' ? ' (his)' : ' (hers)') : '')),
        lad.steps.map(function (st) {
          return h('div', { class: 'ladstep' }, h('b', {}, 'Step ' + st.n + ' · ' + st.name), h('p', {}, howText(st, lad.only || pid)),
            st.note !== '—' ? h('p', { class: 'sub' }, 'Note: ' + st.note) : null);
        }));
    });
    appEl.appendChild(h('div', { class: 'screen' }, h('h1', {}, 'Move Ladders'),
      C.ladderIntro.map(function (t) { return h('p', { class: 'sub' }, t); }), blocks,
      h('button', { class: 'btn start', type: 'button', onclick: renderHome }, 'Back')));
  }

  /* a box that starts closed and opens with a tap */
  function foldBox(cls, title, kids, openNow) {
    var body = h('div', { class: 'foldbody' }, kids);
    var head = h('button', { class: 'foldhead', type: 'button', 'aria-expanded': openNow ? 'true' : 'false' }, h('span', {}, title), h('span', { class: 'chev', 'aria-hidden': 'true' }, openNow ? '−' : '+'));
    body.hidden = !openNow;
    head.onclick = function () {
      body.hidden = !body.hidden;
      head.setAttribute('aria-expanded', body.hidden ? 'false' : 'true');
      head.lastChild.textContent = body.hidden ? '+' : '−';
    };
    return h('section', { class: 'sec fold ' + cls }, head, body);
  }

  /* what today is: Mon/Wed/Fri strength, Tue/Thu/Sat cardio, Sun rest */
  var TODAYDAY = { 1: 'A', 3: 'B', 5: 'C' };
  function todayCard() {
    var wd = new Date().getDay(), card = h('section', { class: 'today' });
    if (TODAYDAY[wd]) {
      var d = C.days.filter(function (x) { return x.key === TODAYDAY[wd]; })[0];
      card.appendChild(h('h2', {}, 'Today'));
      card.appendChild(h('p', { class: 'tname' }, d.title));
      card.appendChild(h('p', { class: 'sub' }, d.subtitle));
      card.appendChild(h('button', { class: 'btn start', type: 'button', onclick: function () { S.day = d.key; store.set('day', d.key); startDay(); } }, 'Start ' + d.title.split(':')[0]));
    } else if (isRestDay()) {
      card.appendChild(h('h2', {}, 'Today'));
      card.appendChild(h('p', { class: 'tname' }, 'Rest day'));
      card.appendChild(h('button', { class: 'btn start', type: 'button', onclick: startHip }, 'Hip Flexibility'));
    } else {
      card.appendChild(h('h2', {}, 'Today'));
      card.appendChild(h('p', { class: 'tname' }, 'Cardio'));
      card.appendChild(h('button', { class: 'btn start', type: 'button', onclick: renderCardio }, 'Start cardio'));
    }
    return card;
  }

  function renderSettings() {
    appEl.textContent = '';
    appEl.appendChild(h('div', { class: 'screen' }, h('h1', {}, 'Settings'),
      h('div', { class: 'slots' }, slotBox('her'), slotBox('his')),
      settingsBox(), voiceBox(),
      h('button', { class: 'btn start', type: 'button', onclick: renderHome }, 'Back')));
  }

  function renderHome() {
    appEl.textContent = '';
    var root = h('div', { class: 'screen' });
    msgEl = h('p', { class: 'msg', role: 'alert', hidden: true });
    msgEl.style.fontWeight = '700'; msgEl.style.color = '#b42318';
    var rc = resumeCard();
    if (rc) root.appendChild(rc);
    root.appendChild(todayCard());
    root.appendChild(msgEl);
    var picker = h('div', { class: 'days', role: 'group', 'aria-label': 'Choose a day' });
    C.days.forEach(function (d) {
      picker.appendChild(h('button', { class: 'btn day', type: 'button', 'aria-pressed': d.key === S.day ? 'true' : 'false',
        onclick: function () { S.day = d.key; store.set('day', d.key); renderHome(); } }, d.title));
    });
    root.appendChild(picker);
    root.appendChild(h('p', { class: 'hist' }, histLine()));
    root.appendChild(h('p', { class: 'sub' }, curDay().subtitle));

    // warm-up
    var wr = h('div', { class: 'rows' });
    wr.appendChild(rowBtn('', [h('span', {}, C.warmup.text)], function () { startSingle('warmup'); }));
    root.appendChild(foldBox('warm', 'Warm-up', [wr, h('p', { class: 'sub' }, C.warmup.practice)], false));

    // workout
    var kr = h('div', { class: 'rows' }), kb = h('div', { class: 'boxlines' });
    workBox = { rows: kr, box: kb };
    root.appendChild(foldBox('work', 'Workout', [kb, h('p', { class: 'sub tiphint' }, 'Tap a move to change its step, reps, or holds.'), kr], false));

    // cool-down
    var cr = h('div', { class: 'rows' });
    C.stretches.forEach(function (st, k) { cr.appendChild(rowBtn(String(k + 1), st.name, function () { startSingle('stretch', st); })); });
    root.appendChild(foldBox('cool', 'Cool-down', curDay().cool.map(function (t) { return h('p', { class: 'sub' }, t); }).concat([cr]), false));

    // Hip Flexibility
    var hr = h('div', { class: 'rows' });
    C.hip.forEach(function (st, k) { hr.appendChild(rowBtn(String(k + 1), st.name, function () { startSingle('stretch', st); })); });
    root.appendChild(foldBox('cool', 'Hip Flexibility stretches', [h('button', { class: 'btn start', type: 'button', onclick: startHip }, 'Hip Flexibility'), hr], false));

    root.appendChild(h('button', { class: 'btn start', type: 'button', onclick: startDay }, 'Start ' + curDay().title.split(':')[0]));

    // verse
    var vtxt = h('div', {}, C.verses[S.verse].text);
    root.appendChild(h('div', { class: 'verse' }, vtxt,
      h('button', { class: 'btn alt small', type: 'button', onclick: function () {
        S.verse = (S.verse + 1) % C.verses.length; store.set('verse', S.verse); vtxt.textContent = C.verses[S.verse].text;
      } }, 'Next verse')));
    var links = h('div', { class: 'links' });
    [['Cardio', renderCardio], ['Walk', renderWalk], ['Move Ladders', renderLadders], ['Before You Start', renderSafety], ['Past sessions', renderHistory], ['Settings', renderSettings]].forEach(function (l) {
      links.appendChild(h('div', {}, h('button', { class: 'link', type: 'button', onclick: l[1] }, l[0])));
    });
    root.appendChild(links);
    appEl.appendChild(root);
    renderRows();
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
  /* a full day counts once the last set is done; the walk and the cool-down are added to the same entry if done */
  function recordSession(cool) {
    try {
      var l = histList(), e = null, i;
      if (G.sid) for (i = 0; i < l.length; i++) if (l[i].sid === G.sid) { e = l[i]; break; }
      if (!e) {
        var now = new Date().toISOString();
        G.sid = G.sid || now;
        e = { d: now, sid: G.sid, day: S.day };
        if (named('her')) e.her = S.setsHer;
        if (named('his')) e.his = S.setsHis;
        l.unshift(e);
        var c = histCounts(), k = c[S.day] || { n: 0, last: '' };
        c[S.day] = { n: (k.n || 0) + 1, last: now };
        store.set('hist_counts', c);
      }
      e.min = Math.max(1, Math.round((G.activeSec || 0) / 60));
      if (G.cardioDone) { e.c = G.cardioDone.k; e.cm = G.cardioDone.m; }
      if (cool) e.cool = true;
      store.set('hist', l.slice(0, 30));
    } catch (e2) { /* ignore */ }
  }
  var KIND = { walk: 'Walk', tread: 'Treadmill', circuit: 'No-Treadmill Circuit', vr: 'VR combat' };
  function recordTimer(s) {
    try {
      var l = histList(); l.unshift({ d: new Date().toISOString(), t: s.kind, min: s.mins }); store.set('hist', l.slice(0, 30));
    } catch (e2) { /* ignore */ }
  }
  function histLine() {
    var k = histCounts()[S.day];
    var nm = curDay().title.split(':')[0] + ': ';
    if (!k || !k.n) return nm + 'not done yet';
    return nm + 'done ' + k.n + (k.n === 1 ? ' time' : ' times') + ' \u00b7 Last: ' + dayLabel(k.last, false);
  }
  function renderHistory() {
    appEl.textContent = '';
    var l = histList(), armed = false, tm = null;
    var rows = h('div', { class: 'rows' });
    if (!l.length) rows.appendChild(h('p', { class: 'sub' }, 'No sessions yet.'));
    l.forEach(function (e) {
      var bits = e.t ? [dayLabel(e.d, true), (KIND[e.t] || 'Cardio') + ' \u00b7 ' + e.min + ' min'] : [dayLabel(e.d, true), 'Day ' + e.day, e.min + ' min'];
      if (e.c && KIND[e.c]) bits.push(KIND[e.c] + ' ' + e.cm + ' min');
      if (e.cool) bits.push('Cool-down done');
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
  if (TEST) window.__app = { mkTrack: mkTrack, mkStretchTrack: mkStretchTrack, curMoves: curMoves, S: S, G: G, Voice: Voice, Snd: Snd, N: N, C: C, startDay: startDay, resolve: resolve, histLine: histLine, togglePause: togglePause, startSingle: startSingle, startTimer: startTimer, startCardio: startCardio, startHip: startHip, repeatStep: repeatStep, planWeek: planWeek, bracket: bracket, setsForWeek: setsForWeek, histList: histList, renderHome: renderHome, renderSettings: renderSettings, doResume: doResume, getResume: getResume, renderCardio: renderCardio, isRestDay: isRestDay, holdPatOf: holdPatOf, ytLongOf: ytLongOf, advance: advance, store: store, windowLeft: windowLeft, cyclePace: cyclePace, cardioDefault: cardioDefault, walkDefault: walkDefault, buildDay: buildDay };
  if (store.get('safety_ok', false)) renderHome(); else renderSafety();
})();
