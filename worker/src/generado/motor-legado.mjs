// GENERADO por app/scripts/motor-worker.mjs desde app/src/supervisor/legado — no editar a mano.
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// node_modules/react/cjs/react.production.min.js
var require_react_production_min = __commonJS({
  "node_modules/react/cjs/react.production.min.js"(exports) {
    "use strict";
    var l = Symbol.for("react.element");
    var n = Symbol.for("react.portal");
    var p = Symbol.for("react.fragment");
    var q = Symbol.for("react.strict_mode");
    var r = Symbol.for("react.profiler");
    var t = Symbol.for("react.provider");
    var u = Symbol.for("react.context");
    var v = Symbol.for("react.forward_ref");
    var w = Symbol.for("react.suspense");
    var x = Symbol.for("react.memo");
    var y = Symbol.for("react.lazy");
    var z = Symbol.iterator;
    function A(a) {
      if (null === a || "object" !== typeof a) return null;
      a = z && a[z] || a["@@iterator"];
      return "function" === typeof a ? a : null;
    }
    var B = { isMounted: function() {
      return false;
    }, enqueueForceUpdate: function() {
    }, enqueueReplaceState: function() {
    }, enqueueSetState: function() {
    } };
    var C = Object.assign;
    var D = {};
    function E(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    E.prototype.isReactComponent = {};
    E.prototype.setState = function(a, b) {
      if ("object" !== typeof a && "function" !== typeof a && null != a) throw Error("setState(...): takes an object of state variables to update or a function which returns an object of state variables.");
      this.updater.enqueueSetState(this, a, b, "setState");
    };
    E.prototype.forceUpdate = function(a) {
      this.updater.enqueueForceUpdate(this, a, "forceUpdate");
    };
    function F() {
    }
    F.prototype = E.prototype;
    function G(a, b, e) {
      this.props = a;
      this.context = b;
      this.refs = D;
      this.updater = e || B;
    }
    var H = G.prototype = new F();
    H.constructor = G;
    C(H, E.prototype);
    H.isPureReactComponent = true;
    var I = Array.isArray;
    var J = Object.prototype.hasOwnProperty;
    var K = { current: null };
    var L = { key: true, ref: true, __self: true, __source: true };
    function M(a, b, e) {
      var d, c = {}, k = null, h = null;
      if (null != b) for (d in void 0 !== b.ref && (h = b.ref), void 0 !== b.key && (k = "" + b.key), b) J.call(b, d) && !L.hasOwnProperty(d) && (c[d] = b[d]);
      var g = arguments.length - 2;
      if (1 === g) c.children = e;
      else if (1 < g) {
        for (var f = Array(g), m = 0; m < g; m++) f[m] = arguments[m + 2];
        c.children = f;
      }
      if (a && a.defaultProps) for (d in g = a.defaultProps, g) void 0 === c[d] && (c[d] = g[d]);
      return { $$typeof: l, type: a, key: k, ref: h, props: c, _owner: K.current };
    }
    function N(a, b) {
      return { $$typeof: l, type: a.type, key: b, ref: a.ref, props: a.props, _owner: a._owner };
    }
    function O(a) {
      return "object" === typeof a && null !== a && a.$$typeof === l;
    }
    function escape2(a) {
      var b = { "=": "=0", ":": "=2" };
      return "$" + a.replace(/[=:]/g, function(a2) {
        return b[a2];
      });
    }
    var P = /\/+/g;
    function Q(a, b) {
      return "object" === typeof a && null !== a && null != a.key ? escape2("" + a.key) : b.toString(36);
    }
    function R(a, b, e, d, c) {
      var k = typeof a;
      if ("undefined" === k || "boolean" === k) a = null;
      var h = false;
      if (null === a) h = true;
      else switch (k) {
        case "string":
        case "number":
          h = true;
          break;
        case "object":
          switch (a.$$typeof) {
            case l:
            case n:
              h = true;
          }
      }
      if (h) return h = a, c = c(h), a = "" === d ? "." + Q(h, 0) : d, I(c) ? (e = "", null != a && (e = a.replace(P, "$&/") + "/"), R(c, b, e, "", function(a2) {
        return a2;
      })) : null != c && (O(c) && (c = N(c, e + (!c.key || h && h.key === c.key ? "" : ("" + c.key).replace(P, "$&/") + "/") + a)), b.push(c)), 1;
      h = 0;
      d = "" === d ? "." : d + ":";
      if (I(a)) for (var g = 0; g < a.length; g++) {
        k = a[g];
        var f = d + Q(k, g);
        h += R(k, b, e, f, c);
      }
      else if (f = A(a), "function" === typeof f) for (a = f.call(a), g = 0; !(k = a.next()).done; ) k = k.value, f = d + Q(k, g++), h += R(k, b, e, f, c);
      else if ("object" === k) throw b = String(a), Error("Objects are not valid as a React child (found: " + ("[object Object]" === b ? "object with keys {" + Object.keys(a).join(", ") + "}" : b) + "). If you meant to render a collection of children, use an array instead.");
      return h;
    }
    function S(a, b, e) {
      if (null == a) return a;
      var d = [], c = 0;
      R(a, d, "", "", function(a2) {
        return b.call(e, a2, c++);
      });
      return d;
    }
    function T(a) {
      if (-1 === a._status) {
        var b = a._result;
        b = b();
        b.then(function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 1, a._result = b2;
        }, function(b2) {
          if (0 === a._status || -1 === a._status) a._status = 2, a._result = b2;
        });
        -1 === a._status && (a._status = 0, a._result = b);
      }
      if (1 === a._status) return a._result.default;
      throw a._result;
    }
    var U = { current: null };
    var V = { transition: null };
    var W = { ReactCurrentDispatcher: U, ReactCurrentBatchConfig: V, ReactCurrentOwner: K };
    function X() {
      throw Error("act(...) is not supported in production builds of React.");
    }
    exports.Children = { map: S, forEach: function(a, b, e) {
      S(a, function() {
        b.apply(this, arguments);
      }, e);
    }, count: function(a) {
      var b = 0;
      S(a, function() {
        b++;
      });
      return b;
    }, toArray: function(a) {
      return S(a, function(a2) {
        return a2;
      }) || [];
    }, only: function(a) {
      if (!O(a)) throw Error("React.Children.only expected to receive a single React element child.");
      return a;
    } };
    exports.Component = E;
    exports.Fragment = p;
    exports.Profiler = r;
    exports.PureComponent = G;
    exports.StrictMode = q;
    exports.Suspense = w;
    exports.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED = W;
    exports.act = X;
    exports.cloneElement = function(a, b, e) {
      if (null === a || void 0 === a) throw Error("React.cloneElement(...): The argument must be a React element, but you passed " + a + ".");
      var d = C({}, a.props), c = a.key, k = a.ref, h = a._owner;
      if (null != b) {
        void 0 !== b.ref && (k = b.ref, h = K.current);
        void 0 !== b.key && (c = "" + b.key);
        if (a.type && a.type.defaultProps) var g = a.type.defaultProps;
        for (f in b) J.call(b, f) && !L.hasOwnProperty(f) && (d[f] = void 0 === b[f] && void 0 !== g ? g[f] : b[f]);
      }
      var f = arguments.length - 2;
      if (1 === f) d.children = e;
      else if (1 < f) {
        g = Array(f);
        for (var m = 0; m < f; m++) g[m] = arguments[m + 2];
        d.children = g;
      }
      return { $$typeof: l, type: a.type, key: c, ref: k, props: d, _owner: h };
    };
    exports.createContext = function(a) {
      a = { $$typeof: u, _currentValue: a, _currentValue2: a, _threadCount: 0, Provider: null, Consumer: null, _defaultValue: null, _globalName: null };
      a.Provider = { $$typeof: t, _context: a };
      return a.Consumer = a;
    };
    exports.createElement = M;
    exports.createFactory = function(a) {
      var b = M.bind(null, a);
      b.type = a;
      return b;
    };
    exports.createRef = function() {
      return { current: null };
    };
    exports.forwardRef = function(a) {
      return { $$typeof: v, render: a };
    };
    exports.isValidElement = O;
    exports.lazy = function(a) {
      return { $$typeof: y, _payload: { _status: -1, _result: a }, _init: T };
    };
    exports.memo = function(a, b) {
      return { $$typeof: x, type: a, compare: void 0 === b ? null : b };
    };
    exports.startTransition = function(a) {
      var b = V.transition;
      V.transition = {};
      try {
        a();
      } finally {
        V.transition = b;
      }
    };
    exports.unstable_act = X;
    exports.useCallback = function(a, b) {
      return U.current.useCallback(a, b);
    };
    exports.useContext = function(a) {
      return U.current.useContext(a);
    };
    exports.useDebugValue = function() {
    };
    exports.useDeferredValue = function(a) {
      return U.current.useDeferredValue(a);
    };
    exports.useEffect = function(a, b) {
      return U.current.useEffect(a, b);
    };
    exports.useId = function() {
      return U.current.useId();
    };
    exports.useImperativeHandle = function(a, b, e) {
      return U.current.useImperativeHandle(a, b, e);
    };
    exports.useInsertionEffect = function(a, b) {
      return U.current.useInsertionEffect(a, b);
    };
    exports.useLayoutEffect = function(a, b) {
      return U.current.useLayoutEffect(a, b);
    };
    exports.useMemo = function(a, b) {
      return U.current.useMemo(a, b);
    };
    exports.useReducer = function(a, b, e) {
      return U.current.useReducer(a, b, e);
    };
    exports.useRef = function(a) {
      return U.current.useRef(a);
    };
    exports.useState = function(a) {
      return U.current.useState(a);
    };
    exports.useSyncExternalStore = function(a, b, e) {
      return U.current.useSyncExternalStore(a, b, e);
    };
    exports.useTransition = function() {
      return U.current.useTransition();
    };
    exports.version = "18.3.1";
  }
});

