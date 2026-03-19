var Nt = Object.defineProperty;
var Pt = (e, t, n) =>
  t in e
    ? Nt(e, t, { enumerable: !0, configurable: !0, writable: !0, value: n })
    : (e[t] = n);
var Be = (e, t, n) => Pt(e, typeof t != "symbol" ? t + "" : t, n);
(function () {
  const t = document.createElement("link").relList;
  if (t && t.supports && t.supports("modulepreload")) return;
  for (const s of document.querySelectorAll('link[rel="modulepreload"]')) a(s);
  new MutationObserver((s) => {
    for (const r of s)
      if (r.type === "childList")
        for (const c of r.addedNodes)
          c.tagName === "LINK" && c.rel === "modulepreload" && a(c);
  }).observe(document, { childList: !0, subtree: !0 });
  function n(s) {
    const r = {};
    return (
      s.integrity && (r.integrity = s.integrity),
      s.referrerPolicy && (r.referrerPolicy = s.referrerPolicy),
      s.crossOrigin === "use-credentials"
        ? (r.credentials = "include")
        : s.crossOrigin === "anonymous"
          ? (r.credentials = "omit")
          : (r.credentials = "same-origin"),
      r
    );
  }
  function a(s) {
    if (s.ep) return;
    s.ep = !0;
    const r = n(s);
    fetch(s.href, r);
  }
})();
const Ut = !1,
  $t = (e, t) => e === t,
  W = Symbol("solid-proxy"),
  Ie = Symbol("solid-track"),
  fe = { equals: $t };
let ae = null,
  at = ot;
const $ = 1,
  xe = 2,
  st = { owned: null, cleanups: null, context: null, owner: null };
var v = null;
let Ce = null,
  Tt = null,
  k = null,
  C = null,
  L = null,
  ve = 0;
function me(e, t) {
  const n = k,
    a = v,
    s = e.length === 0,
    r = t === void 0 ? a : t,
    c = s
      ? st
      : {
          owned: null,
          cleanups: null,
          context: r ? r.context : null,
          owner: r,
        },
    l = s ? e : () => e(() => T(() => re(c)));
  ((v = c), (k = null));
  try {
    return J(l, !0);
  } finally {
    ((k = n), (v = a));
  }
}
function E(e, t) {
  t = t ? Object.assign({}, fe, t) : fe;
  const n = {
      value: e,
      observers: null,
      observerSlots: null,
      comparator: t.equals || void 0,
    },
    a = (s) => (typeof s == "function" && (s = s(n.value)), lt(n, s));
  return [ct.bind(n), a];
}
function De(e, t, n) {
  const a = we(e, t, !1, $);
  le(a);
}
function H(e, t, n) {
  at = Wt;
  const a = we(e, t, !1, $);
  ((a.user = !0), L ? L.push(a) : le(a));
}
function M(e, t, n) {
  n = n ? Object.assign({}, fe, n) : fe;
  const a = we(e, t, !0, 0);
  return (
    (a.observers = null),
    (a.observerSlots = null),
    (a.comparator = n.equals || void 0),
    le(a),
    ct.bind(a)
  );
}
function rt(e) {
  return J(e, !1);
}
function T(e) {
  if (k === null) return e();
  const t = k;
  k = null;
  try {
    return e();
  } finally {
    k = t;
  }
}
function Ft(e, t, n) {
  const a = Array.isArray(e);
  let s,
    r = n && n.defer;
  return (c) => {
    let l;
    if (a) {
      l = Array(e.length);
      for (let o = 0; o < e.length; o++) l[o] = e[o]();
    } else l = e();
    if (r) return ((r = !1), c);
    const u = T(() => t(l, s, c));
    return ((s = l), u);
  };
}
function F(e) {
  H(() => T(e));
}
function D(e) {
  return (
    v === null ||
      (v.cleanups === null ? (v.cleanups = [e]) : v.cleanups.push(e)),
    e
  );
}
function jt(e, t) {
  (ae || (ae = Symbol("error")),
    (v = we(void 0, void 0, !0)),
    (v.context = { ...v.context, [ae]: [t] }));
  try {
    return e();
  } catch (n) {
    ye(n);
  } finally {
    v = v.owner;
  }
}
function Le() {
  return k;
}
function ct() {
  if (this.sources && this.state)
    if (this.state === $) le(this);
    else {
      const e = C;
      ((C = null), J(() => ge(this), !1), (C = e));
    }
  if (k) {
    const e = this.observers ? this.observers.length : 0;
    (k.sources
      ? (k.sources.push(this), k.sourceSlots.push(e))
      : ((k.sources = [this]), (k.sourceSlots = [e])),
      this.observers
        ? (this.observers.push(k),
          this.observerSlots.push(k.sources.length - 1))
        : ((this.observers = [k]),
          (this.observerSlots = [k.sources.length - 1])));
  }
  return this.value;
}
function lt(e, t, n) {
  let a = e.value;
  return (
    (!e.comparator || !e.comparator(a, t)) &&
      ((e.value = t),
      e.observers &&
        e.observers.length &&
        J(() => {
          for (let s = 0; s < e.observers.length; s += 1) {
            const r = e.observers[s],
              c = Ce && Ce.running;
            (c && Ce.disposed.has(r),
              (c ? !r.tState : !r.state) &&
                (r.pure ? C.push(r) : L.push(r), r.observers && it(r)),
              c || (r.state = $));
          }
          if (C.length > 1e6) throw ((C = []), new Error());
        }, !1)),
    t
  );
}
function le(e) {
  if (!e.fn) return;
  re(e);
  const t = ve;
  Bt(e, e.value, t);
}
function Bt(e, t, n) {
  let a;
  const s = v,
    r = k;
  k = v = e;
  try {
    a = e.fn(t);
  } catch (c) {
    return (
      e.pure &&
        ((e.state = $), e.owned && e.owned.forEach(re), (e.owned = null)),
      (e.updatedAt = n + 1),
      ye(c)
    );
  } finally {
    ((k = r), (v = s));
  }
  (!e.updatedAt || e.updatedAt <= n) &&
    (e.updatedAt != null && "observers" in e ? lt(e, a) : (e.value = a),
    (e.updatedAt = n));
}
function we(e, t, n, a = $, s) {
  const r = {
    fn: e,
    state: a,
    updatedAt: null,
    owned: null,
    sources: null,
    sourceSlots: null,
    cleanups: null,
    value: t,
    owner: v,
    context: v ? v.context : null,
    pure: n,
  };
  return (
    v === null || (v !== st && (v.owned ? v.owned.push(r) : (v.owned = [r]))),
    r
  );
}
function he(e) {
  if (e.state === 0) return;
  if (e.state === xe) return ge(e);
  if (e.suspense && T(e.suspense.inFallback)) return e.suspense.effects.push(e);
  const t = [e];
  for (; (e = e.owner) && (!e.updatedAt || e.updatedAt < ve); )
    e.state && t.push(e);
  for (let n = t.length - 1; n >= 0; n--)
    if (((e = t[n]), e.state === $)) le(e);
    else if (e.state === xe) {
      const a = C;
      ((C = null), J(() => ge(e, t[0]), !1), (C = a));
    }
}
function J(e, t) {
  if (C) return e();
  let n = !1;
  (t || (C = []), L ? (n = !0) : (L = []), ve++);
  try {
    const a = e();
    return (Ht(n), a);
  } catch (a) {
    (n || (L = null), (C = null), ye(a));
  }
}
function Ht(e) {
  if ((C && (ot(C), (C = null)), e)) return;
  const t = L;
  ((L = null), t.length && J(() => at(t), !1));
}
function ot(e) {
  for (let t = 0; t < e.length; t++) he(e[t]);
}
function Wt(e) {
  let t,
    n = 0;
  for (t = 0; t < e.length; t++) {
    const a = e[t];
    a.user ? (e[n++] = a) : he(a);
  }
  for (t = 0; t < n; t++) he(e[t]);
}
function ge(e, t) {
  e.state = 0;
  for (let n = 0; n < e.sources.length; n += 1) {
    const a = e.sources[n];
    if (a.sources) {
      const s = a.state;
      s === $
        ? a !== t && (!a.updatedAt || a.updatedAt < ve) && he(a)
        : s === xe && ge(a, t);
    }
  }
}
function it(e) {
  for (let t = 0; t < e.observers.length; t += 1) {
    const n = e.observers[t];
    n.state ||
      ((n.state = xe), n.pure ? C.push(n) : L.push(n), n.observers && it(n));
  }
}
function re(e) {
  let t;
  if (e.sources)
    for (; e.sources.length; ) {
      const n = e.sources.pop(),
        a = e.sourceSlots.pop(),
        s = n.observers;
      if (s && s.length) {
        const r = s.pop(),
          c = n.observerSlots.pop();
        a < s.length &&
          ((r.sourceSlots[c] = a), (s[a] = r), (n.observerSlots[a] = c));
      }
    }
  if (e.tOwned) {
    for (t = e.tOwned.length - 1; t >= 0; t--) re(e.tOwned[t]);
    delete e.tOwned;
  }
  if (e.owned) {
    for (t = e.owned.length - 1; t >= 0; t--) re(e.owned[t]);
    e.owned = null;
  }
  if (e.cleanups) {
    for (t = e.cleanups.length - 1; t >= 0; t--) e.cleanups[t]();
    e.cleanups = null;
  }
  e.state = 0;
}
function Gt(e) {
  return e instanceof Error
    ? e
    : new Error(typeof e == "string" ? e : "Unknown error", { cause: e });
}
function He(e, t, n) {
  try {
    for (const a of t) a(e);
  } catch (a) {
    ye(a, (n && n.owner) || null);
  }
}
function ye(e, t = v) {
  const n = ae && t && t.context && t.context[ae],
    a = Gt(e);
  if (!n) throw a;
  L
    ? L.push({
        fn() {
          He(a, n, t);
        },
        state: $,
      })
    : He(a, n, t);
}
const Vt = Symbol("fallback");
function We(e) {
  for (let t = 0; t < e.length; t++) e[t]();
}
function qt(e, t, n = {}) {
  let a = [],
    s = [],
    r = [],
    c = 0,
    l = t.length > 1 ? [] : null;
  return (
    D(() => We(r)),
    () => {
      let u = e() || [],
        o = u.length,
        d,
        m;
      return (
        u[Ie],
        T(() => {
          let f, x, R, A, _, S, g, w, y;
          if (o === 0)
            (c !== 0 &&
              (We(r), (r = []), (a = []), (s = []), (c = 0), l && (l = [])),
              n.fallback &&
                ((a = [Vt]),
                (s[0] = me((O) => ((r[0] = O), n.fallback()))),
                (c = 1)));
          else if (c === 0) {
            for (s = new Array(o), m = 0; m < o; m++)
              ((a[m] = u[m]), (s[m] = me(i)));
            c = o;
          } else {
            for (
              R = new Array(o),
                A = new Array(o),
                l && (_ = new Array(o)),
                S = 0,
                g = Math.min(c, o);
              S < g && a[S] === u[S];
              S++
            );
            for (
              g = c - 1, w = o - 1;
              g >= S && w >= S && a[g] === u[w];
              g--, w--
            )
              ((R[w] = s[g]), (A[w] = r[g]), l && (_[w] = l[g]));
            for (f = new Map(), x = new Array(w + 1), m = w; m >= S; m--)
              ((y = u[m]),
                (d = f.get(y)),
                (x[m] = d === void 0 ? -1 : d),
                f.set(y, m));
            for (d = S; d <= g; d++)
              ((y = a[d]),
                (m = f.get(y)),
                m !== void 0 && m !== -1
                  ? ((R[m] = s[d]),
                    (A[m] = r[d]),
                    l && (_[m] = l[d]),
                    (m = x[m]),
                    f.set(y, m))
                  : r[d]());
            for (m = S; m < o; m++)
              m in R
                ? ((s[m] = R[m]), (r[m] = A[m]), l && ((l[m] = _[m]), l[m](m)))
                : (s[m] = me(i));
            ((s = s.slice(0, (c = o))), (a = u.slice(0)));
          }
          return s;
        })
      );
      function i(f) {
        if (((r[m] = f), l)) {
          const [x, R] = E(m);
          return ((l[m] = R), t(u[m], x));
        }
        return t(u[m]);
      }
    }
  );
}
const Kt = (e) => `Stale read from <${e}>.`;
function N(e) {
  const t = "fallback" in e && { fallback: () => e.fallback };
  return M(qt(() => e.each, e.children, t || void 0));
}
function p(e) {
  const t = e.keyed,
    n = M(() => e.when, void 0, void 0),
    a = t ? n : M(n, void 0, { equals: (s, r) => !s == !r });
  return M(
    () => {
      const s = a();
      if (s) {
        const r = e.children;
        return typeof r == "function" && r.length > 0
          ? T(() =>
              r(
                t
                  ? s
                  : () => {
                      if (!T(a)) throw Kt("Show");
                      return n();
                    }
              )
            )
          : r;
      }
      return e.fallback;
    },
    void 0,
    void 0
  );
}
let ue;
function zt(e) {
  let t;
  const [n, a] = E(t, void 0);
  return (
    ue || (ue = new Set()),
    ue.add(a),
    D(() => ue.delete(a)),
    M(
      () => {
        let s;
        if ((s = n())) {
          const r = e.fallback;
          return typeof r == "function" && r.length
            ? T(() => r(s, () => a()))
            : r;
        }
        return jt(() => e.children, a);
      },
      void 0,
      void 0
    )
  );
}
function Yt(e, t, n) {
  let a = n.length,
    s = t.length,
    r = a,
    c = 0,
    l = 0,
    u = t[s - 1].nextSibling,
    o = null;
  for (; c < s || l < r; ) {
    if (t[c] === n[l]) {
      (c++, l++);
      continue;
    }
    for (; t[s - 1] === n[r - 1]; ) (s--, r--);
    if (s === c) {
      const d = r < a ? (l ? n[l - 1].nextSibling : n[r - l]) : u;
      for (; l < r; ) e.insertBefore(n[l++], d);
    } else if (r === l)
      for (; c < s; ) ((!o || !o.has(t[c])) && t[c].remove(), c++);
    else if (t[c] === n[r - 1] && n[l] === t[s - 1]) {
      const d = t[--s].nextSibling;
      (e.insertBefore(n[l++], t[c++].nextSibling),
        e.insertBefore(n[--r], d),
        (t[s] = n[r]));
    } else {
      if (!o) {
        o = new Map();
        let m = l;
        for (; m < r; ) o.set(n[m], m++);
      }
      const d = o.get(t[c]);
      if (d != null)
        if (l < d && d < r) {
          let m = c,
            i = 1,
            f;
          for (
            ;
            ++m < s && m < r && !((f = o.get(t[m])) == null || f !== d + i);
          )
            i++;
          if (i > d - l) {
            const x = t[c];
            for (; l < d; ) e.insertBefore(n[l++], x);
          } else e.replaceChild(n[l++], t[c++]);
        } else c++;
      else t[c++].remove();
    }
  }
}
function Xt(e, t, n, a = {}) {
  let s;
  return (
    me((r) => {
      ((s = r),
        t === document ? e() : Zt(t, e(), t.firstChild ? null : void 0, n));
    }, a.owner),
    () => {
      (s(), (t.textContent = ""));
    }
  );
}
function Zt(e, t, n, a) {
  if ((n !== void 0 && !a && (a = []), typeof t != "function"))
    return pe(e, t, a, n);
  De((s) => pe(e, t(), s, n), a);
}
function pe(e, t, n, a, s) {
  for (; typeof n == "function"; ) n = n();
  if (t === n) return n;
  const r = typeof t,
    c = a !== void 0;
  if (
    ((e = (c && n[0] && n[0].parentNode) || e),
    r === "string" || r === "number")
  ) {
    if (r === "number" && ((t = t.toString()), t === n)) return n;
    if (c) {
      let l = n[0];
      (l && l.nodeType === 3
        ? l.data !== t && (l.data = t)
        : (l = document.createTextNode(t)),
        (n = V(e, n, a, l)));
    } else
      n !== "" && typeof n == "string"
        ? (n = e.firstChild.data = t)
        : (n = e.textContent = t);
  } else if (t == null || r === "boolean") n = V(e, n, a);
  else {
    if (r === "function")
      return (
        De(() => {
          let l = t();
          for (; typeof l == "function"; ) l = l();
          n = pe(e, l, n, a);
        }),
        () => n
      );
    if (Array.isArray(t)) {
      const l = [],
        u = n && Array.isArray(n);
      if (Oe(l, t, n, s)) return (De(() => (n = pe(e, l, n, a, !0))), () => n);
      if (l.length === 0) {
        if (((n = V(e, n, a)), c)) return n;
      } else
        u
          ? n.length === 0
            ? Ge(e, l, a)
            : Yt(e, n, l)
          : (n && V(e), Ge(e, l));
      n = l;
    } else if (t.nodeType) {
      if (Array.isArray(n)) {
        if (c) return (n = V(e, n, a, t));
        V(e, n, null, t);
      } else
        n == null || n === "" || !e.firstChild
          ? e.appendChild(t)
          : e.replaceChild(t, e.firstChild);
      n = t;
    }
  }
  return n;
}
function Oe(e, t, n, a) {
  let s = !1;
  for (let r = 0, c = t.length; r < c; r++) {
    let l = t[r],
      u = n && n[e.length],
      o;
    if (!(l == null || l === !0 || l === !1))
      if ((o = typeof l) == "object" && l.nodeType) e.push(l);
      else if (Array.isArray(l)) s = Oe(e, l, u) || s;
      else if (o === "function")
        if (a) {
          for (; typeof l == "function"; ) l = l();
          s =
            Oe(e, Array.isArray(l) ? l : [l], Array.isArray(u) ? u : [u]) || s;
        } else (e.push(l), (s = !0));
      else {
        const d = String(l);
        u && u.nodeType === 3 && u.data === d
          ? e.push(u)
          : e.push(document.createTextNode(d));
      }
  }
  return s;
}
function Ge(e, t, n = null) {
  for (let a = 0, s = t.length; a < s; a++) e.insertBefore(t[a], n);
}
function V(e, t, n, a) {
  if (n === void 0) return (e.textContent = "");
  const s = a || document.createTextNode("");
  if (t.length) {
    let r = !1;
    for (let c = t.length - 1; c >= 0; c--) {
      const l = t[c];
      if (s !== l) {
        const u = l.parentNode === e;
        !r && !c
          ? u
            ? e.replaceChild(s, l)
            : e.insertBefore(s, n)
          : u && l.remove();
      } else r = !0;
    }
  } else e.insertBefore(s, n);
  return [s];
}
const be = Symbol("store-raw"),
  K = Symbol("store-node"),
  U = Symbol("store-has"),
  dt = Symbol("store-self");
