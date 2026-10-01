// Radar de ubicación en vivo (ubicacion.html + JS/ubicacion_core.js): mapa Leaflet con la última marcación
// de hoy de cada colaborador, geocerca de la empresa, lista lateral con filtros y recarga cada 60 s.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet.markercluster';
import { rpc, urlFoto } from '../lib/api';
import { leerClaims } from '../lib/sesion';
import { s } from '../lib/estilo';

type Estado = 'empresa' | 'campo' | 'salida' | 'sin';
interface Info { st: Estado; lat: number | null; lng: number | null; hora?: string; tipo?: string; dist?: number | null; sinGPS?: boolean }
interface EmpRadar { id: string; nombre: string; area?: string; foto_url?: string; registros: any[]; _info: Info }

const AUTO_SEC = 60;
const color = (st: Estado) => ({ empresa: '#10b981', campo: '#f59e0b', salida: '#8b5cf6', sin: '#94a3b8' }[st] || '#94a3b8');
const esc = (t: unknown) => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;').replace(/"/g, '&quot;');
const ini = (n?: string) => (n?.charAt(0) || '?').toUpperCase();
const fmtHora = (v?: string) => { const m = String(v || '').match(/\d{1,2}:\d{2}/); return m ? m[0].padStart(5, '0') : '--:--'; };

