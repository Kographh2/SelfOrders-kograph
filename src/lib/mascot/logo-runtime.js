// Generated from the supplied logo studio. Speed is fixed at 1x.
export function createLuuLogo(el, options = {}) {
  if(!el.animate)return {destroy(){}};
  'use strict';
  var W = 2172, H = 724, OV = 7;
  var EDGES = [[[203, 0], [203, 724]], [[436, 0], [440, 300], [446, 360], [462, 480], [505, 545], [540, 582], [560, 724]], [[758, 0], [758, 330], [750, 470], [756, 560], [758, 724]], [[1030, 0], [1026, 150], [1045, 300], [1050, 420], [975, 470], [955, 540], [975, 620], [990, 724]], [[1232, 0], [1230, 280], [1210, 360], [1185, 500], [1180, 560], [1205, 610], [1230, 724]], [[1462, 0], [1466, 260], [1470, 390], [1458, 540], [1458, 724]], [[1700, 0], [1700, 200], [1712, 330], [1712, 480], [1720, 560], [1722, 724]], [[1975, 0], [1975, 150], [1978, 250], [1985, 300], [2007, 340], [2055, 425], [2172, 425], [2172, 724]]];
  var SPLASH = [[[0, 0], [206, 0], [206, 724], [0, 724]], [[1975, 150], [2172, 150], [2172, 425], [2055, 425], [2007, 340], [1985, 300], [1978, 250]]];
  var OX = [14.7, 27.5, 41, 52, 62, 73, 87];
  var NAMES = ['L', 'U1', 'U2', 'J', 'A1', 'A2', 'A3'];
  var DEFAULTS = { src: 'luujaaa-logo.png', enterDuration: 480, enterStagger: 100, exitDuration: 300, exitStagger: 80,
    hold: 1400, autoplay: true, autoExit: false, loop: false, reducedMotion: 'auto', speed: 1, onState: null };

  function pt(p, dx) { return ((p[0] + (dx || 0)) / W * 100).toFixed(3) + '% ' + (p[1] / H * 100).toFixed(3) + '%'; }
  function clip(pts) { return 'polygon(' + pts.join(',') + ')'; }
  function letterClip(i) {
    var l = EDGES[i].map(function (p) { return pt(p); });
    var r = EDGES[i + 1].slice().reverse().map(function (p) { return pt(p, i < 6 ? OV : 0); });
    return clip(l.concat(r));
  }

  function Logo(el, opts) {
    var d = el.dataset, c = {};
    Object.keys(DEFAULTS).forEach(function (k) {
      var v = d['luu' + k.charAt(0).toUpperCase() + k.slice(1)];
      if (v == null) return;
      c[k] = typeof DEFAULTS[k] === 'number' ? +v : typeof DEFAULTS[k] === 'boolean' ? v !== 'false' : v;
    });
    if (d.src) c.src = d.src;
    this.cfg = Object.assign({}, DEFAULTS, c, opts || {});
    this.el = el; this.speed = this.cfg.speed; this._anims = []; this._tok = 0; this._seq = 0; this._state = 'hidden'; this._pending = null;
    this._build();
    this._set('hidden');
    var self = this;
    this.ready = Promise.all(this.layers.map(function (i) { return i.decode ? i.decode().catch(function () {}) : 0; })).then(function () {
      if (self.cfg.autoplay && !self._used) { if (self.cfg.autoExit || self.cfg.loop) self.play(); else self.enter(); }
      return self;
    });
  }
  var P = Logo.prototype;

  P._build = function () {
    var el = this.el, cfg = this.cfg;
    el.classList.add('luu'); el.setAttribute('role', 'img'); el.setAttribute('aria-label', 'LUUJAAA');
    el.textContent = '';
    var stage = document.createElement('div'); stage.className = 'luu-stage'; el.appendChild(stage);
    this.stage = stage; this.letters = []; this.splash = [];
    function mk(clipPath, ox, tag) {
      var im = new Image(); im.className = 'luu-layer'; im.alt = ''; im.draggable = false; im.decoding = 'async';
      im.setAttribute('aria-hidden', 'true'); im.src = cfg.src; im.dataset.k = tag;
      im.style.clipPath = clipPath; im.style.webkitClipPath = clipPath; im.style.setProperty('--ox', ox + '%');
      stage.appendChild(im); return im;
    }
    var rect = function (a) { return clip(a.map(function (p) { return pt(p); })); };
    this.splash.push(mk(rect(SPLASH[0]), 7.4, 'splash-l'));
    for (var i = 0; i < 7; i++) this.letters.push(mk(letterClip(i), OX[i], NAMES[i]));
    this.splash.push(mk(rect(SPLASH[1]), 94, 'splash-r'));
    this.layers = [this.splash[0]].concat(this.letters, [this.splash[1]]);
  };

  P._set = function (s) {
    this._state = s; this.el.dataset.state = s;
    this.el.dispatchEvent(new CustomEvent('luujaaa:state', { detail: { state: s }, bubbles: true }));
    if (typeof this.cfg.onState === 'function') this.cfg.onState(s);
  };
  Object.defineProperty(P, 'state', { get: function () { return this._state; } });
  P._reduced = function () {
    var m = this.cfg.reducedMotion;
    return m === 'always' || (m === 'auto' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  };
  P._clear = function () {
    clearTimeout(this._t); this._t = null;
    if (this._wr) { var r = this._wr; this._wr = null; r(); }
    this._anims.forEach(function (a) { try { a.cancel(); } catch (e) {} });
    this._anims = [];
  };
  P._wait = function (ms) {
    var self = this;
    return new Promise(function (r) { self._wr = r; self._t = setTimeout(function () { self._wr = null; r(); }, ms / self.speed); });
  };
  P._anim = function (el, kf, o) {
    var a = el.animate(kf, Object.assign({ fill: 'both' }, o)); this._anims.push(a); return a;
  };

  P._play = function (kind) {
    var self = this, c = this.cfg, sp = this.speed, enter = kind === 'enter', n = 7;
    var snap = this.layers.map(function (l) { var s = getComputedStyle(l); return { o: s.opacity, t: s.transform }; });
    this._clear();
    var tok = ++this._tok;
    this._set(enter ? 'entering' : 'exiting');
    var reduced = this._reduced(), end = enter ? 1 : 0;
    var dur = (enter ? c.enterDuration : c.exitDuration) / sp, st = (enter ? c.enterStagger : c.exitStagger) / sp;
    var ease = enter ? 'cubic-bezier(.22,.85,.3,1)' : 'cubic-bezier(.45,0,.9,.5)';

    if (reduced) {
      this.layers.forEach(function (l, i) { self._anim(l, [{ opacity: snap[i].o }, { opacity: end }], { duration: 220 / sp, easing: 'ease-out' }); });
    } else {
      var order = enter ? [0, 1, 2, 3, 4, 5, 6] : [6, 5, 4, 3, 2, 1, 0];
      order.forEach(function (li, k) {
        var el = self.letters[li], s = snap[li + 1], delay = k * st, kf;
        if (enter && parseFloat(s.o) < 0.01) {
          kf = [{ opacity: 0, transform: 'translate3d(-2.4%,0,0) scale(.94)', easing: 'cubic-bezier(.2,.8,.3,1)' },
                { opacity: 1, transform: 'translate3d(.2%,0,0) scale(1.02)', offset: .58, easing: 'cubic-bezier(.4,0,.3,1)' },
                { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }];
        } else if (enter) {
          kf = [{ opacity: s.o, transform: s.t }, { opacity: 1, transform: 'translate3d(0,0,0) scale(1)' }];
        } else {
          kf = [{ opacity: s.o, transform: s.t }, { opacity: 0, transform: 'translate3d(-1.8%,0,0) scale(.97)' }];
        }
        self._anim(el, kf, { duration: dur, delay: delay, easing: ease });
      });
      var tail = (n - 1) * st;
      this.splash.forEach(function (el, j) {
        var s = snap[j === 0 ? 0 : 8];
        if (enter) self._anim(el, [{ opacity: s.o, transform: s.t === 'none' ? 'scale(.6)' : s.t }, { opacity: 1, transform: 'scale(1)' }],
          { duration: 200 / sp, delay: tail + dur * .8, easing: 'cubic-bezier(.2,.9,.3,1.2)' });
        else self._anim(el, [{ opacity: s.o, transform: s.t }, { opacity: 0, transform: 'scale(.85)' }],
          { duration: 240 / sp, delay: tail, easing: 'ease-in' });
      });
      if (enter && snap.every(function (s) { return parseFloat(s.o) < 0.01; }))
        this._anim(this.stage, [{ transform: 'scale(1.01)' }, { transform: 'scale(1)' }],
          { duration: 200 / sp, delay: tail + dur * .8, easing: 'ease-out', fill: 'backwards' });
    }
    var p = Promise.all(this._anims.map(function (a) { return a.finished; })).then(function () {
      if (tok !== self._tok) return false;
      self._set(enter ? 'visible' : 'hidden'); self._clear(); self._pending = null; return true;
    }, function () { return false; });
    this._pending = { kind: kind, promise: p };
    return p;
  };

  P._enter = function () {
    if (this._state === 'visible') return Promise.resolve(true);
    if (this._state === 'entering' && this._pending) return this._pending.promise;
    return this._play('enter');
  };
  P._exit = function () {
    if (this._state === 'hidden') return Promise.resolve(true);
    if (this._state === 'exiting' && this._pending) return this._pending.promise;
    return this._play('exit');
  };
  P._cancelSeq = function () { this._used = true; this._seq++; };
  P.enter = function () { this._cancelSeq(); return this._enter(); };
  P.exit = function () { this._cancelSeq(); return this._exit(); };
  // enter → hold → exit (→ ulang bila loop)
  P.play = function () {
    var self = this, s = ++this._seq; this._used = true;
    return (async function run() {
      await self._enter(); if (s !== self._seq) return false;
      await self._wait(self.cfg.hold); if (s !== self._seq) return false;
      await self._exit(); if (s !== self._seq) return false;
      if (self.cfg.loop) { await self._wait(350); if (s !== self._seq) return false; return run(); }
      return true;
    })();
  };
  P.reset = function () { this._cancelSeq(); this._tok++; this._clear(); this._pending = null; this._set('hidden'); return this; };
  P.replay = function () { this.reset(); return this.play(); };
  // Selesaikan transisi yang sedang berjalan seketika (hold/loop dibatalkan).
  P.skip = function () {
    this._cancelSeq();
    var s = this._state;
    if (s === 'entering' || s === 'exiting') { this._tok++; this._clear(); this._pending = null; this._set(s === 'entering' ? 'visible' : 'hidden'); }
    return this;
  };
  P.setSpeed = function (v) { this.speed = Math.max(.1, +v || 1); return this; };
  P.destroy = function () { this.reset(); this.el.textContent = ''; };


  const media=window.matchMedia('(prefers-reduced-motion: reduce)');
  const logo=new Logo(el,{src:options.src||'/brand/luujaaa-logo.webp',speed:1,autoplay:false,loop:Boolean(options.loop)});
  let disposed=false;
  function update(){
    logo.reset();
    if(disposed)return;
    if(options.reducedMotion||media.matches||document.hidden){logo._set('visible');return;}
    if(options.loop)void logo.play();else void logo.enter();
  }
  // Paint a complete logo while the local image decodes, including slow devices.
  logo._set('visible');logo.ready.then(()=>{if(!disposed)update();});
  media.addEventListener('change',update);document.addEventListener('visibilitychange',update);
  return {destroy(){disposed=true;media.removeEventListener('change',update);document.removeEventListener('visibilitychange',update);logo.destroy();}};
}