function ut(e) {
  let t = e[W];
  if (
    !t &&
    (Object.defineProperty(e, W, { value: (t = new Proxy(e, en)) }),
    !Array.isArray(e))
  ) {
    const n = Object.keys(e),
      a = Object.getOwnPropertyDescriptors(e);
    for (let s = 0, r = n.length; s < r; s++) {
      const c = n[s];
      a[c].get &&
        Object.defineProperty(e, c, {
          enumerable: a[c].enumerable,
          get: a[c].get.bind(t),
        });
    }
  }
  return t;
}
function z(e) {
  let t;
  return (
    e != null &&
    typeof e == "object" &&
    (e[W] ||
      !(t = Object.getPrototypeOf(e)) ||
      t === Object.prototype ||
      Array.isArray(e))
  );
}
function Y(e, t = new Set()) {
  let n, a, s, r;
  if ((n = e != null && e[be])) return n;
  if (!z(e) || t.has(e)) return e;
  if (Array.isArray(e)) {
    Object.isFrozen(e) ? (e = e.slice(0)) : t.add(e);
    for (let c = 0, l = e.length; c < l; c++)
      ((s = e[c]), (a = Y(s, t)) !== s && (e[c] = a));
  } else {
    Object.isFrozen(e) ? (e = Object.assign({}, e)) : t.add(e);
    const c = Object.keys(e),
      l = Object.getOwnPropertyDescriptors(e);
    for (let u = 0, o = c.length; u < o; u++)
      ((r = c[u]),
        !l[r].get && ((s = e[r]), (a = Y(s, t)) !== s && (e[r] = a)));
  }
  return e;
}
function Ee(e, t) {
  let n = e[t];
  return (
    n || Object.defineProperty(e, t, { value: (n = Object.create(null)) }),
    n
  );
}
function ce(e, t, n) {
  if (e[t]) return e[t];
  const [a, s] = E(n, { equals: !1, internal: !0 });
  return ((a.$ = s), (e[t] = a));
}
function Jt(e, t) {
  const n = Reflect.getOwnPropertyDescriptor(e, t);
  return (
    !n ||
      n.get ||
      !n.configurable ||
      t === W ||
      t === K ||
      (delete n.value, delete n.writable, (n.get = () => e[W][t])),
    n
  );
}
function mt(e) {
  Le() && ce(Ee(e, K), dt)();
}
function Qt(e) {
  return (mt(e), Reflect.ownKeys(e));
}
const en = {
  get(e, t, n) {
    if (t === be) return e;
    if (t === W) return n;
    if (t === Ie) return (mt(e), n);
    const a = Ee(e, K),
      s = a[t];
    let r = s ? s() : e[t];
    if (t === K || t === U || t === "__proto__") return r;
    if (!s) {
      const c = Object.getOwnPropertyDescriptor(e, t);
      Le() &&
        (typeof r != "function" || e.hasOwnProperty(t)) &&
        !(c && c.get) &&
        (r = ce(a, t, r)());
    }
    return z(r) ? ut(r) : r;
  },
  has(e, t) {
    return t === be ||
      t === W ||
      t === Ie ||
      t === K ||
      t === U ||
      t === "__proto__"
      ? !0
      : (Le() && ce(Ee(e, U), t)(), t in e);
  },
  set() {
    return !0;
  },
  deleteProperty() {
    return !0;
  },
  ownKeys: Qt,
  getOwnPropertyDescriptor: Jt,
};
function X(e, t, n, a = !1) {
  if (!a && e[t] === n) return;
  const s = e[t],
    r = e.length;
  n === void 0
    ? (delete e[t], e[U] && e[U][t] && s !== void 0 && e[U][t].$())
    : ((e[t] = n), e[U] && e[U][t] && s === void 0 && e[U][t].$());
  let c = Ee(e, K),
    l;
  if (((l = ce(c, t, s)) && l.$(() => n), Array.isArray(e) && e.length !== r)) {
    for (let u = e.length; u < r; u++) (l = c[u]) && l.$();
    (l = ce(c, "length", r)) && l.$(e.length);
  }
  (l = c[dt]) && l.$();
}
function ft(e, t) {
  const n = Object.keys(t);
  for (let a = 0; a < n.length; a += 1) {
    const s = n[a];
    X(e, s, t[s]);
  }
}
function tn(e, t) {
  if ((typeof t == "function" && (t = t(e)), (t = Y(t)), Array.isArray(t))) {
    if (e === t) return;
    let n = 0,
      a = t.length;
    for (; n < a; n++) {
      const s = t[n];
      e[n] !== s && X(e, n, s);
    }
    X(e, "length", a);
  } else ft(e, t);
}
function ne(e, t, n = []) {
  let a,
    s = e;
  if (t.length > 1) {
    a = t.shift();
    const c = typeof a,
      l = Array.isArray(e);
    if (Array.isArray(a)) {
      for (let u = 0; u < a.length; u++) ne(e, [a[u]].concat(t), n);
      return;
    } else if (l && c === "function") {
      for (let u = 0; u < e.length; u++) a(e[u], u) && ne(e, [u].concat(t), n);
      return;
    } else if (l && c === "object") {
      const { from: u = 0, to: o = e.length - 1, by: d = 1 } = a;
      for (let m = u; m <= o; m += d) ne(e, [m].concat(t), n);
      return;
    } else if (t.length > 1) {
      ne(e[a], t, [a].concat(n));
      return;
    }
    ((s = e[a]), (n = [a].concat(n)));
  }
  let r = t[0];
  (typeof r == "function" && ((r = r(s, n)), r === s)) ||
    (a === void 0 && r == null) ||
    ((r = Y(r)),
    a === void 0 || (z(s) && z(r) && !Array.isArray(r))
      ? ft(s, r)
      : X(e, a, r));
}
function xt(...[e, t]) {
  const n = Y(e || {}),
    a = Array.isArray(n),
    s = ut(n);
  function r(...c) {
    rt(() => {
      a && c.length === 1 ? tn(n, c[0]) : ne(n, c);
    });
  }
  return [s, r];
}
const Re = new WeakMap(),
  ht = {
    get(e, t) {
      if (t === be) return e;
      const n = e[t];
      let a;
      return z(n) ? Re.get(n) || (Re.set(n, (a = new Proxy(n, ht))), a) : n;
    },
    set(e, t, n) {
      return (X(e, t, Y(n)), !0);
    },
    deleteProperty(e, t) {
      return (X(e, t, void 0, !0), !0);
    },
  };