// node_modules/react/index.js
var require_react = __commonJS({
  "node_modules/react/index.js"(exports, module) {
    "use strict";
    if (true) {
      module.exports = require_react_production_min();
    } else {
      module.exports = null;
    }
  }
});

// src/lib/reloj.ts
var TZ = "America/Guayaquil";
var desfaseMs = 0;
function ahora() {
  return new Date(Date.now() + desfaseMs);
}
function partes(d = ahora()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    weekday: "short"
  }).formatToParts(d).map((x) => [x.type, x.value]));
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return { anio: +p.year, mes: +p.month, dia: +p.day, hora: +p.hour, minuto: +p.minute, segundo: +p.second, diaSemana: dias[p.weekday] };
}
var dos = (n) => String(n).padStart(2, "0");
function hoyStr(d = ahora()) {
  const p = partes(d);
  return `${p.anio}-${dos(p.mes)}-${dos(p.dia)}`;
}

// src/supervisor/legado/util.ts
var HORA_ENTRADA_REF = 450;
var HORA_SALIDA_REF = 975;
var feriados = /* @__PURE__ */ new Set();
function fijarFeriados(lista) {
  feriados = new Set(lista);
}
function getLocalHoyStr() {
  return hoyStr();
}
function diaSemana(fechaStr) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
function sumarDias(fechaStr, n) {
  const [y, m, d] = fechaStr.split("-").map(Number);
  const x = new Date(Date.UTC(y, m - 1, d + n));
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`;
}
function escapeHtml(str) {
  if (!str) return "";
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
function obtenerMinutos(valor) {
  if (!valor) return null;
  if (typeof valor === "number") {
    if (valor > 0 && valor < 1) {
      const s = Math.round(valor * 86400);
      return Math.floor(s / 3600) * 60 + Math.floor(s % 3600 / 60);
    }
    return null;
  }
  if (typeof valor === "string") {
    const s = valor.trim();
    if (!s) return null;
    const ampmMatch = s.match(/(a\.?\s*m\.?|p\.?\s*m\.?|am|pm)/i);
    const m12 = s.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
    if (m12) {
      let h = parseInt(m12[1], 10);
      const m = parseInt(m12[2], 10);
      if (ampmMatch) {
        const isPm = /p/i.test(ampmMatch[1]);
        const isAm = /a/i.test(ampmMatch[1]);
        if (isPm && h < 12) h += 12;
        if (isAm && h === 12) h = 0;
      }
      return h * 60 + m;
    }
  }
  return null;
}
function minsToHHMM(mins) {
  if (mins === null || mins === void 0 || isNaN(mins)) return "--:--";
  const h = Math.floor(Math.abs(Math.round(mins)) / 60);
  const m = Math.abs(Math.round(mins)) % 60;
  return String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0");
}
function formatearHora(valor) {
  const m = obtenerMinutos(valor);
  if (m === null || isNaN(m)) return "--:--";
  return minsToHHMM(m);
}
function calcularPct(v, t) {
  return t ? Math.round(v / t * 100) : 0;
}
function formatearMinutos(min) {
  if (!min) return "0m";
  const h = Math.floor(Math.abs(min) / 60);
  const m = Math.abs(min) % 60;
  return h ? h + "h " + m + "m" : m + "m";
}
function formatearHorasDecimal(minutos) {
  if (!minutos) return "0.00";
  return (minutos / 60).toFixed(2);
}
function minutosAHHMMSS(minutos) {
  if (!minutos || minutos < 0) return "00:00:00";
  const horas = Math.floor(minutos / 60);
  const mins = Math.floor(minutos % 60);
  const segs = Math.floor(minutos % 1 * 60);
  return String(horas).padStart(2, "0") + ":" + String(mins).padStart(2, "0") + ":" + String(segs).padStart(2, "0");
}
function calcularNetWorkedOrdinario(periodosDia, esFestivo) {
  if (esFestivo) return 0;
  let ordBruto = 0;
  let hasLunchGap = false;
  let ultimoSalidaMins = null;
  periodosDia.forEach((p) => {
    if (!p || !p.entrada || !p.salida) return;
    const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
    const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
    if (mE === null || mS === null || mS <= mE) return;
    if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
      if (!hasLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
        const gap = mE - ultimoSalidaMins;
        if (gap >= 30) hasLunchGap = true;
      }
    }
    ultimoSalidaMins = mS;
    const ordE = Math.max(HORA_ENTRADA_REF, mE);
    const ordS = Math.min(HORA_SALIDA_REF, mS);
    if (ordS > ordE) ordBruto += ordS - ordE;
  });
  let ordNeto = ordBruto;
  if (!hasLunchGap && ordNeto > 240) ordNeto -= 45;
  return Math.max(0, ordNeto);
}
function esFeriadoODomingo(fechaStr) {
  if (!fechaStr) return false;
  if (diaSemana(fechaStr) === 0) return true;
  return feriados.has(fechaStr);
}
function esEmpleadoSoloAlmuerzo(e) {
  if (!e) return false;
  if (e.isSinAsistencia || e.isVisitante) return true;
  const cargo = String(e.cargo || "").toUpperCase().trim();
  const area = String(e.area || e.departamento || "").toUpperCase().trim();
  const tipo = String(e.tipo || e.tipoRegistro || "").toUpperCase().trim();
  if (cargo === "SIN ASISTENCIA" || cargo.includes("SIN ASISTENCIA") || cargo.includes("SOLO ALMUERZO") || cargo.includes("COMENSAL")) return true;
  if (area.includes("SOLO ALMUERZO") || area.includes("COMENSAL")) return true;
  if (tipo.includes("SOLO ALMUERZO") || tipo.includes("COMENSAL")) return true;
  if (e.soloAlmuerzo === true || String(e.soloAlmuerzo).toUpperCase() === "SI") return true;
  return false;
}
function esEmpleadoExcluidoAsistencia(e) {
  if (!e) return true;
  if (esEmpleadoSoloAlmuerzo(e)) return true;
  const tipo = String(e.tipoRegistro || e.tipo || "").toUpperCase();
  return tipo === "MASTER" || tipo === "VISITANTE";
}
function esEmpleadoPasante(e) {
  if (!e) return false;
  const cargo = String(e.cargo || e.tipo_cargo || e.rol || "").toUpperCase().trim();
  const area = String(e.area || e.departamento || "").toUpperCase().trim();
  const tipo = String(e.tipo || e.tipoRegistro || e.tipo_empleado || "").toUpperCase().trim();
  if (cargo.includes("PASANTE") || cargo.includes("PASANTIA") || cargo.includes("PASANT\xCDA")) return true;
  if (area.includes("PASANTE") || area.includes("PASANTIA") || area.includes("PASANT\xCDA")) return true;
  if (tipo.includes("PASANTE") || tipo.includes("PASANTIA") || tipo.includes("PASANT\xCDA")) return true;
  return false;
}
function fixFotoUrl(url, size = 200) {
  if (!url) return null;
  url = url.trim();
  if (url.startsWith("data:image") || url.startsWith("blob:") || url.startsWith("/") || url.startsWith("./")) return url;
  if (url.includes("googleusercontent.com/d/")) return url.includes("=") ? url : `${url}=w${size}`;
  if (url.includes("drive.google.com/file/d/")) {
    const m = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  if (url.includes("drive.google.com/open?id=") || url.includes("/uc?export=view&id=") || url.includes("/uc?id=") || url.includes("id=")) {
    const m = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  if (url.includes("/d/")) {
    const m = url.match(/\/d\/([a-zA-Z0-9_-]+)/);
    if (m) return `https://lh3.googleusercontent.com/d/${m[1]}=w${size}`;
  }
  return url;
}
var MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sept", "oct", "nov", "dic"];
function generarPeriodos(hoy = getLocalHoyStr()) {
  const [y, m, d] = hoy.split("-").map(Number);
  let baseMonth = m - 1;
  if (d >= 26) baseMonth += 1;
  const lista = [];
  const f = (yy, mm, dd) => {
    const x = new Date(Date.UTC(yy, mm, dd));
    return { s: `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}-${String(x.getUTCDate()).padStart(2, "0")}`, d: x };
  };
  for (let i = 0; i < 12; i++) {
    const ini = f(y, baseMonth - i - 1, 26);
    const fin = f(y, baseMonth - i, 25);
    const label = `${ini.d.getUTCDate()} ${MESES_CORTOS[ini.d.getUTCMonth()]} \u2014 ${fin.d.getUTCDate()} ${MESES_CORTOS[fin.d.getUTCMonth()]} ${fin.d.getUTCFullYear()}`;
    lista.push({ inicio: ini.s, fin: fin.s, label: i === 0 ? "\u2B50 " + label + " (Actual)" : label });
  }
  return lista;
}
var DIAS_SEMANA = ["Dom", "Lun", "Mar", "Mi\xE9", "Jue", "Vie", "S\xE1b"];
function obtenerDiaSemanaStr(fechaStr) {
  if (!fechaStr || !/^\d{4}-\d{2}-\d{2}/.test(fechaStr)) return "";
  return DIAS_SEMANA[diaSemana(fechaStr.slice(0, 10))];
}
function normalizarFechaStr(val) {
  if (!val || val === "undefined") return "";
  const s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const mYMD = s.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (mYMD) return `${mYMD[1]}-${mYMD[2].padStart(2, "0")}-${mYMD[3].padStart(2, "0")}`;
  const m1 = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, "0")}-${m1[1].padStart(2, "0")}`;
  return s;
}
function obtenerDiasHabiles(inicio, fin) {
  const dias = [];
  let f = inicio;
  while (f <= fin) {
    const dia = diaSemana(f);
    if (dia >= 1 && dia <= 5 && !esFeriadoODomingo(f)) dias.push(f);
    f = sumarDias(f, 1);
  }
  return dias;
}
function obtenerFechaInicioEfectivaEmpleado(e, rangoIniFallback) {
  if (!e) return rangoIniFallback;
  const fIngRaw = e.fecha_ingreso || e.fechaIngreso || e.fecha_inicio || e.fechaInicio;
  if (fIngRaw && String(fIngRaw).trim().length >= 10) {
    const fi = normalizarFechaStr(fIngRaw);
    if (fi && /^\d{4}-\d{2}-\d{2}$/.test(fi) && fi >= "2020-01-01") return fi;
  }
  const regs = Array.isArray(e.registros) ? e.registros : [];
  if (regs.length > 0) {
    const fechasReg = regs.map((r) => normalizarFechaStr(r.fecha)).filter((f) => f && /^\d{4}-\d{2}-\d{2}$/.test(f) && f >= "2020-01-01").sort();
    if (fechasReg.length > 0) return fechasReg[0];
  }
  return getLocalHoyStr();
}
function clasificarGap(salidaReg, gap) {
  if (!salidaReg) return { tipo: "justificar", mins: gap };
  const razon = String(salidaReg.razon_salida || "").toLowerCase();
  const tipo = String(salidaReg.tipo_salida || "").toLowerCase();
  const razonPermiso = String(salidaReg.razon_permiso || "").toLowerCase();
  if (razon === "permiso_medico" || tipo.includes("medico") || razonPermiso.includes("medico")) return { tipo: "medico", mins: gap };
  if (razon === "permiso_personal" || razon === "cumpleanos" || tipo.includes("personal") || razonPermiso.includes("personal")) return { tipo: "personal", mins: gap };
  return { tipo: "justificar", mins: gap };
}
function mapRazonAusenciaATipo(razon) {
  if (!razon) return "FALTA";
  const r = razon.toString().trim().toLowerCase();
  if (r.includes("vacaci\xF3n") || r.includes("vacacion") || r.includes("vacaciones")) return "VACACIONES";
  if (r.includes("m\xE9dico") || r.includes("medico")) return "PERMISO_MEDICO";
  if (r.includes("personal")) return "PERMISO_PERSONAL";
  if (r.includes("falta justificada") || r.includes("salida justificada")) return "FALTA_JUSTIFICADA";
  if (r.includes("dom\xE9stica") || r.includes("domestica") || r.includes("calamidad")) return "CALAMIDAD_DOMESTICA";
  if (r.includes("campo")) return "TRABAJO_DE_CAMPO";
  return r.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, "_");
}
function parsearInputTiempo(str) {
  const s = String(str || "").trim().toLowerCase();
  const mh = s.match(/^(\d+)h(?:(\d+)m?)?$/);
  if (mh) return parseInt(mh[1]) * 60 + parseInt(mh[2] || "0");
  const mc = s.match(/^(\d+):(\d{1,2})$/);
  if (mc) return parseInt(mc[1]) * 60 + parseInt(mc[2]);
  const n = parseInt(s);
  return isNaN(n) ? null : n;
}
function calcularAlmuerzosPeriodo(e, R_INI, R_FIN) {
  const todosRegs = (e.registros || []).map((r) => {
    const fNorm = normalizarFechaStr(r.fecha);
    return fNorm ? { ...r, fecha: fNorm } : r;
  });
  const regsPeriodo = todosRegs.filter((r) => r.fecha >= R_INI && r.fecha <= R_FIN);
  const fechasAsistidas = new Set(regsPeriodo.filter((r) => r.tipo === "ENTRADA").map((r) => normalizarFechaStr(r.fecha)).filter(Boolean));
  const esSinAsis = (e.cargo || "").toUpperCase() === "SIN ASISTENCIA";
  let almPlanta = 0;
  let almFuera = 0;
  const regsPorFecha = {};
  regsPeriodo.forEach((r) => {
    const fNorm = normalizarFechaStr(r.fecha);
    if (!fNorm) return;
    (regsPorFecha[fNorm] ||= []).push(r);
  });
  Object.keys(regsPorFecha).forEach((fNorm) => {
    if (!fechasAsistidas.has(fNorm) && !esSinAsis) return;
    const regsDia = regsPorFecha[fNorm];
    const salidaTemprana = regsDia.some((r) => {
      if (r.tipo === "SALIDA" && r.hora) {
        const parts = r.hora.split(":");
        return parseInt(parts[0]) * 60 + parseInt(parts[1]) < 570;
      }
      return false;
    });
    if (salidaTemprana) {
      almFuera++;
      return;
    }
    const regsAlm = regsDia.filter((r) => r.tipo === "ENTRADA" || r.tipo === "SOLO_ALMUERZO");
    const regPrincipal = regsAlm.find((r) => r.tipo === "ENTRADA") || regsAlm[0];
    if (regPrincipal) {
      const valAlm = regPrincipal.almuerzo;
      if (valAlm === "SI" || valAlm === "PLANTA") almPlanta++;
      else if (valAlm === "NO" || valAlm === "FUERA") almFuera++;
    }
  });
  return { almPlanta, almFuera };
}
function desglosarObservacionesInvitado(rawObs) {
  let obs = String(rawObs || "").trim();
  let horaReq = "", area = "", sol = "";
  const matchHora = obs.match(/\[Hora\s*req:\s*([^\]]+)\]/i);
  if (matchHora) {
    horaReq = matchHora[1].trim();
    obs = obs.replace(matchHora[0], "").trim();
  }
  const matchArea = obs.match(/\[Área:\s*([^\]]+)\]/i) || obs.match(/\[Area:\s*([^\]]+)\]/i);
  if (matchArea) {
    area = matchArea[1].trim();
    obs = obs.replace(matchArea[0], "").trim();
  }
  const matchSol = obs.match(/\(Sol:\s*([^)]+)\)/i);
  if (matchSol) {
    sol = matchSol[1].trim();
    obs = obs.replace(matchSol[0], "").trim();
  }
  obs = obs.replace(/\s{2,}/g, " ").trim();
  return { obsLimpia: obs, horaReq, area, sol };
}
function esAlmuerzoExtraItem(ae) {
  if (!ae) return false;
  if (ae.estado === "CANCELADO") return false;
  const t = String(ae.subtipo || ae.tipoSolicitud || ae.tipo || "").toUpperCase();
  return !t.includes("REFRIGERIO") && !t.includes("SANDUCHE") && !t.includes("GALLETA");
}
function obtenerListaConsolidadaInvitados(solicitudes) {
  const lista = [];
  (solicitudes || []).forEach((s) => {
    if (s.estado === "CANCELADO") return;
    const id = s.id || `inv_${s.fecha}_${s.hora}_${s.empleadoId}`;
    const fNorm = normalizarFechaStr(s.fecha) || s.fecha;
    let invitadoLimpio = (s.invitado || "").trim() || "Invitado";
    let solicitanteDetectado = s.empleadoNombre || "Colaborador";
    const matchInvS = invitadoLimpio.match(/^(.*?)\s*\(Inv\.\s*de\s*(.*?)\)$/i);
    if (matchInvS) {
      invitadoLimpio = matchInvS[1].trim();
      if (!s.empleadoNombre || s.empleadoNombre === "Colaborador") solicitanteDetectado = matchInvS[2].trim();
    }
    const desg = desglosarObservacionesInvitado(s.observaciones || s.observacionesCompletas || "");
    lista.push({
      id,
      fecha: fNorm,
      hora: s.hora || "",
      solicitante: solicitanteDetectado || desg.sol || "Colaborador",
      empleadoId: s.empleadoId || "",
      area: s.empleadoArea || desg.area || "",
      tipoSolicitud: s.tipoSolicitud || "ALMUERZO_EXTRA",
      subtipo: s.subtipo || s.tipoSolicitud || "ALMUERZO_EXTRA",
      cantidad: parseInt(s.cantidad) || 1,
      invitado: invitadoLimpio,
      empresa: s.empresa || "TCONTROL",
      horaServicio: s.horaServicio || desg.horaReq || "",
      observaciones: desg.obsLimpia || "",
      estado: s.estado || "SOLICITADO",
      origen: "FIRESTORE",
      filaIndex: null
    });
  });
  lista.sort((a, b) => (b.fecha || "").localeCompare(a.fecha || "") || (b.hora || "").localeCompare(a.hora || ""));
  return lista;
}
function obtenerAlmuerzosExtraConsolidados(solicitudes, fechaInicio = null, fechaFin = null) {
  const fIniNorm = fechaInicio ? normalizarFechaStr(fechaInicio) : null;
  const fFinNorm = fechaFin ? normalizarFechaStr(fechaFin) : null;
  return obtenerListaConsolidadaInvitados(solicitudes).filter((item) => {
    if (item.estado === "CANCELADO") return false;
    if (!esAlmuerzoExtraItem(item)) return false;
    const fNorm = normalizarFechaStr(item.fecha);
    if (!fNorm) return false;
    if (fIniNorm && fNorm < fIniNorm) return false;
    if (fFinNorm && fNorm > fFinNorm) return false;
    return true;
  });
}
function debounce(fn, delay) {
  let t;
  return (...args) => {
    if (t) clearTimeout(t);
    t = window.setTimeout(() => fn(...args), delay);
  };
}

// src/supervisor/legado/reportes.ts
var COLUMNAS_DISPONIBLES = [
  { id: "area", label: "\xC1rea", tipo: "texto", cat: "general", catLabel: "Datos Generales", icono: "fa-building", color: "#475569", colorBg: "#f8fafc", colorHeader: "#334155" },
  { id: "asistencias", label: "Asistencias", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-user-check", color: "#047857", colorBg: "#ecfdf5", colorHeader: "#047857" },
  { id: "entradas", label: "Entradas Reg.", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-sign-in-alt", color: "#059669", colorBg: "#ecfdf5", colorHeader: "#059669" },
  { id: "entradasAuto", label: "Entradas Auto.", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-robot", color: "#d97706", colorBg: "#fffbeb", colorHeader: "#d97706" },
  { id: "salidas", label: "Salidas Reg.", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-sign-out-alt", color: "#0284c7", colorBg: "#f0f9ff", colorHeader: "#0284c7" },
  { id: "salidasAuto", label: "Salidas Auto.", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-magic", color: "#7c3aed", colorBg: "#faf5ff", colorHeader: "#7c3aed" },
  { id: "diasCampo", label: "D\xEDas Campo", tipo: "numero", cat: "campo", catLabel: "Trabajo en Campo", icono: "fa-hard-hat", color: "#0891b2", colorBg: "#ecfeff", colorHeader: "#0891b2" },
  { id: "faltas", label: "Faltas", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-calendar-times", color: "#b91c1c", colorBg: "#fef2f2", colorHeader: "#b91c1c" },
  { id: "diasVacaciones", label: "Vacaciones", tipo: "numero", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-umbrella-beach", color: "#059669", colorBg: "#ecfdf5", colorHeader: "#059669" },
  { id: "diasJustificados", label: "D\xEDas Justificados", tipo: "numero", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-shield-alt", color: "#7c3aed", colorBg: "#f5f3ff", colorHeader: "#7c3aed" },
  { id: "diasExtras", label: "D\xEDas Extras", tipo: "numero", cat: "extras", catLabel: "Horas Extraordinarias", icono: "fa-calendar-plus", color: "#4338ca", colorBg: "#eef2ff", colorHeader: "#4338ca" },
  { id: "atrasos", label: "N\xBA Atrasos", tipo: "numero", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-clock", color: "#d97706", colorBg: "#fffbeb", colorHeader: "#d97706" },
  { id: "minutosAtrasos", label: "Tiempo Atrasos", tipo: "tiempo", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-hourglass-half", color: "#b45309", colorBg: "#fffbeb", colorHeader: "#b45309" },
  { id: "almPlanta", label: "Alm. Planta", tipo: "numero", cat: "almuerzos", catLabel: "Almuerzos", icono: "fa-utensils", color: "#0284c7", colorBg: "#f0f9ff", colorHeader: "#0284c7" },
  { id: "almFuera", label: "Alm. Fuera", tipo: "numero", cat: "almuerzos", catLabel: "Almuerzos", icono: "fa-box", color: "#0369a1", colorBg: "#f0f9ff", colorHeader: "#0369a1" },
  { id: "puntualidad", label: "Puntualidad", tipo: "pct", cat: "asistencia", catLabel: "Asistencia y Puntualidad", icono: "fa-chart-pie", color: "#15803d", colorBg: "#f0fdf4", colorHeader: "#15803d" },
  { id: "permisoMedico", label: "Permiso M\xE9dico", tipo: "tiempo", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-notes-medical", color: "#0d9488", colorBg: "#f0fdfa", colorHeader: "#0d9488" },
  { id: "permisoPersonal", label: "Permiso Personal", tipo: "tiempo", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-user-clock", color: "#7c3aed", colorBg: "#f5f3ff", colorHeader: "#7c3aed" },
  { id: "tiempoPorJustificar", label: "Por Justificar", tipo: "tiempo", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-question-circle", color: "#c026d3", colorBg: "#fdf4ff", colorHeader: "#c026d3" },
  { id: "tiempoADescontar", label: "A Descontar", tipo: "tiempo", cat: "permisos", catLabel: "Permisos y Descuentos", icono: "fa-file-invoice-dollar", color: "#be123c", colorBg: "#fff1f2", colorHeader: "#be123c" },
  { id: "horasExtra50", label: "H. Extra 50% (A)", tipo: "tiempo", cat: "extras", catLabel: "Horas Extraordinarias", icono: "fa-bolt", color: "#1d4ed8", colorBg: "#eff6ff", colorHeader: "#1d4ed8" },
  { id: "horasExtra100", label: "H. Extra 100% (B)", tipo: "tiempo", cat: "extras", catLabel: "Horas Extraordinarias", icono: "fa-fire", color: "#4338ca", colorBg: "#eef2ff", colorHeader: "#4338ca" },
  { id: "horasCampoNormales", label: "Campo Normal", tipo: "tiempo", cat: "campo", catLabel: "Trabajo en Campo", icono: "fa-hard-hat", color: "#0891b2", colorBg: "#ecfeff", colorHeader: "#0891b2" },
  { id: "horasCampo50", label: "Campo 50% (C)", tipo: "tiempo", cat: "campo", catLabel: "Trabajo en Campo", icono: "fa-tools", color: "#0e7490", colorBg: "#ecfeff", colorHeader: "#0e7490" },
  { id: "horasCampo100", label: "Campo 100% (D)", tipo: "tiempo", cat: "campo", catLabel: "Trabajo en Campo", icono: "fa-wrench", color: "#155e75", colorBg: "#ecfeff", colorHeader: "#155e75" },
  { id: "totalExtras50", label: "Total 50% (A+C)", tipo: "tiempo", cat: "totalesExtras", catLabel: "Totales Extras", icono: "fa-calculator", color: "#1e3a8a", colorBg: "#dbeafe", colorHeader: "#1e3a8a" },
  { id: "totalExtras100", label: "Total 100% (B+D)", tipo: "tiempo", cat: "totalesExtras", catLabel: "Totales Extras", icono: "fa-coins", color: "#312e81", colorBg: "#e0e7ff", colorHeader: "#312e81" }
];
var DEFAULT_COLUMNAS_CUSTOM = [
  "area",
  "asistencias",
  "entradas",
  "salidas",
  "salidasAuto",
  "diasCampo",
  "faltas",
  "diasVacaciones",
  "diasJustificados",
  "diasExtras",
  "atrasos",
  "minutosAtrasos",
  "almPlanta",
  "puntualidad",
  "totalExtras50",
  "totalExtras100"
];
var CLAVE_COLUMNAS = "columnasCustomActivasReporte";
function obtenerColumnasCustomActivas() {
  try {
    const saved = localStorage.getItem(CLAVE_COLUMNAS);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        ["diasCampo", "diasVacaciones", "diasJustificados", "diasExtras", "entradas", "entradasAuto", "salidas", "salidasAuto"].forEach((colId) => {
          if (!parsed.includes(colId)) {
            const idxAsis = parsed.indexOf("asistencias");
            if (["entradas", "entradasAuto", "salidas", "salidasAuto"].includes(colId) && idxAsis > -1) parsed.splice(idxAsis + 1, 0, colId);
            else {
              const idxFaltas = parsed.indexOf("faltas");
              if (idxFaltas > -1) parsed.splice(idxFaltas + 1, 0, colId);
              else parsed.push(colId);
            }
          }
        });
        return parsed;
      }
    }
  } catch {
  }
  return [...DEFAULT_COLUMNAS_CUSTOM];
}
function guardarColumnasCustomActivas(columnas) {
  try {
    localStorage.setItem(CLAVE_COLUMNAS, JSON.stringify(columnas));
  } catch {
  }
}
function esRegistroAutocompletado(r) {
  if (!r) return false;
  const disp = String(r.dispositivo || "").trim().toUpperCase();
  const razonSal = String(r.razon_salida || r.razon_salida_temprana || "").toLowerCase();
  const razonJust = String(r.razon_justificac || r.razon_ausencia || "").toLowerCase();
  const razonEnt = String(r.razon_entrada_tardia || "").toLowerCase();
  const quien = String(r.quien_justifica || r.quienJustifica || r.quien_justifica_entrada || r.quienJustificaEntrada || "").trim().toUpperCase();
  const tipo = String(r.tipo || r.tipo_salida || "").trim().toUpperCase();
  return disp === "AUTO_COMPLETAR" || quien === "SISTEMA" || razonSal.includes("no registr") || razonJust.includes("no registr") || razonEnt.includes("no registr") || tipo.includes("AUTO");
}
function fechasDelRango(ini, fin) {
  const out = [];
  for (let f = ini; f <= fin; f = sumarDias(f, 1)) out.push(f);
  return out;
}
function esCampoOJornadaJustificada(regsDia) {
  return regsDia.some((r) => {
    const t = String(r.tipo || r.tipo_salida || "").toUpperCase();
    const m = String(r.modo || r.modo_trabajo || "").toUpperCase();
    const raz = String(r.razon_ausencia || r.razon_permiso || r.razon_justificac || r.razon_salida || r.observacion || "").toUpperCase();
    const est = String(r.estado || "").toUpperCase();
    return t.includes("CAMPO") || m.includes("CAMPO") || raz.includes("CAMPO") || est.includes("CAMPO") || r.justificado === "SI" || r.justificada === "SI" || t.includes("JUSTIFIC");
  });
}
function calcularStatEmpleado(e, R_INI, R_FIN, hoyRep) {
  const regsRango = (e.registros || []).filter((r) => r.fecha >= R_INI && r.fecha <= R_FIN);
  let numEntradasReg = 0, numEntradasAuto = 0, numSalidasReg = 0, numSalidasAuto = 0;
  regsRango.forEach((r) => {
    const tipo = String(r.tipo || "").toUpperCase();
    if (tipo === "ENTRADA") {
      if (esRegistroAutocompletado(r)) numEntradasAuto++;
      else numEntradasReg++;
    } else if (tipo === "SALIDA") {
      if (esRegistroAutocompletado(r)) numSalidasAuto++;
      else numSalidasReg++;
    }
  });
  const fSalida = e.fecha_salida || e.fechaDesvinculacion ? normalizarFechaStr(e.fecha_salida || e.fechaDesvinculacion) || e.fecha_salida : null;
  let finEvalEmp = R_FIN < hoyRep ? R_FIN : hoyRep;
  if (fSalida && fSalida < finEvalEmp) finEvalEmp = fSalida;
  let iniEvalEmp = R_INI;
  const fInicioEfectivo = obtenerFechaInicioEfectivaEmpleado(e, R_INI);
  if (fInicioEfectivo && fInicioEfectivo > R_INI) iniEvalEmp = fInicioEfectivo;
  const diasAsistidosPlantaSet = /* @__PURE__ */ new Set();
  const diasCampoSet = /* @__PURE__ */ new Set();
  const diasVacacionesSet = /* @__PURE__ */ new Set();
  const diasJustificadosSet = /* @__PURE__ */ new Set();
  const diasExtrasSet = /* @__PURE__ */ new Set();
  const diasFaltasSet = /* @__PURE__ */ new Set();
  let atrasos = 0, minutosAtrasos = 0;
  const resAlm = calcularAlmuerzosPeriodo(e, R_INI, R_FIN);
  const almPlanta = resAlm.almPlanta, almFuera = resAlm.almFuera;
  let horasExtra50 = 0, horasExtra100 = 0, horasCampoNormales = 0, horasCampo50 = 0, horasCampo100 = 0;
  let totalTiempoPersonal = 0, totalTiempoMedico = 0, totalTiempoPorJustificar = 0, totalDescuentoBruto = 0;
  const esPasanteEmp = esEmpleadoPasante(e);
  const todasLasFechas = fechasDelRango(R_INI, R_FIN);
  todasLasFechas.forEach((fecha) => {
    if (fSalida && fecha > fSalida) return;
    if (iniEvalEmp && fecha < iniEvalEmp) return;
    const regsDia = (e.registros || []).filter((r) => r.fecha === fecha);
    const dayOfWeek = diaSemana(fecha);
    const esFestivo = esFeriadoODomingo(fecha) || (dayOfWeek === 6 || dayOfWeek === 0);
    const esLaborable = !esFestivo;
    const esHoyOFuturo = fecha >= hoyRep;
    const esCampoHoy = regsDia.some((r) => {
      const tipo = String(r.tipo || r.tipo_salida || "").toUpperCase();
      const modo = String(r.modo || "").toUpperCase();
      const razAus = String(r.razon_ausencia || "").toLowerCase();
      const razJust = String(r.razon_justificac || "").toLowerCase();
      const razSal = String(r.razon_salida || r.razon_salida_temprana || "").toLowerCase();
      const aut = String(r.autoriza || "").toUpperCase();
      const estado2 = String(r.estado || "").toUpperCase();
      return tipo.includes("CAMPO") || modo === "CAMPO" || estado2.includes("CAMPO") || razAus.includes("campo") || razJust.includes("campo") || razSal.includes("campo") || aut.includes("CAMPO");
    });
    const esVacacionHoy = regsDia.some((r) => {
      const tipo = String(r.tipo || r.tipo_salida || "").toUpperCase();
      const razAus = String(r.razon_ausencia || "").toLowerCase();
      const razJust = String(r.razon_justificac || "").toLowerCase();
      return tipo.includes("VACAC") || razAus.includes("vacac") || razJust.includes("vacac");
    });
    const tieneEntradaPlanta = regsDia.some((r) => {
      const tipo = String(r.tipo || "").toUpperCase();
      return ["ENTRADA", "RETORNO_CAMPO"].includes(tipo) && String(r.modo || "").toUpperCase() !== "CAMPO";
    });
    const tieneAsistenciaHoy = regsDia.some((r) => ["ENTRADA", "SALIDA", "RETORNO_CAMPO", "SALIDA_CAMPO", "ENTRADA_CAMPO"].includes(String(r.tipo || "").toUpperCase()));
    const isJustificado = regsDia.some((r) => {
      const tipo = String(r.tipo || r.tipo_salida || "").toUpperCase();
      const razAus = String(r.razon_ausencia || "").trim();
      const razJust = String(r.razon_justificac || "").trim();
      if (tieneAsistenciaHoy && (tipo.includes("VACAC") || razAus.toUpperCase().includes("VACAC"))) return false;
      if (r.justificado === "SI" || r.justificado === true || r.justificada === "SI" || r.justificada === true) return true;
      if (razAus !== "" && razAus !== "\u2014" && razAus !== "-") return true;
      if (razJust !== "" && razJust !== "\u2014" && razJust !== "-") return true;
      if (["PERMISO_MEDICO", "PERMISO_PERSONAL", "CALAMIDAD_DOMESTICA", "SALIDA_JUSTIFICADA", "CUMPLEA\xD1OS", "CUMPLEANOS"].includes(tipo)) return true;
      if (r.razon_salida_temprana && ["permiso_medico", "cumpleanos", "permiso_personal", "salida_justificada"].includes(r.razon_salida_temprana)) return true;
      if (tipo && !["ENTRADA", "SALIDA", "ESTADO", "SOLO_ALMUERZO", "RETORNO_CAMPO", "SALIDA_CAMPO"].includes(tipo)) return true;
      return false;
    });
    if (esCampoHoy) diasCampoSet.add(fecha);
    if (tieneAsistenciaHoy || esCampoHoy) {
      if (esFestivo) diasExtrasSet.add(fecha);
      else if (tieneEntradaPlanta || !esCampoHoy && tieneAsistenciaHoy) diasAsistidosPlantaSet.add(fecha);
    } else if (esVacacionHoy) {
      if (esLaborable) diasVacacionesSet.add(fecha);
    } else if (isJustificado) {
      if (esLaborable) diasJustificadosSet.add(fecha);
    } else if (esLaborable && !esHoyOFuturo) {
      diasFaltasSet.add(fecha);
    }
    if (regsDia.length === 0) return;
    const primerReg = regsDia.find((r) => r.tipo === "ENTRADA" || r.tipo === "RETORNO_CAMPO" || r.tipo === "ENTRADA_CAMPO" || String(r.tipo || "").toUpperCase() === "ENTRADA_CAMPO");
    let atrasoMinsHoy = 0;
    if (primerReg && !esPasanteEmp) {
      const mE = obtenerMinutos(primerReg.hora || primerReg.timestamp);
      const refEntrada = esFestivo ? 420 : HORA_ENTRADA_REF;
      if (mE !== null && mE > refEntrada + 5) atrasoMinsHoy = mE - refEntrada;
    }
    const periodosDia = [];
    let entradaPendiente = null;
    const sortedRegs = [...regsDia].sort((a, b) => {
      if (a.timestamp && b.timestamp) return String(a.timestamp).localeCompare(String(b.timestamp));
      return String(a.hora || "").localeCompare(String(b.hora || ""));
    });
    sortedRegs.forEach((r) => {
      const tipo = String(r.tipo || "").toUpperCase();
      if (tipo === "ENTRADA" || tipo === "RETORNO_CAMPO" || tipo === "ENTRADA_CAMPO") entradaPendiente = r;
      else if (tipo === "SALIDA" || tipo === "SALIDA_CAMPO" || tipo === "SALIDA_PASANTE" || r.tipo_salida === "SALIDA_PASANTE" || r.razon_salida === "salida_pasante") {
        if (entradaPendiente) {
          periodosDia.push({ entrada: entradaPendiente, salida: r });
          entradaPendiente = null;
        } else periodosDia.push({ entrada: null, salida: r });
      }
    });
    if (entradaPendiente) periodosDia.push({ entrada: entradaPendiente, salida: null });
    let minutosTrabajadosHoy = 0, tiempoPersonalHoy = 0, tiempoMedicoHoy = 0, tiempoJustificarHoy = 0;
    const hasCumpleanos = regsDia.some((r) => {
      const raz = String(r.razon_ausencia || "").toLowerCase();
      const tip = String(r.tipo || r.tipo_salida || "").toUpperCase();
      return raz.includes("cumplea") || raz.includes("cumplean") || tip.includes("CUMPLE");
    });
    let ultimoSalidaMins = null;
    let ultimoSalidaReg = null;
    let processedLunchGap = false;
    periodosDia.forEach((p) => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      minutosTrabajadosHoy += mS - mE;
      if (ultimoSalidaMins !== null && mE > ultimoSalidaMins) {
        let gap = mE - ultimoSalidaMins;
        if (!processedLunchGap && ultimoSalidaMins >= 690 && ultimoSalidaMins <= 870) {
          gap -= Math.min(45, gap);
          processedLunchGap = true;
        }
        if (gap > 0) {
          const clasif = clasificarGap(ultimoSalidaReg, gap);
          if (clasif.tipo === "medico") tiempoMedicoHoy += gap;
          else if (clasif.tipo === "personal") tiempoPersonalHoy += gap;
          else tiempoJustificarHoy += gap;
        }
      }
      ultimoSalidaMins = mS;
      ultimoSalidaReg = p.salida;
    });
    let netWorked = minutosTrabajadosHoy;
    if (!esFestivo && netWorked > 240) netWorked -= 45;
    let autorizado = regsDia.some((r) => r.horasExtra === "SI") || regsDia.some((r) => (r.autoriza || "").includes("CAMPO"));
    if (esFestivo && netWorked > 60) autorizado = true;
    else if (!esFestivo && netWorked >= 600) autorizado = true;
    let extraMins50Acum = 0;
    periodosDia.forEach((p) => {
      if (!p.entrada || !p.salida) return;
      const mE = obtenerMinutos(p.entrada.hora || p.entrada.timestamp);
      const mS = obtenerMinutos(p.salida.hora || p.salida.timestamp);
      if (mE === null || mS === null || mS <= mE) return;
      const duracion = mS - mE;
      const enCampo = p.entrada.modo === "CAMPO" || p.salida.modo === "CAMPO";
      if (esFestivo) {
        if (enCampo) {
          if (autorizado) horasCampo100 += duracion;
        } else if (autorizado) horasExtra100 += duracion;
      } else {
        const H_INI = HORA_ENTRADA_REF, H_FIN = HORA_SALIDA_REF;
        if (enCampo) {
          if (mS <= H_INI || mE >= H_FIN) horasCampo50 += duracion;
          else {
            const mNormal = Math.min(mS, H_FIN) - Math.max(mE, H_INI);
            horasCampoNormales += mNormal;
            horasCampo50 += duracion - mNormal;
          }
        } else if (autorizado && mS > H_FIN) {
          extraMins50Acum += mS - Math.max(mE, H_FIN);
        }
      }
    });
    if (!esFestivo) horasExtra50 += extraMins50Acum;
    const regPermiso = regsDia.find((r) => r.tipo === "ENTRADA") || regsDia.find((r) => r.tiempo_justificado_mins || r.permiso_personal_mins || r.permiso_medico_mins) || regsDia[0];
    const persMins = regPermiso ? Number(regPermiso.permiso_personal_mins || 0) : 0;
    const medMins = regPermiso ? Number(regPermiso.permiso_medico_mins || 0) : 0;
    const justMins = regPermiso ? Number(regPermiso.tiempo_justificado_mins || 0) : 0;
    tiempoPersonalHoy += persMins;
    tiempoMedicoHoy += medMins;
    const tiempoJustificadoHoy = justMins + (hasCumpleanos ? 240 : 0);
    if (isJustificado && !tieneAsistenciaHoy || esCampoHoy || esHoyOFuturo || esPasanteEmp) {
      tiempoJustificarHoy = 0;
    } else {
      const netWorkedOrdinario = calcularNetWorkedOrdinario(periodosDia, esFestivo);
      const missingMinutes = esFestivo ? 0 : Math.max(0, 480 - netWorkedOrdinario);
      const totalPermisosHoy = tiempoPersonalHoy + tiempoMedicoHoy + tiempoJustificadoHoy;
      tiempoJustificarHoy += Math.max(0, missingMinutes - totalPermisosHoy);
      tiempoJustificarHoy = Math.max(0, tiempoJustificarHoy - tiempoJustificadoHoy);
    }
    const ultSal = ultimoSalidaMins;
    const minsSalidaTempranaHoy = !esFestivo && !esPasanteEmp && ultSal !== null && ultSal < HORA_SALIDA_REF ? HORA_SALIDA_REF - ultSal : 0;
    const missingMinutesDia = esFestivo ? 0 : Math.max(0, 480 - calcularNetWorkedOrdinario(periodosDia, esFestivo));
    if (!esFestivo && atrasoMinsHoy + minsSalidaTempranaHoy > missingMinutesDia) {
      atrasoMinsHoy = Math.max(0, missingMinutesDia - minsSalidaTempranaHoy);
    }
    if (esPasanteEmp) atrasoMinsHoy = 0;
    else atrasoMinsHoy = Math.max(0, atrasoMinsHoy - tiempoPersonalHoy - tiempoMedicoHoy - tiempoJustificadoHoy);
    if (atrasoMinsHoy > 0) {
      atrasos++;
      minutosAtrasos += atrasoMinsHoy;
    }
    totalDescuentoBruto += tiempoPersonalHoy + (tiempoJustificarHoy > 0 ? Math.max(tiempoJustificarHoy, atrasoMinsHoy) : atrasoMinsHoy);
    totalTiempoPersonal += tiempoPersonalHoy;
    totalTiempoMedico += tiempoMedicoHoy;
    totalTiempoPorJustificar += tiempoJustificarHoy;
  });
  todasLasFechas.forEach((fecha) => {
    if (fecha >= hoyRep) return;
    if (fSalida && fecha > fSalida) return;
    if (iniEvalEmp && fecha < iniEvalEmp) return;
    const regsDia = regsRango.filter((r) => normalizarFechaStr(r.fecha) === fecha);
    const tieneEntrada = regsDia.some((r) => ["ENTRADA", "RETORNO_CAMPO", "ENTRADA_CAMPO"].includes(String(r.tipo || "").toUpperCase()));
    const tieneSalida = regsDia.some((r) => ["SALIDA", "SALIDA_CAMPO"].includes(String(r.tipo || "").toUpperCase()));
    if (tieneEntrada && !tieneSalida && !esCampoOJornadaJustificada(regsDia)) numSalidasAuto++;
  });
  const diasTotalesTrabajados = diasAsistidosPlantaSet.size + diasCampoSet.size;
  const puntualidad = diasTotalesTrabajados ? esPasanteEmp ? 100 : Math.round((1 - atrasos / diasTotalesTrabajados) * 100) : 0;
  return {
    id: e.id,
    nombre: e.nombre,
    area: e.area,
    cargo: e.cargo || "",
    esEliminado: !!e.esEliminado,
    esDesvinculado: !!e.esDesvinculado,
    fecha_salida: e.fecha_salida,
    fechaDesvinculacion: e.fechaDesvinculacion,
    motivo_salida: e.motivo_salida,
    activo: e.activo,
    foto_url: e.foto_url,
    asistencias: diasAsistidosPlantaSet.size,
    diasCampo: diasCampoSet.size,
    faltas: diasFaltasSet.size,
    diasVacaciones: diasVacacionesSet.size,
    diasJustificados: diasJustificadosSet.size,
    diasExtras: diasExtrasSet.size,
    permisoMedico: totalTiempoMedico,
    permisoPersonal: totalTiempoPersonal,
    tiempoPorJustificar: esPasanteEmp ? totalTiempoPorJustificar : Math.max(0, totalTiempoPorJustificar - 240),
    tiempoADescontar: esPasanteEmp ? totalDescuentoBruto : Math.max(0, totalDescuentoBruto - 240),
    atrasos,
    minutosAtrasos,
    almPlanta,
    almFuera,
    puntualidad,
    horasExtra50,
    horasExtra100,
    horasCampoNormales,
    horasCampo50,
    horasCampo100,
    totalExtras50: horasExtra50 + horasCampo50,
    totalExtras100: horasExtra100 + horasCampo100,
    totalHorasExtra: horasExtra50 + horasExtra100 + horasCampo50 + horasCampo100,
    entradas: numEntradasReg,
    entradasReg: numEntradasReg,
    entradasAuto: numEntradasAuto,
    salidas: numSalidasReg,
    salidasReg: numSalidasReg,
    salidasAuto: numSalidasAuto
  };
}
function calcularStatsReportes(lista, R_INI, R_FIN, hoyRep) {
  if (!R_INI || !R_FIN) return [];
  return lista.map((e) => calcularStatEmpleado(e, R_INI, R_FIN, hoyRep));
}
function sumar(stats, campo) {
  return stats.reduce((s, r) => s + (Number(r[campo]) || 0), 0);
}
function obtenerListaEmpleadosReportes(empCache, empEliminados, incluirDesv, incluirElim, fCargo) {
  const verBajas = incluirDesv || incluirElim || fCargo === "desvinculados" || fCargo === "eliminados";
  return verBajas ? [...empCache, ...empEliminados] : [...empCache];
}
function filtrarDatosReporte(base, q, fCargo) {
  q = (q || "").toLowerCase();
  fCargo = (fCargo || "").toLowerCase();
  return base.filter((e) => {
    const matchQ = !q || (e.nombre || "").toLowerCase().includes(q) || (e.area || "").toLowerCase().includes(q) || String(e.id || "").toLowerCase().includes(q);
    let matchCargo = !fCargo;
    if (fCargo === "desvinculados") {
      matchCargo = !!e.esDesvinculado || (e.cargo || "").toLowerCase() === "desvinculado" || (e.area || "").toLowerCase() === "desvinculado" || !!(e.estadoBadge && e.estadoBadge.toLowerCase().includes("desvinculado")) || !!(e.motivo_salida && e.motivo_salida.length > 0);
    } else if (fCargo === "eliminados") {
      matchCargo = !!e.esEliminado || e.activo === false || (e.area || "").toLowerCase() === "eliminado" || (e.cargo || "").toLowerCase() === "eliminado";
    } else if (fCargo === "sin asistencia") {
      matchCargo = e.asistencias === 0 || !e.asistencias;
    } else if (fCargo) {
      matchCargo = (e.cargo || "").toLowerCase() === fCargo;
    }
    return matchQ && matchCargo;
  });
}
function ordenar(data, col, dir, vacio = 0) {
  if (!col) return data;
  return [...data].sort((a, b) => {
    const va = a[col] ?? vacio;
    const vb = b[col] ?? vacio;
    if (typeof va === "string") return dir === "asc" ? va.localeCompare(vb) : String(vb).localeCompare(va);
    return dir === "asc" ? va - vb : vb - va;
  });
}
function formatearFechaA_DMY(fecha) {
  if (!fecha) return "";
  const str = String(fecha).trim();
  const matchDMY = str.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (matchDMY) return `${matchDMY[1].padStart(2, "0")}-${matchDMY[2].padStart(2, "0")}-${matchDMY[3]}`;
  const matchYMD = str.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})/);
  if (matchYMD) return `${matchYMD[3].padStart(2, "0")}-${matchYMD[2].padStart(2, "0")}-${matchYMD[1]}`;
  return str;
}

// src/supervisor/store.ts
var import_react = __toESM(require_react(), 1);

// src/lib/api.ts
var BASE = "./rest".replace(/\/$/, "");

// src/supervisor/store.ts
var estado = {
  cargado: false,
  desde: "",
  empCache: [],
  empEliminados: [],
  solicitudesInvitados: [],
  emergencia: { activa: false, nombre: "", habilitadoPor: "", fecha: "" },
  vacaciones: {},
  periodos: generarPeriodos(),
  lastUpdate: "--:--:--",
  panel: "asistencia",
  panelOrigenDetalle: "asistencia",
  subtabAsistencia: "control",
  subtabServicios: "emergencias",
  detalle: null,
  loader: { visible: false, texto: "Cargando datos...", subtexto: "Sincronizando informaci\xF3n en tiempo real" },
  bgSync: false,
  version: 0
};
function dedup(regs) {
  const seen = /* @__PURE__ */ new Set();
  return regs.filter((r) => {
    const key = `${r.fecha}|${r.tipo}|${(r.hora || "").slice(0, 5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
function armarEmpleados(fichas, registros) {
  const hoy = getLocalHoyStr();
  const activos = {};
  const eliminados = {};
  fichas.forEach((f) => {
    const item = { ...f, registros: [], entradaHoy: false, salidaHoy: false };
    if (f.activo === "SI") activos[f.id] = item;
    else eliminados[f.id] = {
      ...item,
      nombre: f.nombre || `Colaborador (${f.id})`,
      area: f.area || (f.esDesvinculado ? "Desvinculado" : "Inactivo"),
      cargo: f.cargo || (f.esDesvinculado ? "Desvinculado" : "Inactivo"),
      esEliminado: true
    };
  });
  registros.forEach((reg) => {
    const eid = String(reg.empleadoId || "").trim();
    if (!eid) return;
    reg.fecha = normalizarFechaStr(reg.fecha);
    const vAlm = (reg.almuerzo || "").toString().trim().toUpperCase();
    reg.almuerzo = vAlm === "SI" || vAlm === "S\xCD" || vAlm === "PLANTA" ? "SI" : vAlm === "NO" || vAlm === "FUERA" ? "NO" : "";
    const e = activos[eid];
    if (e) {
      e.registros.push(reg);
      if (reg.fecha === hoy) {
        if (reg.tipo === "ENTRADA") {
          e.entradaHoy = true;
          e.horaEntrada = reg.hora;
          e.horaEntradaMs = reg.hora;
          if (!e.almuerzoHoy) e.almuerzoHoy = reg.almuerzo;
        }
        if (reg.tipo === "SOLO_ALMUERZO" && !e.almuerzoHoy) e.almuerzoHoy = reg.almuerzo;
        if (reg.tipo === "SALIDA") {
          e.salidaHoy = true;
          e.horaSalida = reg.hora;
          e.horaSalidaMs = reg.hora;
        }
      }
    } else {
      const el = eliminados[eid] ||= {
        id: eid,
        nombre: `Colaborador (${eid})`,
        area: "Eliminado",
        cargo: "Eliminado",
        esEliminado: true,
        activo: false,
        registros: [],
        entradaHoy: false,
        salidaHoy: false
      };
      el.registros.push(reg);
    }
  });
  Object.values(activos).forEach((emp) => {
    emp.registros = dedup(emp.registros);
    if (emp.salidaHoy && emp.horaSalida) {
      const parts = String(emp.horaSalida).split(":");
      if (parseInt(parts[0]) * 60 + parseInt(parts[1]) < 570) emp.almuerzoHoy = "NO";
    }
  });
  Object.values(eliminados).forEach((emp) => {
    emp.registros = dedup(emp.registros);
  });
  const porNombre = (a, b) => (a.nombre || "").localeCompare(b.nombre || "", "es", { sensitivity: "base" });
  return { empCache: Object.values(activos).sort(porNombre), empEliminados: Object.values(eliminados).sort(porNombre) };
}
export {
  COLUMNAS_DISPONIBLES,
  DEFAULT_COLUMNAS_CUSTOM,
  HORA_ENTRADA_REF,
  HORA_SALIDA_REF,
  armarEmpleados,
  calcularAlmuerzosPeriodo,
  calcularNetWorkedOrdinario,
  calcularPct,
  calcularStatEmpleado,
  calcularStatsReportes,
  clasificarGap,
  debounce,
  desglosarObservacionesInvitado,
  diaSemana,
  esAlmuerzoExtraItem,
  esEmpleadoExcluidoAsistencia,
  esEmpleadoPasante,
  esEmpleadoSoloAlmuerzo,
  esFeriadoODomingo,
  escapeHtml,
  fijarFeriados,
  filtrarDatosReporte,
  fixFotoUrl,
  formatearFechaA_DMY,
  formatearHora,
  formatearHorasDecimal,
  formatearMinutos,
  generarPeriodos,
  getLocalHoyStr,
  guardarColumnasCustomActivas,
  mapRazonAusenciaATipo,
  minsToHHMM,
  minutosAHHMMSS,
  normalizarFechaStr,
  obtenerAlmuerzosExtraConsolidados,
  obtenerColumnasCustomActivas,
  obtenerDiaSemanaStr,
  obtenerDiasHabiles,
  obtenerFechaInicioEfectivaEmpleado,
  obtenerListaConsolidadaInvitados,
  obtenerListaEmpleadosReportes,
  obtenerMinutos,
  ordenar,
  parsearInputTiempo,
  sumar,
  sumarDias
};
/*! Bundled license information:

react/cjs/react.production.min.js:
  (**
   * @license React
   * react.production.min.js
   *
   * Copyright (c) Facebook, Inc. and its affiliates.
   *
   * This source code is licensed under the MIT license found in the
   * LICENSE file in the root directory of this source tree.
   *)
*/