function calcDist(la1: number, lo1: number, la2: number, lo2: number) {
  const R = 6371000, dL = (la2 - la1) * Math.PI / 180, dO = (lo2 - lo1) * Math.PI / 180;
  const a = Math.sin(dL / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dO / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// statusEmp: la última marcación del día manda (SALIDA sobre todo); sin GPS se ubica dentro del recinto
function statusEmp(regs: any[], emp: { lat: number; lng: number; radio: number }): Info {
  if (!regs.length) return { st: 'sin', lat: null, lng: null };
  const ultima = regs[regs.length - 1];
  const tipoTotal = String(ultima.tipo).toUpperCase();
  const conGps = regs.filter(r => r.lat != null && r.lng != null && !isNaN(+r.lat) && !isNaN(+r.lng));
  if (conGps.length) {
    const u = conGps[conGps.length - 1];
    const d = calcDist(emp.lat, emp.lng, +u.lat, +u.lng);
    return { st: tipoTotal === 'SALIDA' ? 'salida' : d <= emp.radio ? 'empresa' : 'campo', lat: +u.lat, lng: +u.lng, hora: ultima.hora, tipo: ultima.tipo, dist: Math.round(d), sinGPS: false };
  }
  const ang = Math.random() * Math.PI * 2;
  const rg = Math.sqrt(Math.random()) * (180 / 111320);
  return { st: tipoTotal === 'SALIDA' ? 'salida' : 'empresa', lat: emp.lat + rg * Math.cos(ang), lng: emp.lng + (rg * Math.sin(ang)) / Math.cos(emp.lat * Math.PI / 180),
    hora: ultima.hora, tipo: ultima.tipo, dist: 0, sinGPS: true };
}

function htmlMarcador(e: EmpRadar) {
  const i = e._info, bg = color(i.st), foto = urlFoto(e.foto_url);
  const eid = esc(String(e.id).replace(/[^a-zA-Z0-9_-]/g, '_'));
  const ph = `<div class="pm-ph" id="pmh-${eid}" style="background:${bg}; ${foto ? 'display:none' : ''}">${ini(e.nombre)}</div>`;
  const img = foto ? `<img src="${esc(foto)}" referrerpolicy="no-referrer" onerror="this.style.display='none';document.getElementById('pmh-${eid}').style.display='flex'">` : '';
  const glow = i.st !== 'sin' && !i.sinGPS ? `<div class="pm-glow c-${i.st}"></div>` : '';
  return `<div class="premium-marker">${glow}<div class="pm-pin" style="border-color:${bg}">${img}${ph}</div></div>`;
}

function htmlPopup(e: EmpRadar) {
  const i = e._info, bg = color(i.st), foto = urlFoto(e.foto_url);
  const ph = `<div class="pop-avatar" style="color:${bg}; border-color:${bg}">${ini(e.nombre)}</div>`;
  const img = foto ? `<img class="pop-avatar" src="${esc(foto)}" referrerpolicy="no-referrer" style="border-color:${bg}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">${ph}` : ph;
  const lbl = { empresa: 'En Área', campo: 'En Campo', salida: 'Jornada Fin', sin: 'Ausente' }[i.st];
  return `<div class="pop-modern"><div class="pop-cover"><div class="pop-badge" style="background:${bg}">${lbl}</div>${img}</div>
    <div class="pop-details"><div class="pop-name">${esc(e.nombre)}</div><div class="pop-sub"><i class="fas fa-briefcase"></i> ${esc(e.area || 'Sin área')}</div>
    <div class="pop-grid"><div class="pop-box"><div class="pop-box-t">HORA REG.</div><div class="pop-box-v">${fmtHora(i.hora)}</div></div>
    <div class="pop-box"><div class="pop-box-t">DISTANCIA</div><div class="pop-box-v">${i.dist != null ? i.dist + 'm' : '—'}</div></div></div>
    ${i.sinGPS ? '<div class="sin-gps-notice"><i class="fas fa-satellite-slash"></i> Posición teórica (Sin GPS)</div>' : ''}</div></div>`;
}

export function UbicacionApp() {
  const claims = leerClaims();
  const autorizado = !!claims && ['supervisor', 'supervisor_admin', 'admin'].includes(claims.role);
  const refMapa = useRef<HTMLDivElement>(null);
  const mapa = useRef<{ map: L.Map; grupo: L.MarkerClusterGroup; circulo: L.Circle; hq: L.Marker; marcadores: Record<string, L.Marker> } | null>(null);
  const [empleados, setEmpleados] = useState<EmpRadar[]>([]);
  const [empresa, setEmpresa] = useState({ lat: -0.1291, lng: -78.47815, radio: 250 });
  const [filtro, setFiltro] = useState<'todos' | Estado>('todos');
  const [q, setQ] = useState('');
  const [cargando, setCargando] = useState(true);
  const [loader, setLoader] = useState(true);
  const [ultima, setUltima] = useState('--:--:--');
  const [seg, setSeg] = useState(AUTO_SEC);
  const [radioVisible, setRadioVisible] = useState(true);
  const [seleccion, setSeleccion] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [aviso, setAviso] = useState('');

  const toast = (m: string) => { setAviso(m); window.setTimeout(() => setAviso(''), 3500); };

  const cargar = async (silencioso: boolean) => {
    if (!silencioso) setLoader(true);
    setCargando(true);
    try {
      const d = await rpc<any>('sup_radar', {});
      const emp = { lat: d.empresa.lat ?? -0.1291, lng: d.empresa.lng ?? -78.47815, radio: d.empresa.radio || 250 };
      setEmpresa(emp);
      setEmpleados((d.empleados || []).map((e: any) => ({ ...e, _info: statusEmp(e.registros || [], emp) })));
      setUltima(d.ahora.slice(11, 19));
      setSeg(AUTO_SEC);
    } catch (e: any) { toast(e?.message || 'Falló la conexión al servidor'); }
    finally { setCargando(false); setLoader(false); }
  };

  useEffect(() => { if (autorizado) void cargar(false); }, [autorizado]);
  useEffect(() => {
    if (!autorizado) return;
    const t = window.setInterval(() => setSeg(x => { if (x <= 1) { void cargar(true); return AUTO_SEC; } return x - 1; }), 1000);
    return () => window.clearInterval(t);
  }, [autorizado]);

  // Mapa (initMap)
  useEffect(() => {
    if (!autorizado || !refMapa.current || mapa.current) return;
    const map = L.map(refMapa.current, { zoomControl: false }).setView([empresa.lat, empresa.lng], 16);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors', maxZoom: 19 }).addTo(map);
    L.control.zoom({ position: 'bottomright' }).addTo(map);
    const grupo = L.markerClusterGroup({ showCoverageOnHover: false, maxClusterRadius: 45, spiderfyOnMaxZoom: true,
      iconCreateFunction: c => L.divIcon({ html: '<div class="cluster-premium">' + c.getChildCount() + '</div>', className: '', iconSize: [44, 44], iconAnchor: [22, 22] }) });
    map.addLayer(grupo);
    const hq = L.marker([empresa.lat, empresa.lng], { icon: L.divIcon({ html: '<div class="hq-marker"><i class="fas fa-building-user"></i></div>', className: '', iconSize: [54, 54], iconAnchor: [27, 27], popupAnchor: [0, -28] }), zIndexOffset: -100 }).addTo(map);
    const circulo = L.circle([empresa.lat, empresa.lng], { radius: empresa.radio, color: '#10b981', fillColor: '#10b981', fillOpacity: 0.05, weight: 1.5, dashArray: '4 4' }).addTo(map);
    mapa.current = { map, grupo, circulo, hq, marcadores: {} };
    return () => { map.remove(); mapa.current = null; };
  }, [autorizado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Geocerca según la configuración
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    m.hq.setLatLng([empresa.lat, empresa.lng]).bindPopup(`<div style="font-family:'Inter',sans-serif; text-align:center; padding:12px;"><div style="font-family:'Outfit',sans-serif; font-size:18px; font-weight:800; color:var(--text-main);">TCONTROL S.A.</div><div style="font-size:12px; color:var(--text-sub); margin-top:4px;">Recinto operativo (${empresa.radio}m)</div></div>`);
    m.circulo.setLatLng([empresa.lat, empresa.lng]).setRadius(empresa.radio);
  }, [empresa]);

  // renderMapPoints
  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    m.grupo.clearLayers();
    m.marcadores = {};
    const z: Record<Estado, number> = { campo: 300, empresa: 200, salida: 100, sin: 0 };
    empleados.forEach(e => {
      if (e._info.lat == null || e._info.lng == null) return;
      const mk = L.marker([e._info.lat, e._info.lng], { icon: L.divIcon({ html: htmlMarcador(e), className: '', iconSize: [42, 42], iconAnchor: [21, 21], popupAnchor: [0, -20] }), zIndexOffset: z[e._info.st] })
        .bindPopup(htmlPopup(e));
      mk.on('click', () => setSeleccion(e.id));
      m.grupo.addLayer(mk);
      m.marcadores[e.id] = mk;
    });
  }, [empleados]);

  useEffect(() => {
    const m = mapa.current;
    if (!m) return;
    if (radioVisible) m.circulo.addTo(m.map); else m.map.removeLayer(m.circulo);
  }, [radioVisible]);

  useEffect(() => { if (seleccion) document.getElementById('card-' + seleccion)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [seleccion]);

  const cuenta = (st: Estado) => empleados.filter(e => e._info.st === st).length;
  const orden: Record<Estado, number> = { empresa: 1, campo: 2, salida: 3, sin: 4 };
  const lista = useMemo(() => empleados.filter(e => {
    const t = q.toLowerCase();
    if (t && !e.nombre.toLowerCase().includes(t) && !(e.area || '').toLowerCase().includes(t)) return false;
    return filtro === 'todos' || e._info.st === filtro;
  }).sort((a, b) => orden[a._info.st] - orden[b._info.st] || a.nombre.localeCompare(b.nombre)), [empleados, q, filtro]); // eslint-disable-line react-hooks/exhaustive-deps

  const focar = (e: EmpRadar) => {
    const m = mapa.current;
    if (!m) return;
    if (e._info.lat == null || e._info.lng == null) { toast('Ubicación no disponible para este usuario hoy.'); return; }
    m.map.flyTo([e._info.lat, e._info.lng], 18, { duration: 1.5, easeLinearity: 0.1 });
    window.setTimeout(() => m.marcadores[e.id]?.openPopup(), 1600);
    setSeleccion(e.id);
    if (window.innerWidth <= 800) setSidebar(false);
  };
  const centrar = () => mapa.current?.map.flyTo([empresa.lat, empresa.lng], 16, { duration: 1.5 });
  const verTodos = () => {
    const m = mapa.current;
    const mks = Object.values(m?.marcadores || {});
    if (!m || !mks.length) { centrar(); return; }
    m.map.fitBounds(L.featureGroup(mks).getBounds().pad(0.3));
  };

  if (!autorizado) {
    return (
      <div style={s("position:fixed; inset:0; z-index:99999; background:rgba(11,15,25,0.94); backdrop-filter:blur(10px); display:flex; align-items:center; justify-content:center; padding:20px; font-family:'Inter',sans-serif;")}>
        <div style={s('background:#1e293b; border:1px solid rgba(255,255,255,0.1); border-radius:24px; padding:40px 30px; max-width:440px; width:100%; text-align:center; box-shadow:0 25px 60px rgba(0,0,0,0.5);')}>
          <div style={s('width:76px; height:76px; margin:0 auto 20px; border-radius:50%; background:rgba(220,38,38,0.15); border:1.5px solid rgba(220,38,38,0.4); display:flex; align-items:center; justify-content:center; font-size:32px; color:#ef4444;')}><i className="fas fa-satellite-dish"></i></div>
          <h2 style={s("font-size:22px; font-weight:800; color:#f8fafc; margin-bottom:12px; font-family:'Outfit',sans-serif;")}>Rastreo Satelital Protegido</h2>
          <p style={s('font-size:14px; color:#94a3b8; line-height:1.6; margin-bottom:28px;')}>El mapa de monitoreo de personal en tiempo real requiere autenticación activa de Supervisor.</p>
          <a href="supervisor.html" style={s('display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; padding:14px; background:linear-gradient(135deg, #dc2626, #b91c1c); color:white; font-weight:700; border-radius:12px; text-decoration:none; box-shadow:0 8px 24px rgba(220,38,38,0.35);')}><i className="fas fa-lock-open"></i> Iniciar Sesión de Supervisor</a>
        </div>
      </div>
    );
  }

  const fBtn = (f: 'todos' | Estado, id: string, valor: number, etiqueta: string, colorV: string, colorL?: string) => (
    <div className={`filter-btn${filtro === f ? ' active' : ''}`} id={id} onClick={() => setFiltro(f)}>
      <div className="f-val" style={{ color: colorV }}>{empleados.length ? valor : '-'}</div>
      <div className="f-lbl" style={colorL ? { color: colorL } : undefined}>{etiqueta}</div>
    </div>
  );

  return (
    <>
      <div className="loader-overlay" id="loader" style={{ display: loader ? 'flex' : 'none' }}>
        <div className="loader-ring"></div>
        <div className="loader-text" id="loaderText">Sincronizando satélites y empleados...</div>
      </div>
      <button className="mob-btn" onClick={() => setSidebar(x => !x)}><i className="fas fa-bars"></i></button>
      <div className="app-wrapper">
        <div id="map" ref={refMapa}></div>
        <div className="map-fab-group">
          <div className="map-fab" onClick={centrar} title="Ir a Centro de Control"><i className="fas fa-crosshairs"></i></div>
          <div className="map-fab" onClick={verTodos} title="Ver a Todo el Personal"><i className="fas fa-users-viewfinder"></i></div>
          <div className="map-fab" id="btnRadio" onClick={() => setRadioVisible(v => !v)} title="Mostrar Geocerca" style={{ color: radioVisible ? 'var(--text-main)' : 'var(--text-sub)' }}><i className="fas fa-draw-polygon"></i></div>
        </div>
        <div className="live-status-overlay" id="liveBar">
          <div className="live-pulse"><div className="live-pulse-dot"></div> TRANSMISIÓN ACTIVA</div>
          <div style={s('width: 1px; height: 16px; background: var(--border-dark);')}></div>
          <div>Sincronizado: <span className="mono-data" id="ultimaAct">{ultima}</span></div>
          <div style={s('width: 1px; height: 16px; background: var(--border-dark);')}></div>
          <div>Próxima recarga en <span className="mono-data" id="proxAct" style={s('color: var(--brand);')}>{seg}s</span></div>
        </div>
        <div className="modern-legend">
          <div className="leg-title">Indicadores GPS</div>
          <div className="leg-item"><div className="leg-dot" style={s('background:var(--c-empresa)')}></div> Dentro del recinto</div>
          <div className="leg-item"><div className="leg-dot" style={s('background:var(--c-campo)')}></div> En campo</div>
          <div className="leg-item"><div className="leg-dot" style={s('background:var(--c-salida)')}></div> Fin de jornada</div>
          <div className="leg-item"><div className="leg-dot" style={s('background:var(--c-sin)')}></div> Desconectado / Sin registro</div>
        </div>
        <aside className={`sidebar${sidebar ? ' open' : ''}`} id="sidebar">
          <div className="sb-header">
            <div className="sb-brand">
              <div className="sb-logo-box"><i className="fas fa-layer-group"></i></div>
              <div><div className="sb-title">CONTROL DE CAMPO</div><div className="sb-sub">Radar en tiempo real interactivo</div></div>
            </div>
          </div>
          <div className="filter-grid">
            {fBtn('todos', 'f-todos', empleados.length, 'Total', 'var(--text-main)')}
            {fBtn('empresa', 'f-empresa', cuenta('empresa'), 'Dentro', 'var(--c-empresa)', 'var(--c-empresa)')}
            {fBtn('campo', 'f-campo', cuenta('campo'), 'Campo', 'var(--c-campo)', 'var(--c-campo)')}
            {fBtn('salida', 'f-salida', cuenta('salida'), 'Salida', 'var(--c-salida)', 'var(--c-salida)')}
            {fBtn('sin', 'f-sin', cuenta('sin'), 'Faltan', 'var(--c-sin)', 'var(--text-sub)')}
          </div>
          <div className="sb-search">
            <div className="search-input-wrapper">
              <i className="fas fa-search"></i>
              <input type="text" id="searchEmp" className="search-input" placeholder="Buscar por nombre o área..." value={q} onChange={ev => setQ(ev.target.value)} />
            </div>
          </div>
          <div className="emp-list" id="empList">
            {!empleados.length && cargando ? <div className="empty-state"><i className="fas fa-satellite-dish fa-spin"></i><p>Conectando satélites...</p></div>
              : !lista.length ? <div className="empty-state"><i className="fas fa-ghost"></i><p>No se encontraron<br />resultados en radar.</p></div>
              : lista.map(e => {
                const i = e._info, bg = color(i.st), foto = urlFoto(e.foto_url);
                const icono = i.tipo === 'ENTRADA' ? 'right-to-bracket' : i.tipo === 'SALIDA' ? 'right-from-bracket' : 'minus';
                return (
                  <div key={e.id} className={`emp-card${seleccion === e.id ? ' selected' : ''}`} id={`card-${e.id}`} onClick={() => focar(e)}>
                    <div className="avatar-wrapper">
                      <AvatarRadar foto={foto} nombre={e.nombre} bg={bg} />
                      <div className="status-ring" style={{ background: bg }}></div>
                    </div>
                    <div className="emp-info"><div className="emp-name">{e.nombre}</div><div className="emp-sub"><i className="fas fa-layer-group"></i> {e.area || 'Sin área'}</div></div>
                    <div className="emp-time-box">
                      <div className="emp-time"><i className={`fas fa-${icono}`} style={{ color: bg, marginRight: 3 }}></i> {fmtHora(i.hora)}</div>
                      <div className="emp-dist"><i className="fas fa-location-dot"></i> {i.dist != null ? i.dist + 'm' : i.sinGPS ? 'Apox.' : '—'}</div>
                    </div>
                  </div>
                );
              })}
          </div>
          <div className="sb-footer">
            <button className="btn-action" id="btnRefresh" onClick={() => void cargar(false)}>
              <i className={`fas fa-rotate${cargando ? ' fa-spin' : ''}`} id="refreshIcon"></i> <span id="refreshText">Actualizar Radar</span>
            </button>
          </div>
        </aside>
      </div>
      {aviso && <div className="toast show">{aviso}</div>}
    </>
  );
}

function AvatarRadar({ foto, nombre, bg }: { foto: string | null; nombre: string; bg: string }) {
  const [error, setError] = useState(false);
  if (!foto || error) return <div className="emp-avatar-ph" style={{ backgroundColor: bg }}>{ini(nombre)}</div>;
  return <img className="emp-avatar" src={foto} referrerPolicy="no-referrer" onError={() => setError(true)} alt="" />;
}