function Ne(e) {
  return (t) => {
    if (z(t)) {
      let n;
      ((n = Re.get(t)) || Re.set(t, (n = new Proxy(t, ht))), e(n));
    }
    return t;
  };
}
const Ae = 64;
class nn {
  constructor() {
    Be(this, "histories", new Map());
  }
  getOrCreateUniverse(t) {
    let n = this.histories.get(t);
    return (
      n ||
        ((n = Array.from({ length: 512 }, () => new Float32Array(Ae))),
        this.histories.set(t, n)),
      n
    );
  }
  push(t, n) {
    const a = this.getOrCreateUniverse(t);
    for (let s = 0; s < 512 && s < n.length; s++) {
      const r = a[s];
      (r.copyWithin(0, 1), (r[Ae - 1] = n[s] ?? 0));
    }
  }
  getHistory(t, n) {
    const a = this.histories.get(t);
    return !a || n < 0 || n >= 512 ? null : (a[n] ?? null);
  }
  get historyLength() {
    return Ae;
  }
  clear() {
    this.histories.clear();
  }
}
const se = new nn();
(() => {
  const e = new Array(256);
  e[0] = "#525252";
  for (let t = 1; t < 128; t++) {
    const n = t / 127;
    e[t] =
      `rgb(${Math.round(30 + n * 15)},${Math.round(140 + n * 72)},${Math.round(130 + n * 61)})`;
  }
  for (let t = 128; t < 255; t++) {
    const n = (t - 128) / 126;
    e[t] =
      `rgb(${Math.round(45 + n * 184)},${Math.round(212 + n * 17)},${Math.round(191 + n * 38)})`;
  }
  return ((e[255] = "#FFFFFF"), e);
})();
const an = (e) => {
    let t, n;
    function a(l) {
      return null;
    }
    function s(l) {
      e.onHover(a());
    }
    function r() {
      e.onHover(null);
    }
    function c(l) {
      const u = a();
      if (u === null) {
        e.onSelect(null);
        return;
      }
      e.onSelect(e.selectedChannel() === u ? null : u);
    }
    return (
      F(() => {}),
      React.createElement(
        "div",
        { ref: n, class: "rounded-md border border-edge overflow-hidden" },
        React.createElement("canvas", {
          ref: t,
          class: "cursor-pointer block",
          onMouseMove: s,
          onMouseLeave: r,
          onClick: c,
        })
      )
    );
  },
  sn = (e) => {
    let t, n;
    const a = () => e.width ?? 60,
      s = () => e.height ?? 20;
    return (
      F(() => {
        let r = !0;
        function c(l) {
          r && (n = requestAnimationFrame(c));
        }
        ((n = requestAnimationFrame(c)),
          D(() => {
            ((r = !1), n !== void 0 && cancelAnimationFrame(n));
          }));
      }),
      React.createElement("canvas", {
        ref: t,
        style: { width: `${a()}px`, height: `${s()}px`, display: "block" },
        class: "pointer-events-none",
      })
    );
  },
  Ve = {
    master: { dot: "bg-teal", label: "Master" },
    backup: { dot: "bg-amber", label: "Backup (Standby)" },
    secondary: { dot: "bg-muted", label: "Secondary" },
  },
  gt = (e) =>
    React.createElement(
      "div",
      { class: "rounded-lg border border-edge bg-surface p-3" },
      React.createElement(
        "h3",
        {
          class:
            "mb-2 text-[10px] font-medium uppercase tracking-wide text-muted",
        },
        "Source IPs"
      ),
      React.createElement(
        "div",
        { class: "flex flex-col gap-1.5" },
        React.createElement(N, { each: e.sourceIps() }, (t) => {
          const n = Ve[t.role] ?? Ve.secondary;
          return React.createElement(
            "div",
            { class: "flex items-center gap-2" },
            React.createElement("span", {
              class: "h-1.5 w-1.5 flex-shrink-0 rounded-full",
              classList: {
                "bg-teal": t.role === "master",
                "bg-amber": t.role === "backup",
                "bg-muted": t.role === "secondary",
              },
            }),
            React.createElement(
              "span",
              { class: "font-mono text-xs tabular-nums text-secondary" },
              t.ip
            ),
            React.createElement(
              "span",
              { class: "ml-auto text-[10px] text-muted" },
              n.label
            )
          );
        })
      ),
      React.createElement(
        "div",
        { class: "mt-3 flex items-center gap-2 border-t border-edge pt-2" },
        React.createElement("span", {
          class: "h-2 w-2 rounded-full transition-colors",
          classList: {
            "bg-green-400 animate-pulse shadow-[0_0_6px_#4ade80]":
              e.artSyncActive(),
            "bg-muted": !e.artSyncActive(),
          },
        }),
        React.createElement(
          "span",
          { class: "text-xs text-secondary" },
          "ArtSync:",
          " ",
          React.createElement(
            "span",
            {
              class: "font-mono",
              classList: {
                "text-green-400 font-medium": e.artSyncActive(),
                "text-muted": !e.artSyncActive(),
              },
            },
            e.artSyncActive() ? "ACTIVE" : "INACTIVE"
          )
        )
      )
    ),
  q = 512,
  rn = Array.from({ length: q }, (e, t) => t),
  cn = 25,
  ln = 10;
function on(e, t, n) {
  let a = 0;
  const s = n - t;
  if (s <= 0) return 0;
  for (let l = t; l < n; l++) a += e[l];
  const r = a / s;
  let c = 0;
  for (let l = t; l < n; l++) {
    const u = e[l] - r;
    c += u * u;
  }
  return Math.sqrt(c / s);
}
const qe = (e) => {
    var x, R, A, _, S;
    const [t, n] = E(null),
      [a, s] = E(null),
      [r, c] = E(32),
      [l, u] = E(new Set());
    (H(
      Ft(
        () => {
          var g;
          return (g = e.clearTrigger) == null ? void 0 : g.call(e);
        },
        () => {
          (s(null), n(null));
        },
        { defer: !0 }
      )
    ),
      F(() => {
        const g = setInterval(() => {
          const w = new Set();
          for (let y = 0; y < q; y++) {
            const O = se.getHistory(e.universeId, y);
            if (!O) continue;
            const Q = O.length,
              ke = Math.max(0, Q - ln);
            on(O, ke, Q) > cn && w.add(y);
          }
          u(w);
        }, 500);
        D(() => clearInterval(g));
      }));
    const o = () => {
        const g = e.universeId,
          w = (g >> 8) & 127,
          y = (g >> 4) & 15,
          O = g & 15;
        return `${w}:${y}:${O}`;
      },
      d = () => {
        const g = e.channels();
        if (!g) return 0;
        let w = 0;
        for (let y = 0; y < g.length; y++) (g[y] ?? 0) > 0 && w++;
        return w;
      },
      m = () => {
        const g = e.channels();
        if (!g || g.length === 0) return 0;
        let w = 0;
        for (let y = 0; y < g.length; y++) w += g[y] ?? 0;
        return Math.round(w / g.length);
      },
      i = () => l().size,
      f = () => a() ?? t();
    return React.createElement(
      "div",
      { "data-testid": "channel-inspector", class: "flex flex-col gap-4" },
      React.createElement(
        "div",
        { class: "rounded-lg border border-edge bg-surface p-4" },
        React.createElement(
          "div",
          { class: "flex items-center justify-between" },
          React.createElement(
            "div",
            { class: "flex items-center gap-3" },
            React.createElement(
              "h2",
              {
                class:
                  "text-sm font-medium uppercase tracking-wide text-secondary",
              },
              "Universe ",
              e.universeId
            ),
            React.createElement(
              "span",
              { class: "font-mono text-xs tabular-nums text-muted" },
              o()
            )
          ),
          React.createElement(
            "div",
            { class: "flex items-center gap-4" },
            React.createElement(
              "div",
              {
                class:
                  "flex items-center gap-1 rounded-md border border-edge bg-obsidian",
              },
              React.createElement(
                "button",
                {
                  onClick: () => c(16),
                  class:
                    "rounded-l-md px-2 py-1 font-mono text-[10px] transition-colors",
                  classList: {
                    "bg-teal/10 text-teal": r() === 16,
                    "text-muted hover:text-secondary": r() !== 16,
                  },
                },
                "16"
              ),
              React.createElement(
                "button",
                {
                  onClick: () => c(32),
                  class:
                    "rounded-r-md px-2 py-1 font-mono text-[10px] transition-colors",
                  classList: {
                    "bg-teal/10 text-teal": r() === 32,
                    "text-muted hover:text-secondary": r() !== 32,
                  },
                },
                "32"
              )
            ),
            React.createElement(
              "span",
              { class: "text-xs tabular-nums text-muted" },
              d(),
              " active"
            ),
            React.createElement(
              "span",
              { class: "font-mono text-xs tabular-nums text-muted" },
              "avg ",
              m()
            ),
            React.createElement(
              p,
              { when: i() > 0 },
              React.createElement(
                "span",
                { class: "flex items-center gap-1 text-xs text-amber" },
                React.createElement("span", {
                  class: "h-1.5 w-1.5 rounded-full bg-amber animate-flicker",
                }),
                i(),
                " flicker"
              )
            )
          )
        )
      ),
      React.createElement(p, { when: e.sourceIps }, (g) =>
        React.createElement(
          "div",
          { class: "flex gap-4" },
          React.createElement(
            "div",
            { class: "w-52 flex-shrink-0" },
            React.createElement(gt, {
              sourceIps: g(),
              artSyncActive: e.artSyncActive ?? (() => !1),
            })
          ),
          React.createElement(
            "div",
            {
              class:
                "flex flex-1 items-center gap-6 rounded-lg border border-edge bg-surface px-4 py-3",
            },
            React.createElement(
              "div",
              { class: "flex flex-col" },
              React.createElement(
                "span",
                { class: "text-[10px] uppercase tracking-wide text-muted" },
                "Grid"
              ),
              React.createElement(
                "span",
                { class: "font-mono text-sm tabular-nums text-secondary" },
                r(),
                " x ",
                q / r()
              )
            ),
            React.createElement(
              "div",
              { class: "flex flex-col" },
              React.createElement(
                "span",
                { class: "text-[10px] uppercase tracking-wide text-muted" },
                "Active"
              ),
              React.createElement(
                "span",
                { class: "font-mono text-sm tabular-nums text-teal" },
                d(),
                React.createElement("span", { class: "text-muted" }, "/", q)
              )
            ),
            React.createElement(
              "div",
              { class: "flex flex-col" },
              React.createElement(
                "span",
                { class: "text-[10px] uppercase tracking-wide text-muted" },
                "Average"
              ),
              React.createElement(
                "span",
                { class: "font-mono text-sm tabular-nums text-secondary" },
                m()
              )
            ),
            React.createElement(
              p,
              { when: i() > 0 },
              React.createElement(
                "div",
                { class: "flex flex-col" },
                React.createElement(
                  "span",
                  { class: "text-[10px] uppercase tracking-wide text-muted" },
                  "Flicker"
                ),
                React.createElement(
                  "span",
                  { class: "font-mono text-sm tabular-nums text-amber" },
                  i(),
                  " ch"
                )
              )
            )
          )
        )
      ),
      React.createElement(
        "div",
        { class: "flex gap-4" },
        React.createElement(
          "div",
          { class: "flex-1 min-w-0" },
          React.createElement(
            p,
            {
              when: e.channels(),
              fallback: React.createElement(
                "div",
                {
                  class:
                    "rounded-md border border-edge bg-edge overflow-hidden",
                  classList: {
                    "grid grid-cols-32 gap-px": r() === 32,
                    "grid grid-cols-16 gap-px": r() === 16,
                  },
                },
                React.createElement(N, { each: rn }, () =>
                  React.createElement("div", {
                    class: "h-9 bg-surface animate-pulse",
                  })
                )
              ),
            },
            React.createElement(an, {
              channels: e.channels,
              universeId: e.universeId,
              gridCols: r,
              flickeringSet: l,
              hoveredChannel: t,
              selectedChannel: a,
              onHover: n,
              onSelect: s,
            }),
            React.createElement(
              "div",
              { class: "mt-2 flex items-center gap-4 text-[10px] text-muted" },
              React.createElement(
                "span",
                { class: "flex items-center gap-1.5" },
                React.createElement("span", {
                  class: "h-1.5 w-1.5 rounded-full bg-teal animate-pulse",
                }),
                "Live"
              ),
              React.createElement("span", null, q, " ch"),
              React.createElement(
                "span",
                { class: "font-mono tabular-nums" },
                r(),
                " x ",
                q / r()
              )
            )
          )
        ),
        React.createElement(
          p,
          { when: f() !== null && f() !== void 0 },
          React.createElement(
            "div",
            {
              class:
                "w-64 flex-shrink-0 rounded-lg border border-edge bg-surface p-4",
            },
            React.createElement(
              "h3",
              {
                class:
                  "mb-3 text-xs font-medium uppercase tracking-wide text-muted",
              },
              "Channel Detail"
            ),
            React.createElement(
              "div",
              { class: "flex flex-col gap-3" },
              React.createElement(
                "div",
                { class: "text-center" },
                React.createElement(
                  "div",
                  {
                    class:
                      "font-mono text-3xl font-semibold tabular-nums text-teal",
                  },
                  ((x = e.channels()) == null ? void 0 : x[f()]) ?? 0
                ),
                React.createElement(
                  "div",
                  { class: "mt-1 text-xs text-muted" },
                  "Channel ",
                  f() + 1
                ),
                React.createElement(
                  p,
                  { when: l().has(f()) },
                  React.createElement(
                    "div",
                    {
                      class:
                        "mt-1 flex items-center justify-center gap-1 text-[10px] text-amber",
                    },
                    React.createElement("span", {
                      class:
                        "h-1.5 w-1.5 rounded-full bg-amber animate-flicker",
                    }),
                    "Flickering"
                  )
                )
              ),
              React.createElement(
                "div",
                { class: "rounded-md border border-edge bg-obsidian p-2" },
                React.createElement(
                  "div",
                  {
                    class:
                      "mb-1 text-[10px] uppercase tracking-wide text-muted",
                  },
                  "History"
                ),
                React.createElement(sn, {
                  data: () => se.getHistory(e.universeId, f()),
                  width: 224,
                  height: 48,
                })
              ),
              React.createElement(
                "div",
                { class: "grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs" },
                React.createElement("span", { class: "text-muted" }, "Channel"),
                React.createElement(
                  "span",
                  { class: "font-mono tabular-nums text-secondary" },
                  f() + 1
                ),
                React.createElement("span", { class: "text-muted" }, "Value"),
                React.createElement(
                  "span",
                  { class: "font-mono tabular-nums text-secondary" },
                  ((R = e.channels()) == null ? void 0 : R[f()]) ?? 0
                ),
                React.createElement("span", { class: "text-muted" }, "Percent"),
                React.createElement(
                  "span",
                  { class: "font-mono tabular-nums text-secondary" },
                  Math.round(
                    ((((A = e.channels()) == null ? void 0 : A[f()]) ?? 0) /
                      255) *
                      100
                  ),
                  "%"
                ),
                React.createElement("span", { class: "text-muted" }, "Hex"),
                React.createElement(
                  "span",
                  { class: "font-mono tabular-nums text-secondary" },
                  "0x",
                  (((_ = e.channels()) == null ? void 0 : _[f()]) ?? 0)
                    .toString(16)
                    .toUpperCase()
                    .padStart(2, "0")
                ),
                React.createElement("span", { class: "text-muted" }, "8-bit"),
                React.createElement(
                  "span",
                  { class: "font-mono tabular-nums text-secondary" },
                  (((S = e.channels()) == null ? void 0 : S[f()]) ?? 0)
                    .toString(2)
                    .padStart(8, "0")
                )
              )
            )
          )
        )
      )
    );
  },
  Ke = (e) => {
    let t, n, a;
    const [s, r] = E(null);
    function c(o) {
      return null;
    }
    function l(o) {
      if (c() === null) {
        r(null);
        return;
      }
    }
    function u(o) {
      const d = c();
      d !== null && e.onSelect(d);
    }
    return (
      F(() => {
        let o = !0;
        function d(m) {
          o && (a = requestAnimationFrame(d));
        }
        ((a = requestAnimationFrame(d)),
          D(() => {
            ((o = !1), a !== void 0 && cancelAnimationFrame(a));
          }));
      }),
      React.createElement(
        "div",
        {
          ref: t,
          "data-testid": "universe-map",
          class: "relative rounded-lg border border-edge bg-surface p-4",
        },
        React.createElement(
          "div",
          { class: "flex items-center justify-between mb-3" },
          React.createElement(
            "h2",
            {
              class:
                "text-sm font-medium tracking-wide uppercase text-secondary",
            },
            "Universe Heatmap"
          ),
          React.createElement(
            "span",
            { class: "text-[10px] text-muted font-mono" },
            e.universes().length,
            " active"
          )
        ),
        React.createElement(
          p,
          {
            when: e.universes().length > 0,
            fallback: React.createElement(
              "div",
              {
                class:
                  "flex h-24 items-center justify-center text-xs text-muted",
              },
              React.createElement(
                "div",
                { class: "text-center" },
                React.createElement(
                  "div",
                  { class: "mb-1" },
                  "No active universes detected"
                ),
                React.createElement(
                  "div",
                  { class: "text-[10px]" },
                  "Send Art-Net data to port 6454"
                )
              )
            ),
          },
          React.createElement("canvas", {
            ref: n,
            class: "cursor-pointer",
            onMouseMove: l,
            onClick: u,
            onMouseLeave: () => r(null),
          }),
          React.createElement(p, { when: s() }, (o) =>
            React.createElement(
              "div",
              {
                class:
                  "pointer-events-none absolute z-10 rounded border border-edge bg-obsidian/95 px-2.5 py-1 text-[10px] font-mono shadow-lg",
                style: {
                  left: `${Math.min(o().mouseX + 14, 90)}px`,
                  top: `${Math.max(o().mouseY - 34, 4)}px`,
                },
              },
              React.createElement(
                "span",
                { class: "text-primary" },
                "Uni ",
                o().universeId
              ),
              React.createElement(
                "span",
                { class: "ml-2 text-teal" },
                Math.round(o().activity * 100),
                "%"
              )
            )
          ),
          React.createElement(
            "div",
            { class: "mt-3 flex items-center gap-2 text-[10px] text-muted" },
            React.createElement("span", null, "Activity"),
            React.createElement("span", null, "0%"),
            React.createElement("div", {
              class: "h-2 w-28 rounded-sm",
              style: {
                background:
                  "linear-gradient(to right, #1A1A1A, #1E3A5F, #2563EB, #22C55E, #EAB308, #FBBF24, #FFF)",
              },
            }),
            React.createElement("span", null, "100%")
          )
        )
      )
    );
  };
function dn(e, t = !1) {
  return window.__TAURI_INTERNALS__.transformCallback(e, t);
}
async function oe(e, t = {}, n) {
  return window.__TAURI_INTERNALS__.invoke(e, t, n);
}
const un = (e) => {
    const [t, n] = E([]),
      [a, s] = E(null),
      [r, c] = E("");
    F(() => {
      if (e.mockDevices) {
        n(e.mockDevices);
        return;
      }
      const o = setInterval(async () => {
        try {
          const d = await oe("get_devices");
          n(d);
        } catch {}
      }, 2e3);
      D(() => clearInterval(o));
    });
    const l = () => {
        const o = r().toLowerCase();
        return o
          ? t().filter(
              (d) =>
                d.short_name.toLowerCase().includes(o) ||
                d.long_name.toLowerCase().includes(o) ||
                d.ip_address.includes(o) ||
                d.mac_address.toLowerCase().includes(o)
            )
          : t();
      },
      u = (o) => {
        s((d) => (d === o ? null : o));
      };
    return React.createElement(
      "div",
      {
        "data-testid": "device-list",
        class: "rounded-lg border border-edge bg-surface p-4",
      },
      React.createElement(
        "div",
        { class: "flex items-center justify-between mb-3" },
        React.createElement(
          "h2",
          {
            class: "text-sm font-medium tracking-wide uppercase text-secondary",
          },
          "Devices"
        ),
        React.createElement(
          "div",
          { class: "flex items-center gap-2" },
          React.createElement("input", {
            type: "text",
            placeholder: "Filter devices...",
            value: r(),
            onInput: (o) => c(o.currentTarget.value),
            class:
              "h-6 w-40 rounded border border-edge bg-obsidian px-2 text-[11px] text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none transition-colors",
          }),
          React.createElement(
            "span",
            { class: "text-[10px] text-muted font-mono" },
            l().length,
            " node",
            l().length !== 1 ? "s" : ""
          )
        )
      ),
      React.createElement(
        p,
        {
          when: l().length > 0,
          fallback: React.createElement(
            "div",
            {
              class:
                "flex h-24 flex-col items-center justify-center text-xs text-muted",
            },
            React.createElement(
              "div",
              { class: "mb-1" },
              "No Art-Net devices discovered"
            ),
            React.createElement(
              "div",
              { class: "text-[10px]" },
              "Devices respond to ArtPoll broadcasts"
            )
          ),
        },
        React.createElement(
          "div",
          { class: "flex flex-col gap-2" },
          React.createElement(N, { each: l() }, (o) => {
            const d = () => a() === o.ip_address;
            return React.createElement(
              "div",
              {
                class:
                  "rounded-md border bg-obsidian transition-all duration-150",
                classList: {
                  "border-teal/20": d(),
                  "border-edge hover:border-edge-active": !d(),
                },
              },
              React.createElement(
                "button",
                {
                  class:
                    "flex w-full items-center justify-between p-3 text-left",
                  onClick: () => u(o.ip_address),
                },
                React.createElement(
                  "div",
                  { class: "flex items-center gap-3" },
                  React.createElement(
                    "div",
                    {
                      class:
                        "flex h-8 w-8 items-center justify-center rounded-md bg-surface text-teal",
                    },
                    React.createElement(
                      "svg",
                      {
                        class: "h-4 w-4",
                        fill: "none",
                        viewBox: "0 0 24 24",
                        stroke: "currentColor",
                        "stroke-width": "1.5",
                      },
                      React.createElement("path", {
                        d: "M8.288 15.038a5.25 5.25 0 0 1 7.424 0M5.106 11.856c3.807-3.808 9.98-3.808 13.788 0M1.924 8.674c5.565-5.565 14.587-5.565 20.152 0M12.53 18.22l-.53.53-.53-.53a.75.75 0 0 1 1.06 0Z",
                      })
                    )
                  ),
                  React.createElement(
                    "div",
                    null,
                    React.createElement(
                      "div",
                      { class: "text-sm font-medium text-primary" },
                      o.short_name || "Unknown Device"
                    ),
                    React.createElement(
                      "div",
                      { class: "text-[11px] font-mono text-muted" },
                      o.ip_address
                    )
                  )
                ),
                React.createElement(
                  "div",
                  { class: "flex items-center gap-2" },
                  React.createElement(
                    "span",
                    {
                      class:
                        "rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal",
                    },
                    o.port_addresses.length,
                    " port",
                    o.port_addresses.length !== 1 ? "s" : ""
                  ),
                  React.createElement(
                    "span",
                    { class: "flex items-center gap-1.5 text-xs text-muted" },
                    React.createElement("span", {
                      class: "h-1.5 w-1.5 rounded-full bg-teal",
                    })
                  ),
                  React.createElement(
                    "svg",
                    {
                      class:
                        "h-4 w-4 text-muted transition-transform duration-150",
                      classList: { "rotate-180": d() },
                      fill: "none",
                      viewBox: "0 0 24 24",
                      stroke: "currentColor",
                      "stroke-width": "1.5",
                    },
                    React.createElement("path", {
                      d: "m19.5 8.25-7.5 7.5-7.5-7.5",
                    })
                  )
                )
              ),
              React.createElement(
                p,
                { when: d() },
                React.createElement(
                  "div",
                  { class: "border-t border-edge px-3 pb-3 pt-2" },
                  React.createElement(
                    "div",
                    { class: "grid grid-cols-2 gap-x-6 gap-y-2 text-xs" },
                    React.createElement(
                      "span",
                      { class: "text-muted" },
                      "Long Name"
                    ),
                    React.createElement(
                      "span",
                      { class: "text-secondary" },
                      o.long_name
                    ),
                    React.createElement(
                      "span",
                      { class: "text-muted" },
                      "MAC Address"
                    ),
                    React.createElement(
                      "span",
                      { class: "font-mono text-secondary" },
                      o.mac_address
                    ),
                    React.createElement(
                      "span",
                      { class: "text-muted" },
                      "Firmware"
                    ),
                    React.createElement(
                      "span",
                      { class: "font-mono text-secondary" },
                      `v${(o.firmware_version >> 8) & 255}.${o.firmware_version & 255}`,
                      " ",
                      React.createElement(
                        "span",
                        { class: "text-muted" },
                        "(0x",
                        o.firmware_version
                          .toString(16)
                          .toUpperCase()
                          .padStart(4, "0"),
                        ")"
                      )
                    ),
                    React.createElement(
                      "span",
                      { class: "text-muted" },
                      "OEM Code"
                    ),
                    React.createElement(
                      "span",
                      { class: "font-mono text-secondary" },
                      "0x",
                      o.oem_code.toString(16).toUpperCase().padStart(4, "0")
                    ),
                    React.createElement(
                      "span",
                      { class: "text-muted" },
                      "Port Addresses"
                    ),
                    React.createElement(
                      "span",
                      { class: "font-mono text-secondary" },
                      o.port_addresses.length > 0
                        ? o.port_addresses
                            .map((m) => {
                              const i = (m >> 8) & 127,
                                f = (m >> 4) & 15,
                                x = m & 15;
                              return `${i}:${f}:${x}`;
                            })
                            .join(", ")
                        : "None"
                    )
                  )
                )
              )
            );
          })
        )
      )
    );
  },
  mn = "3rem",
  fn = (e) => String.fromCharCode(65 + e),
  xn = (e) => {
    const t = (e >> 8) & 127,
      n = (e >> 4) & 15,
      a = e & 15;
    return `${t}:${n}:${a}`;
  },
  ze = (e) => {
    const t = () => {
        var i;
        return ((i = e.routes) == null ? void 0 : i.call(e)) ?? [];
      },
      n = () => {
        var i;
        return ((i = e.devices) == null ? void 0 : i.call(e)) ?? [];
      },
      a = M(() => {
        const i = new Map();
        for (const f of n()) i.set(f.ip_address, f);
        return i;
      }),
      s = M(() => {
        const i = new Map();
        for (const f of t())
          i.has(f.sourceIp) || i.set(f.sourceIp, a().get(f.sourceIp));
        return [...i.entries()]
          .sort(([f], [x]) => f.localeCompare(x))
          .map(([f, x]) => ({ ip: f, device: x }));
      }),
      r = M(() => n().filter((i) => i.port_addresses.length > 0)),
      c = M(() => {
        const i = [];
        for (const f of r())
          for (let x = 0; x < f.port_addresses.length; x++)
            i.push({
              device: f,
              portIndex: x,
              universe: f.port_addresses[x],
              isFirstPort: x === 0,
            });
        return i;
      }),
      l = M(() => c().length),
      u = M(() => {
        const i = new Map();
        for (const f of t()) i.set(`${f.sourceIp}::${f.universeId}`, f);
        return i;
      }),
      o = M(() => {
        const i = new Map();
        for (const x of t()) {
          let R = i.get(x.universeId);
          (R || ((R = new Set()), i.set(x.universeId, R)), R.add(x.sourceIp));
        }
        const f = new Set();
        for (const [x, R] of i) R.size > 1 && f.add(x);
        return f;
      }),
      d = M(() => o().size),
      m = M(() => s().length > 0 && r().length > 0);
    return React.createElement(
      "div",
      {
        "data-testid": "routing-matrix",
        class:
          "flex flex-col gap-3 rounded-lg border border-edge bg-surface p-4",
      },
      React.createElement(
        "div",
        { class: "flex items-center justify-between" },
        React.createElement(
          "h2",
          {
            class: "text-sm font-medium tracking-wide uppercase text-secondary",
          },
          "Routing Matrix"
        ),
        React.createElement(
          p,
          { when: m() },
          React.createElement(
            "span",
            { class: "text-[10px] font-mono text-muted" },
            s().length,
            " tx · ",
            r().length,
            " rx ·",
            " ",
            l(),
            " ports"
          )
        )
      ),
      React.createElement(
        p,
        {
          when: m(),
          fallback: React.createElement(
            "div",
            {
              class:
                "flex h-40 flex-col items-center justify-center gap-3 text-xs text-muted",
            },
            React.createElement(
              "svg",
              {
                class: "h-10 w-10 text-edge",
                fill: "none",
                viewBox: "0 0 24 24",
                stroke: "currentColor",
                "stroke-width": "1",
              },
              React.createElement("path", {
                d: "M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0 1 12 16.5a17.92 17.92 0 0 1-8.716-2.247m0 0A9.015 9.015 0 0 1 3 12c0-1.605.42-3.113 1.157-4.418",
              })
            ),
            React.createElement(
              "span",
              { class: "text-center leading-relaxed px-8" },
              "No active routing. Connect Art-Net devices and send data to populate the matrix."
            )
          ),
        },
        React.createElement(
          "div",
          { class: "overflow-auto max-h-[calc(100vh-14rem)]" },
          React.createElement(
            "div",
            {
              class: "grid gap-px",
              style: {
                "grid-template-columns": `minmax(160px, auto) repeat(${l()}, minmax(56px, 1fr))`,
                background: "rgba(31,31,31,0.5)",
              },
            },
            React.createElement(
              "div",
              {
                class:
                  "sticky top-0 left-0 z-30 flex items-end bg-surface p-2 border-b border-r border-edge",
                style: { "grid-row": "span 2" },
              },
              React.createElement(
                "span",
                {
                  class:
                    "text-[9px] font-medium uppercase tracking-widest text-muted leading-tight",
                },
                "tx ↓",
                React.createElement("br", null),
                "rx →"
              )
            ),
            React.createElement(N, { each: r() }, (i) =>
              React.createElement(
                "div",
                {
                  class:
                    "sticky top-0 z-20 flex items-center justify-center bg-surface px-2 h-12 border-b border-edge cursor-pointer hover:bg-surface-hover transition-colors",
                  style: { "grid-column": `span ${i.port_addresses.length}` },
                  onClick: () => {
                    var f;
                    return (f = e.onDeviceSelect) == null
                      ? void 0
                      : f.call(e, i);
                  },
                  title: `${i.long_name} (${i.ip_address})`,
                },
                React.createElement(
                  "div",
                  { class: "flex flex-col items-center min-w-0" },
                  React.createElement(
                    "span",
                    {
                      class:
                        "text-[11px] font-medium text-primary truncate max-w-[120px]",
                    },
                    i.short_name
                  ),
                  React.createElement(
                    "span",
                    { class: "text-[9px] font-mono text-muted truncate" },
                    i.ip_address
                  )
                )
              )
            ),
            React.createElement(N, { each: c() }, (i) =>
              React.createElement(
                "div",
                {
                  class:
                    "sticky z-20 flex flex-col items-center justify-center bg-surface px-1 py-1 border-b border-edge",
                  style: { top: mn },
                  classList: { "border-l border-l-teal/10": i.isFirstPort },
                },
                React.createElement(
                  "span",
                  { class: "text-[9px] font-medium text-secondary" },
                  fn(i.portIndex)
                ),
                React.createElement(
                  "span",
                  { class: "text-[8px] font-mono text-muted" },
                  xn(i.universe)
                )
              )
            ),
            React.createElement(N, { each: s() }, (i) => {
              var f;
              return React.createElement(
                React.Fragment,
                null,
                React.createElement(
                  "div",
                  {
                    class:
                      "sticky left-0 z-10 flex items-center gap-2 bg-surface px-3 py-2 border-r border-edge cursor-pointer hover:bg-surface-hover transition-colors",
                    onClick: () => {
                      var x;
                      i.device &&
                        ((x = e.onDeviceSelect) == null || x.call(e, i.device));
                    },
                  },
                  React.createElement(
                    "div",
                    {
                      class:
                        "flex h-7 w-7 shrink-0 items-center justify-center rounded bg-teal/10 text-teal",
                    },
                    React.createElement(
                      "svg",
                      {
                        class: "h-3.5 w-3.5",
                        fill: "none",
                        viewBox: "0 0 24 24",
                        stroke: "currentColor",
                        "stroke-width": "1.5",
                      },
                      React.createElement("path", {
                        d: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
                      })
                    )
                  ),
                  React.createElement(
                    "div",
                    { class: "flex flex-col min-w-0" },
                    React.createElement(
                      "span",
                      {
                        class: "text-[11px] font-medium text-primary truncate",
                      },
                      ((f = i.device) == null ? void 0 : f.short_name) ??
                        "Unknown"
                    ),
                    React.createElement(
                      "span",
                      { class: "text-[9px] font-mono text-muted" },
                      i.ip
                    )
                  )
                ),
                React.createElement(N, { each: c() }, (x) => {
                  const R = () => u().get(`${i.ip}::${x.universe}`),
                    A = () => o().has(x.universe) && !!R();
                  return React.createElement(
                    "div",
                    {
                      class:
                        "flex items-center justify-center bg-obsidian min-h-[40px]",
                      classList: { "border-l border-l-teal/10": x.isFirstPort },
                    },
                    React.createElement(
                      p,
                      {
                        when: R(),
                        fallback: React.createElement("div", {
                          class:
                            "h-7 w-full rounded border border-edge/30 bg-obsidian",
                        }),
                      },
                      (_) =>
                        React.createElement(
                          "div",
                          {
                            class:
                              "flex h-7 w-full max-w-[48px] items-center justify-center rounded border font-mono text-[10px] tabular-nums",
                            classList: {
                              "border-amber/40 bg-amber/10 text-amber shadow-[0_0_6px_rgba(245,158,11,0.15)]":
                                A(),
                              "border-teal/30 bg-teal/15 text-teal shadow-[0_0_6px_#2DD4BF33] animate-[cell-pulse_3s_ease-in-out_infinite]":
                                !A(),
                            },
                            title: A()
                              ? `Universe ${x.universe} — merge conflict (multiple sources)`
                              : `Universe ${x.universe} · ${_().packetsPerSecond} pps`,
                          },
                          React.createElement(
                            p,
                            { when: A() },
                            React.createElement(
                              "span",
                              { class: "mr-0.5 text-[8px]" },
                              "⇄"
                            )
                          ),
                          x.universe
                        )
                    )
                  );
                })
              );
            })
          )
        ),
        React.createElement(
          "div",
          {
            class:
              "flex items-center gap-2 rounded-md border px-3 py-1.5 text-[11px] font-medium",
            classList: {
              "border-teal/20 bg-teal/5 text-teal": d() === 0,
              "border-amber/30 bg-amber/5 text-amber": d() > 0,
            },
          },
          React.createElement("span", {
            class: "h-1.5 w-1.5 shrink-0 rounded-full",
            classList: {
              "bg-teal": d() === 0,
              "bg-amber animate-pulse": d() > 0,
            },
          }),
          React.createElement(
            p,
            { when: d() > 0, fallback: "No conflicts detected" },
            d(),
            " merge point",
            d() !== 1 ? "s" : "",
            " ",
            "detected"
          )
        )
      )
    );
  },
  hn = [
    { id: "dashboard", label: "Dashboard", shortcut: "1" },
    { id: "inspector", label: "Inspector", shortcut: "2" },
    { id: "routing", label: "Routing Matrix", shortcut: "3" },
    { id: "devices", label: "Devices", shortcut: "4" },
  ];
function Ye(e) {
  const t = String(e.getHours()).padStart(2, "0"),
    n = String(e.getMinutes()).padStart(2, "0"),
    a = String(e.getSeconds()).padStart(2, "0");
  return `${t}:${n}:${a}`;
}
const gn = (e) => {
    const [t, n] = E(Ye(new Date())),
      a = setInterval(() => n(Ye(new Date())), 1e3);
    D(() => clearInterval(a));
    const s = () => {
        const c = e.systemStatus();
        return c === "ok" ? "SYSTEM OK" : c === "warning" ? "WARNING" : "ERROR";
      },
      r = () => {
        const c = e.systemStatus();
        return c === "ok"
          ? "text-teal"
          : c === "warning"
            ? "text-amber"
            : "text-error";
      };
    return React.createElement(
      "header",
      {
        "data-testid": "header-bar",
        class:
          "flex h-11 items-center justify-between border-b border-edge bg-surface px-4 select-none",
        "data-tauri-drag-region": !0,
      },
      React.createElement(
        "div",
        {
          class: "flex items-center gap-3 min-w-[160px]",
          "data-tauri-drag-region": !0,
        },
        React.createElement(
          "div",
          { class: "flex items-center gap-2" },
          React.createElement(
            "div",
            {
              class:
                "h-4 w-4 rounded-sm bg-teal/20 flex items-center justify-center",
            },
            React.createElement("div", {
              class: "h-2 w-2 rounded-full bg-teal",
            })
          ),
          React.createElement(
            "span",
            { class: "text-sm font-semibold tracking-tight text-primary" },
            "LumenFlow"
          ),
          React.createElement(
            "span",
            {
              class:
                "rounded bg-teal/10 px-1.5 py-0.5 text-[10px] font-mono text-teal",
            },
            "v0.2"
          )
        )
      ),
      React.createElement(
        "nav",
        { class: "flex items-center gap-1", "data-testid": "header-tabs" },
        React.createElement(N, { each: hn }, (c) =>
          React.createElement(
            "button",
            {
              "data-testid": `tab-${c.id}`,
              onClick: () => e.onViewChange(c.id),
              class:
                "rounded-full px-3 py-1 text-xs font-medium transition-all duration-150",
              classList: {
                "bg-teal/10 text-teal": e.activeView() === c.id,
                "text-muted hover:text-secondary": e.activeView() !== c.id,
              },
              title: `${c.label} (${c.shortcut})`,
            },
            c.label
          )
        )
      ),
      React.createElement(
        "div",
        { class: "flex items-center gap-2 min-w-[160px] justify-end" },
        React.createElement(
          "div",
          { class: "relative" },
          React.createElement("input", {
            id: "lf-search",
            "data-testid": "search-input",
            type: "text",
            placeholder: "Search... ⌘K",
            value: e.searchQuery(),
            onInput: (c) => e.onSearchChange(c.currentTarget.value),
            class:
              "h-7 w-44 rounded-md border border-edge bg-obsidian px-3 pl-7 text-xs text-primary placeholder:text-muted focus:border-teal/40 focus:outline-none focus:ring-1 focus:ring-teal/20 transition-colors",
          }),
          React.createElement(
            "svg",
            {
              class:
                "absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted",
              fill: "none",
              viewBox: "0 0 24 24",
              stroke: "currentColor",
              "stroke-width": "2",
            },
            React.createElement("circle", { cx: "11", cy: "11", r: "8" }),
            React.createElement("path", { d: "m21 21-4.35-4.35" })
          )
        ),
        React.createElement("div", { class: "mx-1 h-4 w-px bg-edge" }),
        React.createElement(
          "div",
          { class: "flex items-center gap-1.5 text-xs" },
          React.createElement(
            p,
            {
              when: e.isConnected(),
              fallback: React.createElement(
                "span",
                { class: "flex items-center gap-1.5 text-muted" },
                React.createElement("span", {
                  class: "h-1.5 w-1.5 rounded-full bg-muted",
                }),
                "Offline"
              ),
            },
            React.createElement(
              "span",
              { class: "flex items-center gap-1.5 text-teal-dim" },
              React.createElement("span", {
                class: "h-1.5 w-1.5 rounded-full bg-teal animate-pulse",
              }),
              e.activeUniverseCount(),
              " uni"
            )
          )
        ),
        React.createElement("div", { class: "mx-1 h-4 w-px bg-edge" }),
        React.createElement(
          "span",
          {
            class: `text-[10px] font-mono font-medium tracking-wide ${r()}`,
            "data-testid": "system-status",
          },
          s()
        ),
        React.createElement(
          "span",
          {
            class: "font-mono text-[11px] tabular-nums text-muted",
            "data-testid": "header-clock",
          },
          t()
        ),
        React.createElement(
          "button",
          {
            "data-testid": "settings-button",
            onClick: e.onSettingsClick,
            class:
              "rounded-md p-1.5 text-muted hover:bg-surface-hover hover:text-secondary transition-colors",
            title: "Settings",
          },
          React.createElement(
            "svg",
            {
              class: "h-4 w-4",
              fill: "none",
              viewBox: "0 0 24 24",
              stroke: "currentColor",
              "stroke-width": "1.5",
            },
            React.createElement("path", {
              d: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.431.992a7.723 7.723 0 0 1 0 .255c-.007.378.138.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z",
            }),
            React.createElement("circle", { cx: "12", cy: "12", r: "3" })
          )
        )
      )
    );
  },
  pn = {
    connected: { dot: "bg-teal", text: "text-secondary", label: "UDP :6454" },
    connecting: {
      dot: "bg-amber animate-pulse",
      text: "text-muted",
      label: "Connecting...",
    },
    disconnected: {
      dot: "bg-error",
      text: "text-muted",
      label: "Disconnected",
    },
  },
  bn = (e) => {
    const t = () => pn[e.connectionState()];
    return React.createElement(
      "footer",
      {
        "data-testid": "status-bar",
        class:
          "flex h-6 items-center justify-between border-t border-edge bg-surface px-3 text-[11px] select-none",
      },
      React.createElement(
        "div",
        { class: "flex items-center gap-4" },
        React.createElement(
          "span",
          { class: `flex items-center gap-1.5 ${t().text}` },
          React.createElement("span", {
            class: `h-1.5 w-1.5 rounded-full ${t().dot}`,
          }),
          t().label
        ),
        React.createElement(
          "span",
          { class: "text-muted" },
          e.totalUniverseCount(),
          " universe",
          e.totalUniverseCount() !== 1 ? "s" : ""
        ),
        React.createElement(
          p,
          { when: e.packetRate() > 0 },
          React.createElement(
            "span",
            { class: "font-mono tabular-nums text-secondary" },
            e.packetRate(),
            " pkt/s"
          )
        )
      ),
      React.createElement(
        "div",
        { class: "flex items-center gap-4" },
        React.createElement(
          p,
          { when: e.selectedUniverse() !== null },
          React.createElement(
            "span",
            { class: "font-mono tabular-nums text-secondary" },
            "Uni ",
            e.selectedUniverse()
          )
        ),
        React.createElement(
          p,
          { when: e.isMockMode() },
          React.createElement(
            "span",
            {
              "data-testid": "mock-mode-badge",
              class:
                "rounded bg-amber/10 px-1.5 py-0.5 text-[10px] font-medium text-amber",
            },
            "MOCK"
          )
        )
      )
    );
  },
  En = (e) =>
    React.createElement(
      p,
      { when: e.isOpen() },
      React.createElement("div", {
        class: "fixed inset-0 z-40 bg-black/50 backdrop-blur-sm",
        onClick: e.onClose,
      }),
      React.createElement(
        "div",
        {
          class:
            "fixed right-0 top-0 z-50 flex h-full w-80 flex-col border-l border-edge bg-surface shadow-2xl",
        },
        React.createElement(
          "div",
          {
            class: "flex items-center justify-between border-b border-edge p-4",
          },
          React.createElement(
            "h2",
            { class: "text-sm font-medium text-primary" },
            "Settings"
          ),
          React.createElement(
            "button",
            {
              onClick: e.onClose,
              class:
                "rounded-md p-1 text-muted hover:bg-surface-hover hover:text-secondary transition-colors",
            },
            React.createElement(
              "svg",
              {
                class: "h-4 w-4",
                fill: "none",
                viewBox: "0 0 24 24",
                stroke: "currentColor",
                "stroke-width": "2",
              },
              React.createElement("path", { d: "M6 18 18 6M6 6l12 12" })
            )
          )
        ),
        React.createElement(
          "div",
          { class: "flex-1 overflow-auto p-4" },
          React.createElement(
            "div",
            { class: "flex flex-col gap-6" },
            React.createElement(
              "section",
              null,
              React.createElement(
                "h3",
                {
                  class:
                    "mb-3 text-xs font-medium uppercase tracking-wide text-muted",
                },
                "Development"
              ),
              React.createElement(
                "label",
                {
                  class:
                    "flex items-center justify-between rounded-md border border-edge bg-obsidian p-3",
                },
                React.createElement(
                  "div",
                  null,
                  React.createElement(
                    "div",
                    { class: "text-sm text-primary" },
                    "Mock Data Mode"
                  ),
                  React.createElement(
                    "div",
                    { class: "text-[11px] text-muted" },
                    "Simulate Art-Net data for UI development"
                  )
                ),
                React.createElement(
                  "button",
                  {
                    onClick: () => e.onToggleMockMode(!e.isMockMode()),
                    class:
                      "relative h-5 w-9 rounded-full transition-colors duration-200",
                    classList: {
                      "bg-teal": e.isMockMode(),
                      "bg-edge-active": !e.isMockMode(),
                    },
                  },
                  React.createElement("span", {
                    class:
                      "absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform duration-200",
                    classList: {
                      "translate-x-4": e.isMockMode(),
                      "translate-x-0.5": !e.isMockMode(),
                    },
                  })
                )
              )
            ),
            React.createElement(
              "section",
              null,
              React.createElement(
                "h3",
                {
                  class:
                    "mb-3 text-xs font-medium uppercase tracking-wide text-muted",
                },
                "Display"
              ),
              React.createElement(
                "div",
                { class: "flex flex-col gap-2" },
                React.createElement(
                  "div",
                  {
                    class:
                      "flex items-center justify-between rounded-md border border-edge bg-obsidian p-3",
                  },
                  React.createElement(
                    "div",
                    { class: "text-sm text-primary" },
                    "Grid Columns"
                  ),
                  React.createElement(
                    "div",
                    {
                      class:
                        "flex items-center gap-1 rounded border border-edge bg-surface",
                    },
                    React.createElement(
                      "button",
                      {
                        onClick: () => e.onGridColumnsChange(16),
                        class:
                          "rounded-l px-2 py-0.5 text-[11px] font-mono transition-colors",
                        classList: {
                          "bg-teal/10 text-teal": e.gridColumns() === 16,
                          "text-muted hover:text-secondary":
                            e.gridColumns() !== 16,
                        },
                      },
                      "16"
                    ),
                    React.createElement(
                      "button",
                      {
                        onClick: () => e.onGridColumnsChange(32),
                        class:
                          "rounded-r px-2 py-0.5 text-[11px] font-mono transition-colors",
                        classList: {
                          "bg-teal/10 text-teal": e.gridColumns() === 32,
                          "text-muted hover:text-secondary":
                            e.gridColumns() !== 32,
                        },
                      },
                      "32"
                    )
                  )
                ),
                React.createElement(
                  "div",
                  {
                    class:
                      "flex items-center justify-between rounded-md border border-edge bg-obsidian p-3",
                  },
                  React.createElement(
                    "div",
                    null,
                    React.createElement(
                      "div",
                      { class: "text-sm text-primary" },
                      "Emit Rate"
                    ),
                    React.createElement(
                      "div",
                      { class: "text-[11px] text-muted" },
                      "IPC update frequency"
                    )
                  ),
                  React.createElement(
                    "div",
                    { class: "flex items-center gap-2" },
                    React.createElement("input", {
                      type: "range",
                      min: "10",
                      max: "60",
                      step: "5",
                      value: e.emitRate(),
                      onInput: (t) =>
                        e.onEmitRateChange(parseInt(t.currentTarget.value)),
                      class:
                        "h-1 w-20 appearance-none rounded bg-edge accent-teal",
                    }),
                    React.createElement(
                      "span",
                      {
                        class:
                          "w-10 text-right font-mono text-[11px] tabular-nums text-secondary",
                      },
                      e.emitRate(),
                      " Hz"
                    )
                  )
                )
              )
            ),
            React.createElement(
              "section",
              null,
              React.createElement(
                "h3",
                {
                  class:
                    "mb-3 text-xs font-medium uppercase tracking-wide text-muted",
                },
                "Network"
              ),
              React.createElement(
                "div",
                { class: "rounded-md border border-edge bg-obsidian p-3" },
                React.createElement(
                  "div",
                  { class: "grid grid-cols-2 gap-x-4 gap-y-2 text-xs" },
                  React.createElement(
                    "span",
                    { class: "text-muted" },
                    "Protocol"
                  ),
                  React.createElement(
                    "span",
                    { class: "font-mono text-secondary" },
                    "Art-Net 4"
                  ),
                  React.createElement(
                    "span",
                    { class: "text-muted" },
                    "Listen Port"
                  ),
                  React.createElement(
                    "span",
                    { class: "font-mono text-secondary" },
                    "UDP 6454"
                  ),
                  React.createElement(
                    "span",
                    { class: "text-muted" },
                    "Universe Range"
                  ),
                  React.createElement(
                    "span",
                    { class: "font-mono text-secondary" },
                    "0 — 32,767"
                  ),
                  React.createElement(
                    "span",
                    { class: "text-muted" },
                    "Channels / Uni"
                  ),
                  React.createElement(
                    "span",
                    { class: "font-mono text-secondary" },
                    "512"
                  )
                )
              )
            ),
            React.createElement(
              "section",
              null,
              React.createElement(
                "h3",
                {
                  class:
                    "mb-3 text-xs font-medium uppercase tracking-wide text-muted",
                },
                "About"
              ),
              React.createElement(
                "div",
                {
                  class:
                    "rounded-md border border-edge bg-obsidian p-3 text-xs text-muted",
                },
                React.createElement(
                  "div",
                  { class: "mb-1 text-sm text-primary" },
                  "LumenFlow"
                ),
                React.createElement(
                  "div",
                  null,
                  "Professional Art-Net 4 Monitoring & Control"
                ),
                React.createElement(
                  "div",
                  { class: "mt-2 font-mono text-[10px]" },
                  "v0.2.0-alpha · Tauri 2 + SolidJS + Rust"
                )
              )
            )
          )
        )
      )
    ),
  Rn = (e) =>
    React.createElement(
      zt,
      {
        fallback: (t, n) => (
          console.error("[LumenFlow] Render error:", t),
          React.createElement(
            "div",
            { class: "flex h-full items-center justify-center p-8" },
            React.createElement(
              "div",
              {
                class:
                  "max-w-md rounded-lg border border-error/20 bg-surface p-6 text-center",
              },
              React.createElement(
                "div",
                { class: "mb-3 text-error" },
                React.createElement(
                  "svg",
                  {
                    class: "mx-auto h-8 w-8",
                    fill: "none",
                    viewBox: "0 0 24 24",
                    stroke: "currentColor",
                    "stroke-width": "1.5",
                  },
                  React.createElement("path", {
                    d: "M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z",
                  })
                )
              ),
              React.createElement(
                "h3",
                { class: "mb-2 text-sm font-medium text-error" },
                "Something went wrong"
              ),
              React.createElement(
                "p",
                { class: "mb-4 font-mono text-xs text-muted break-all" },
                t instanceof Error ? t.message : String(t)
              ),
              React.createElement(
                "button",
                {
                  onClick: n,
                  class:
                    "rounded-md border border-error/20 bg-error/10 px-4 py-1.5 text-xs font-medium text-error transition-colors hover:bg-error/20",
                },
                "Retry"
              )
            )
          )
        ),
      },
      e.children
    );
let vn = 0;
const [Xe, pt] = E([]);
function bt(e) {
  pt((t) => t.filter((n) => n.id !== e));
}
function Ze(e, t = "info", n = 3e3) {
  const a = vn++;
  (pt((s) => [...s, { id: a, type: t, message: e, duration: n }]),
    n > 0 && setTimeout(() => bt(a), n));
}
function wn(e) {
  bt(e);
}
const yn = {
    info: {
      bg: "bg-surface",
      border: "border-edge",
      text: "text-secondary",
      dot: "bg-teal",
    },
    success: {
      bg: "bg-surface",
      border: "border-teal/20",
      text: "text-teal",
      dot: "bg-teal",
    },
    warning: {
      bg: "bg-surface",
      border: "border-amber/20",
      text: "text-amber",
      dot: "bg-amber",
    },
    error: {
      bg: "bg-surface",
      border: "border-error/20",
      text: "text-error",
      dot: "bg-error",
    },
  },
  kn = () =>
    React.createElement(
      p,
      { when: Xe().length > 0 },
      React.createElement(
        "div",
        { class: "fixed bottom-10 right-4 z-50 flex flex-col gap-2" },
        React.createElement(N, { each: Xe() }, (e) => {
          const t = yn[e.type];
          return React.createElement(
            "div",
            {
              class: `flex items-center gap-2.5 rounded-lg border px-3 py-2 shadow-lg ${t.bg} ${t.border} animate-[slideIn_0.2s_ease-out]`,
              onClick: () => wn(e.id),
            },
            React.createElement("span", {
              class: `h-1.5 w-1.5 flex-shrink-0 rounded-full ${t.dot}`,
            }),
            React.createElement(
              "span",
              { class: `text-xs ${t.text}` },
              e.message
            )
          );
        })
      )
    ),
  Sn = (e) => {
    let t, n;
    const a = () => e.height ?? 200;
    return (
      F(() => {
        let s = !0;
        function r(c) {
          s && (n = requestAnimationFrame(r));
        }
        ((n = requestAnimationFrame(r)),
          D(() => {
            ((s = !1), n !== void 0 && cancelAnimationFrame(n));
          }));
      }),
      React.createElement("canvas", {
        ref: t,
        style: {
          width: e.width !== void 0 ? `${e.width}px` : "100%",
          height: `${a()}px`,
          display: "block",
        },
      })
    );
  },
  Cn = (e) => {
    let t, n;
    return (
      F(() => {
        let a = !0;
        function s(r) {
          a && (n = requestAnimationFrame(s));
        }
        ((n = requestAnimationFrame(s)),
          D(() => {
            ((a = !1), n !== void 0 && cancelAnimationFrame(n));
          }));
      }),
      React.createElement("canvas", {
        ref: t,
        style: { width: "100%", height: "200px", display: "block" },
      })
    );
  },
  An = (e) =>
    React.createElement(
      "div",
      { class: "rounded-lg border border-edge bg-surface p-4" },
      React.createElement(
        "h2",
        {
          class:
            "text-sm font-medium tracking-wide uppercase text-secondary mb-3",
        },
        "Network Diagnostics"
      ),
      React.createElement(
        "div",
        { class: "flex gap-4" },
        React.createElement(
          "div",
          { class: "flex-1 min-w-0" },
          React.createElement(Cn, { data: e.networkLoadMbps })
        ),
        React.createElement(
          "div",
          { class: "flex-1 min-w-0" },
          React.createElement(Sn, { samples: e.jitterSamples, height: 200 })
        )
      ),
      React.createElement(
        "div",
        { class: "mt-3 flex items-center gap-4 text-[10px] text-muted" },
        React.createElement(
          "div",
          { class: "flex items-center gap-1.5" },
          React.createElement("span", {
            class: "inline-block h-2 w-2 rounded-sm",
            style: { background: "rgba(30,58,95,0.85)" },
          }),
          React.createElement("span", null, "Low")
        ),
        React.createElement(
          "div",
          { class: "flex items-center gap-1.5" },
          React.createElement("span", {
            class: "inline-block h-2 w-2 rounded-sm",
            style: { background: "rgba(45,212,191,0.7)" },
          }),
          React.createElement("span", null, "Medium")
        ),
        React.createElement(
          "div",
          { class: "flex items-center gap-1.5" },
          React.createElement("span", {
            class: "inline-block h-2 w-2 rounded-sm",
            style: { background: "rgba(34,197,94,0.65)" },
          }),
          React.createElement("span", null, "High")
        )
      )
    ),
  Z = 512,
  Mn = 80,
  _n = 120,
  In = 120,
  Et = {
    sine: (e, t) => Math.round(127.5 + 127.5 * Math.sin(t * 0.002 + e * 0.05)),
    chase: (e, t) => {
      const n = (t * 0.05) % Z,
        a = Math.abs(e - n);
      return a < 8 ? Math.round(255 * Math.max(0, 1 - a / 8)) : 0;
    },
    random: (e, t) => Math.round(Math.random() * 255),
    strobe: (e, t) => (Math.floor(t * 0.01) % 2 === 0 ? 255 : 0),
    gradient: (e, t) => Math.round((e / Z) * 255),
    dimmer: (e, t) => {
      const n = Math.floor(e / 4);
      return Math.round(127.5 + 127.5 * Math.sin(t * 0.001 + n * 0.3));
    },
    flicker: (e, t) => {
      const n = Math.round(127.5 + 127.5 * Math.sin(t * 0.003 + e * 0.1));
      return Math.random() > 0.95
        ? Math.min(255, n + Math.round(Math.random() * 60))
        : n;
    },
    static: (e, t) => (e % 3 === 0 ? 200 : e % 3 === 1 ? 100 : 0),
  },
  Je = Object.keys(Et),
  Qe = ["192.168.1.10", "192.168.1.20", "10.0.0.5", "2.0.0.1", "192.168.2.100"];
function Dn(e) {
  const t = Je[e % Je.length];
  return Et[t];
}
function Ln(e) {
  const t = [];
  for (let n = 0; n < e; n++) {
    const a = new Array(Z).fill(0),
      s = new Array(Z).fill(0);
    t.push({
      id: n,
      channels: a,
      snapshot: s,
      sourceIp: Qe[n % Qe.length],
      packetsPerSecond: 40 + Math.floor(Math.random() * 5),
      lastSeen: Date.now(),
    });
  }
  return t;
}
function On(e) {
  const t = e.channels,
    n = e.snapshot;
  for (let a = 0; a < Z; a++) n[a] = t[a];
  return n;
}
function et(e, t) {
  for (let n = 0; n < e.length; n++) {
    const a = Dn(n),
      s = e[n],
      r = s.channels;
    for (let c = 0; c < Z; c++) r[c] = a(c, t);
    ((s.packetsPerSecond = 40 + Math.floor(Math.random() * 5)),
      (s.lastSeen = Date.now()));
  }
}
function Rt(e, t) {
  const n = Math.random() || 1e-4,
    a = Math.random();
  return e + t * Math.sqrt(-2 * Math.log(n)) * Math.cos(2 * Math.PI * a);
}
function Me() {
  const e = [];
  for (let t = 0; t < Mn; t++) e.push(Math.max(0, Rt(22.7, 1.2)));
  return {
    jitterSamples: e,
    artSyncActive: !0,
    sourceIps: [
      { ip: "192.168.1.10", role: "master" },
      { ip: "192.168.1.20", role: "backup" },
      { ip: "10.0.0.5", role: "secondary" },
    ],
    flickerChannels: [47, 128, 391],
    packetRateHistory: Array.from(
      { length: _n },
      () => 40 + Math.floor(Math.random() * 5)
    ),
    networkLoadMbps: Array.from(
      { length: In },
      (t, n) => 2.5 + 1.5 * Math.sin(n * 0.08) + Math.random() * 0.3
    ),
  };
}
function _e(e, t) {
  (e.copyWithin(0, 1), (e[e.length - 1] = t));
}
function tt(e, t) {
  const n = Math.abs(Rt(22.7, t % 5e3 < 200 ? 3.5 : 1.2));
  (_e(e.jitterSamples, n),
    _e(e.packetRateHistory, 40 + Math.floor(Math.random() * 5)));
  const a = 2.5 + 1.5 * Math.sin(t * 3e-4) + Math.random() * 0.3;
  if ((_e(e.networkLoadMbps, a), Math.random() > 0.98)) {
    const s = Math.floor(Math.random() * 512);
    e.flickerChannels.length < 6 &&
      !e.flickerChannels.includes(s) &&
      e.flickerChannels.push(s);
  }
  Math.random() > 0.99 &&
    e.flickerChannels.length > 1 &&
    e.flickerChannels.shift();
}
function Nn() {
  return [
    {
      ip_address: "192.168.1.10",
      mac_address: "00:1A:2B:3C:4D:5E",
      short_name: "MA3 onPC",
      long_name: "grandMA3 onPC - Main Programmer",
      firmware_version: 786,
      oem_code: 1073,
      port_addresses: [0, 1, 2, 3],
    },
    {
      ip_address: "192.168.1.20",
      mac_address: "AA:BB:CC:DD:EE:01",
      short_name: "ArtGate 4",
      long_name: "Luminex ArtGate 4 - Stage Left",
      firmware_version: 517,
      oem_code: 2160,
      port_addresses: [0, 1, 2, 3],
    },
    {
      ip_address: "10.0.0.5",
      mac_address: "00:50:C2:DE:AD:01",
      short_name: "Pixl Node",
      long_name: "Enttec Pixlite 16 - LED Wall",
      firmware_version: 1024,
      oem_code: 104,
      port_addresses: [4, 5, 6, 7],
    },
    {
      ip_address: "2.0.0.1",
      mac_address: "DE:AD:BE:EF:00:01",
      short_name: "ETC Gio",
      long_name: "ETC Gio @5 - FOH Console",
      firmware_version: 769,
      oem_code: 2168,
      port_addresses: [0, 1],
    },
    {
      ip_address: "192.168.2.100",
      mac_address: "AA:CC:22:44:66:88",
      short_name: "DMX King",
      long_name: "DMX King ultraDMX Micro - Effects",
      firmware_version: 272,
      oem_code: 2304,
      port_addresses: [6, 7],
    },
  ];
}
var nt;
(function (e) {
  ((e.WINDOW_RESIZED = "tauri://resize"),
    (e.WINDOW_MOVED = "tauri://move"),
    (e.WINDOW_CLOSE_REQUESTED = "tauri://close-requested"),
    (e.WINDOW_DESTROYED = "tauri://destroyed"),
    (e.WINDOW_FOCUS = "tauri://focus"),
    (e.WINDOW_BLUR = "tauri://blur"),
    (e.WINDOW_SCALE_FACTOR_CHANGED = "tauri://scale-change"),
    (e.WINDOW_THEME_CHANGED = "tauri://theme-changed"),
    (e.WINDOW_CREATED = "tauri://window-created"),
    (e.WEBVIEW_CREATED = "tauri://webview-created"),
    (e.DRAG_ENTER = "tauri://drag-enter"),
    (e.DRAG_OVER = "tauri://drag-over"),
    (e.DRAG_DROP = "tauri://drag-drop"),
    (e.DRAG_LEAVE = "tauri://drag-leave"));
})(nt || (nt = {}));
async function Pn(e, t) {
  (window.__TAURI_EVENT_PLUGIN_INTERNALS__.unregisterListener(e, t),
    await oe("plugin:event|unlisten", { event: e, eventId: t }));
}
async function Un(e, t, n) {
  var a;
  const s = (a = void 0) !== null && a !== void 0 ? a : { kind: "Any" };
  return oe("plugin:event|listen", {
    event: e,
    target: s,
    handler: dn(t),
  }).then((r) => async () => Pn(e, r));
}
function $n(e) {
  const t = new Uint8Array(e),
    n = new DataView(t.buffer),
    a = [];
  let s = 0;
  for (; s + 4 <= t.length; ) {
    const r = n.getUint16(s, !0),
      c = n.getUint16(s + 2, !0);
    if (((s += 4), s + c > t.length)) break;
    (a.push({ universeId: r, data: t.slice(s, s + c) }), (s += c));
  }
  return a;
}
function Tn(e) {
  const [t, n] = xt({});
  return (
    F(async () => {
      const a = await Un("dmx-frame", (s) => {
        const r = $n(s.payload);
        for (const c of r) {
          const l = Array.from(c.data);
          n(
            Ne((u) => {
              u[c.universeId] = l;
            })
          );
        }
      });
      D(() => a());
    }),
    H(() => {
      const a = e();
      oe("set_active_universes", { ids: a }).catch(console.error);
    }),
    t
  );
}
async function Fn() {
  return oe("get_available_universes");
}
const jn = () => {
    const [e, t] = E(!0),
      [n, a] = E(!1),
      [s, r] = E(""),
      [c, l] = E(32),
      [u, o] = E(30),
      [d, m] = E([]),
      [i, f] = E(null),
      [x, R] = E("dashboard"),
      [A, _] = E(!0),
      [S, g] = xt({}),
      [w, y] = E([]),
      [O, Q] = E([]),
      [ke, vt] = E(0),
      [Pe, wt] = E(0),
      [yt, Ue] = E(0),
      [kt, St] = E(Date.now()),
      [ee, $e] = E(Me()),
      Ct = setInterval(() => St(Date.now()), 1e3);
    let P = [],
      j,
      B = 0,
      te = Me();
    function Te() {
      rt(() => {
        for (const h of P) {
          const b = On(h);
          (g(
            Ne((I) => {
              I[h.id] = b;
            })
          ),
            se.push(h.id, b));
        }
        (y(
          P.map((h) => ({
            universeId: h.id,
            sourceIp: h.sourceIp,
            packetsPerSecond: h.packetsPerSecond,
            lastSeen: h.lastSeen,
          }))
        ),
          vt(
            Math.round(P.reduce((h, b) => h + b.packetsPerSecond, 0) / P.length)
          ),
          $e({ ...te }));
      });
    }
    function At() {
      ((P = Ln(8)), Q(Nn()), (te = Me()), $e({ ...te }));
      const h = P.map((b) => b.id);
      (m(h),
        i() === null && h.length > 0 && f(h[0] ?? null),
        Ze("Mock data mode enabled", "info", 2e3),
        (j = setInterval(() => {
          ((B += 16), et(P, B), tt(te, B), Te());
        }, 1e3 / u())));
    }
    function Fe() {
      (j !== void 0 && (clearInterval(j), (j = void 0)),
        (P = []),
        (B = 0),
        Q([]),
        se.clear(),
        Ze("Mock data mode disabled", "info", 2e3));
    }
    const Mt = () => {
      const h = i();
      return h !== null ? [h] : [];
    };
    let ie;
    function _t() {
      const h = Tn(Mt);
      (H(() => {
        const b = i();
        b !== null &&
          h[b] &&
          (Ue(Date.now()),
          g(
            Ne((I) => {
              I[b] = h[b];
            })
          ),
          se.push(b, h[b]));
      }),
        (ie = setInterval(async () => {
          try {
            const b = await Fn();
            (m(b),
              b.length > 0 && Ue(Date.now()),
              i() === null && b.length > 0 && f(b[0] ?? null));
          } catch {}
        }, 1e3)));
    }
    function je() {
      ie !== void 0 && (clearInterval(ie), (ie = void 0));
    }
    (H(() => {
      e() ? (je(), At()) : (Fe(), _t());
    }),
      D(() => {
        (Fe(), je(), clearInterval(Ct));
      }),
      H(() => {
        const h = u();
        e() &&
          j !== void 0 &&
          (clearInterval(j),
          (j = setInterval(() => {
            ((B += 16), et(P, B), tt(te, B), Te());
          }, 1e3 / h)));
      }));
    const Se = () => {
        if (e()) return d().length > 0 ? "connected" : "connecting";
        const h = yt();
        return h === 0
          ? "connecting"
          : kt() - h > 5e3
            ? "disconnected"
            : "connected";
      },
      It = () => Se() === "connected",
      Dt = () => {
        if (Se() === "disconnected") return "error";
        const h = ee();
        return h.flickerChannels.length > 4 ||
          (h.jitterSamples[h.jitterSamples.length - 1] ?? 0) > 30
          ? "warning"
          : "ok";
      },
      Lt = () => A() && (x() === "dashboard" || x() === "inspector");
    return (
      H(() => {
        const h = (b) => {
          var G;
          const I = b.target,
            de =
              I.tagName === "INPUT" ||
              I.tagName === "TEXTAREA" ||
              I.isContentEditable;
          if ((b.metaKey || b.ctrlKey) && b.key === "k") {
            (b.preventDefault(),
              (G = document.getElementById("lf-search")) == null || G.focus());
            return;
          }
          if (!de)
            switch (b.key) {
              case "1":
                R("dashboard");
                break;
              case "2":
                R("inspector");
                break;
              case "3":
                R("routing");
                break;
              case "4":
                R("devices");
                break;
              case "Escape":
                (a(!1), wt((Ot) => Ot + 1));
                break;
            }
        };
        (document.addEventListener("keydown", h),
          D(() => document.removeEventListener("keydown", h)));
      }),
      React.createElement(
        "div",
        { class: "flex h-screen w-screen flex-col bg-obsidian text-primary" },
        React.createElement(gn, {
          isConnected: It,
          activeUniverseCount: () => d().length,
          searchQuery: s,
          onSearchChange: r,
          onSettingsClick: () => a(!0),
          activeView: x,
          onViewChange: (h) => R(h),
          systemStatus: Dt,
        }),
        React.createElement(
          "div",
          { class: "flex flex-1 overflow-hidden" },
          React.createElement(
            p,
            { when: Lt() },
            React.createElement(
              "aside",
              {
                "data-testid": "sidebar",
                class:
                  "flex w-44 flex-shrink-0 flex-col border-r border-edge bg-surface",
              },
              React.createElement(
                "div",
                { class: "flex items-center justify-between px-3 pt-3 pb-1" },
                React.createElement(
                  "h3",
                  {
                    class:
                      "text-[10px] font-medium uppercase tracking-widest text-muted",
                  },
                  "Universes"
                ),
                React.createElement(
                  "button",
                  {
                    onClick: () => _(!1),
                    class:
                      "rounded p-0.5 text-muted hover:text-secondary hover:bg-surface-hover transition-colors",
                    title: "Collapse sidebar",
                  },
                  React.createElement(
                    "svg",
                    {
                      class: "h-3.5 w-3.5",
                      fill: "none",
                      viewBox: "0 0 24 24",
                      stroke: "currentColor",
                      "stroke-width": "2",
                    },
                    React.createElement("path", { d: "M15 19l-7-7 7-7" })
                  )
                )
              ),
              React.createElement(
                "div",
                { class: "flex-1 overflow-auto px-3 pb-3" },
                React.createElement(
                  p,
                  {
                    when: d().length > 0,
                    fallback: React.createElement(
                      "div",
                      { class: "py-6 text-center text-xs text-muted" },
                      React.createElement(
                        "div",
                        { class: "mb-1 text-sm" },
                        "Waiting..."
                      ),
                      React.createElement(
                        "p",
                        { class: "text-[10px]" },
                        "Send Art-Net to :6454"
                      )
                    ),
                  },
                  React.createElement(
                    "div",
                    { class: "flex flex-col gap-0.5" },
                    React.createElement(N, { each: d() }, (h) => {
                      const b = () => {
                        const I = S[h];
                        if (!I) return 0;
                        let de = 0;
                        for (let G = 0; G < I.length; G++) de += I[G] ?? 0;
                        return de / (I.length * 255);
                      };
                      return React.createElement(
                        "button",
                        {
                          "data-testid": `universe-${h}`,
                          onClick: () => {
                            (f(h), x() === "dashboard" || R("inspector"));
                          },
                          class:
                            "group flex items-center justify-between rounded-md px-2 py-1 text-left text-xs transition-all duration-100",
                          classList: {
                            "bg-teal/10 text-teal border border-teal/20":
                              i() === h,
                            "text-secondary hover:bg-surface-hover hover:text-primary border border-transparent":
                              i() !== h,
                          },
                        },
                        React.createElement(
                          "span",
                          { class: "font-mono tabular-nums" },
                          "Uni ",
                          h
                        ),
                        React.createElement(
                          p,
                          { when: b() > 0 },
                          React.createElement("span", {
                            class: "h-1.5 w-1.5 rounded-full",
                            classList: {
                              "bg-teal": b() > 0.3,
                              "bg-teal/50": b() > 0 && b() <= 0.3,
                            },
                          })
                        )
                      );
                    })
                  )
                )
              )
            )
          ),
          React.createElement(
            p,
            { when: !A() && (x() === "dashboard" || x() === "inspector") },
            React.createElement(
              "button",
              {
                onClick: () => _(!0),
                class:
                  "flex-shrink-0 border-r border-edge bg-surface px-1.5 py-2 text-muted hover:text-secondary hover:bg-surface-hover transition-colors",
                title: "Expand sidebar",
              },
              React.createElement(
                "svg",
                {
                  class: "h-3.5 w-3.5",
                  fill: "none",
                  viewBox: "0 0 24 24",
                  stroke: "currentColor",
                  "stroke-width": "2",
                },
                React.createElement("path", { d: "M9 5l7 7-7 7" })
              )
            )
          ),
          React.createElement(
            "main",
            { class: "flex-1 overflow-auto" },
            React.createElement(
              Rn,
              null,
              React.createElement(
                p,
                { when: x() === "dashboard" },
                React.createElement(
                  "div",
                  {
                    class: "flex h-full flex-col",
                    "data-testid": "dashboard-view",
                  },
                  React.createElement(
                    "div",
                    {
                      class: "flex flex-1 min-h-0",
                      style: { "flex-basis": "65%" },
                    },
                    React.createElement(
                      "div",
                      {
                        class:
                          "w-2/5 flex-shrink-0 overflow-auto border-r border-edge p-4",
                      },
                      React.createElement(
                        p,
                        { when: d().length > 0 },
                        React.createElement(Ke, {
                          universes: d,
                          selectedUniverse: i,
                          onSelect: (h) => f(h),
                          universeData: S,
                        })
                      )
                    ),
                    React.createElement(
                      "div",
                      { class: "flex-1 overflow-auto p-4" },
                      React.createElement(
                        p,
                        {
                          when: i() !== null,
                          fallback: React.createElement(
                            "div",
                            {
                              class:
                                "flex h-full flex-col items-center justify-center text-center",
                            },
                            React.createElement(
                              "h2",
                              {
                                class:
                                  "text-lg font-semibold text-primary mb-2",
                              },
                              "LumenFlow"
                            ),
                            React.createElement(
                              "p",
                              { class: "text-xs text-secondary max-w-sm mb-4" },
                              "Select a universe from the heatmap or sidebar to preview channel data."
                            ),
                            React.createElement(
                              "div",
                              {
                                class:
                                  "rounded-lg border border-edge bg-surface p-4",
                              },
                              React.createElement(
                                "div",
                                {
                                  class:
                                    "grid grid-cols-2 gap-x-6 gap-y-1.5 text-left text-xs",
                                },
                                React.createElement(
                                  "span",
                                  { class: "text-muted" },
                                  "Protocol"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "font-mono text-secondary" },
                                  "Art-Net 4"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "text-muted" },
                                  "Port"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "font-mono text-secondary" },
                                  "UDP 6454"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "text-muted" },
                                  "Universes"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "font-mono text-secondary" },
                                  "0 — 32,767"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "text-muted" },
                                  "Channels"
                                ),
                                React.createElement(
                                  "span",
                                  { class: "font-mono text-secondary" },
                                  "512 / uni"
                                )
                              )
                            )
                          ),
                        },
                        React.createElement(qe, {
                          universeId: i(),
                          channels: () => S[i()],
                          clearTrigger: Pe,
                        })
                      )
                    )
                  ),
                  React.createElement(
                    "div",
                    {
                      class: "flex-shrink-0 border-t border-edge p-4",
                      style: { "flex-basis": "35%", "min-height": "200px" },
                    },
                    React.createElement(An, {
                      jitterSamples: () => ee().jitterSamples,
                      networkLoadMbps: () => ee().networkLoadMbps,
                    })
                  )
                )
              ),
              React.createElement(
                p,
                { when: x() === "inspector" },
                React.createElement(
                  "div",
                  {
                    class: "flex h-full flex-col p-5",
                    "data-testid": "inspector-view",
                  },
                  React.createElement(
                    p,
                    { when: d().length > 0 },
                    React.createElement(
                      "div",
                      { class: "mb-4" },
                      React.createElement(Ke, {
                        universes: d,
                        selectedUniverse: i,
                        onSelect: (h) => f(h),
                        universeData: S,
                      })
                    )
                  ),
                  React.createElement(
                    p,
                    {
                      when: i() !== null,
                      fallback: React.createElement(
                        "div",
                        {
                          class:
                            "flex h-[60vh] flex-col items-center justify-center text-center",
                        },
                        React.createElement(
                          "h2",
                          { class: "text-xl font-semibold text-primary mb-2" },
                          "Channel Inspector"
                        ),
                        React.createElement(
                          "p",
                          { class: "text-sm text-secondary max-w-md" },
                          "Select a universe to inspect its 512 DMX channels."
                        )
                      ),
                    },
                    React.createElement(
                      "div",
                      { class: "flex flex-1 gap-4 min-h-0" },
                      React.createElement(
                        "div",
                        { class: "flex-1 overflow-auto" },
                        React.createElement(qe, {
                          universeId: i(),
                          channels: () => S[i()],
                          clearTrigger: Pe,
                        })
                      ),
                      React.createElement(
                        "div",
                        { class: "w-64 flex-shrink-0 overflow-auto" },
                        React.createElement(gt, {
                          sourceIps: () => ee().sourceIps,
                          artSyncActive: () => ee().artSyncActive,
                        })
                      )
                    )
                  )
                )
              ),
              React.createElement(
                p,
                { when: x() === "routing" },
                React.createElement(
                  "div",
                  { class: "p-5", "data-testid": "routing-view" },
                  React.createElement(
                    p,
                    {
                      when: e(),
                      fallback: React.createElement(ze, {
                        universes: d,
                        routes: w,
                      }),
                    },
                    React.createElement(ze, {
                      universes: d,
                      routes: w,
                      devices: () => O(),
                    })
                  )
                )
              ),
              React.createElement(
                p,
                { when: x() === "devices" },
                React.createElement(
                  "div",
                  { class: "p-5", "data-testid": "devices-view" },
                  React.createElement(un, { mockDevices: e() ? O() : void 0 })
                )
              )
            )
          )
        ),
        React.createElement(bn, {
          connectionState: Se,
          packetRate: ke,
          activeUniverseCount: () => (i() !== null ? 1 : 0),
          totalUniverseCount: () => d().length,
          selectedUniverse: i,
          isMockMode: e,
        }),
        React.createElement(En, {
          isOpen: n,
          onClose: () => a(!1),
          isMockMode: e,
          onToggleMockMode: (h) => t(h),
          gridColumns: c,
          onGridColumnsChange: l,
          emitRate: u,
          onEmitRateChange: o,
        }),
        React.createElement(kn, null)
      )
    );
  },
  Bn = document.getElementById("root");
Xt(() => React.createElement(jn, null), Bn);
