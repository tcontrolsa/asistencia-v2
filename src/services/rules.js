/**
 * REGLAS DE NEGOCIO Y CONFIGURACIÓN CENTRALIZADA TCONTROL
 * Extraído y validado según docs/reverse-engineering/06_BUSINESS_RULES.md
 */

export const TCONTROL_CONFIG = {
  // Coordenadas corporativas maestras
  LAT_EMPRESA: -0.1288771313385675,
  LNG_EMPRESA: -78.47896772889067,
  RADIO_METROS: 250, // RULE-GEO-001

  // Reglas de Horarios (Ecuador GMT-5)
  HORA_ENTRADA_OFICIAL: '07:30',      // RULE-HOR-001
  HORA_LIMITE_PUNTUALIDAD: '07:45',   // RULE-HOR-002 (465 min)
  HORA_SALIDA_SEMANA: '16:15',        // RULE-HOR-003 (975 min)
  HORA_SALIDA_FIN_SEMANA: '15:15',    // RULE-HOR-004 (915 min)
  HORA_CORTE_ALMUERZO: '09:30',       // RULE-ALM-001 (570 min)

  // Umbral de Horas Extras (> 45 minutos post-jornada)
  UMBRAL_HORAS_EXTRAS_MINUTOS: 45,    // RULE-EXT-001

  // Opciones de Catering
  OPCIONES_MENU: ['Normal', 'Dieta', 'Vegetariano'],
};

/**
 * Cálculo geodésico de distancia usando la fórmula de Haversine
 * @param {number} lat1 
 * @param {number} lon1 
 * @param {number} lat2 
 * @param {number} lon2 
 * @returns {number} Distancia en metros redondeada
 */
export function calcularDistanciaHaversine(lat1, lon1, lat2, lon2) {
  if (lat1 === undefined || lon1 === undefined || lat2 === undefined || lon2 === undefined) {
    return Infinity;
  }
  const R = 6371000; // Radio medio de la Tierra en metros
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export const calcularDistancia = calcularDistanciaHaversine;

/**
 * Valida si las coordenadas del usuario están dentro del radio permitido
 * RULE-GEO-001 y RULE-GEO-002
 */
export function validarGeocerca(coords, emp = null, modoTrabajo = 'OFICINA') {
  if (modoTrabajo === 'CAMPO') {
    return { valido: true, distancia: 0, mensaje: 'Modo campo activo (excepción de geocerca)' };
  }

  if (!coords || typeof coords.lat !== 'number' || typeof coords.lng !== 'number') {
    return {
      valido: false,
      distancia: null,
      mensaje: 'No se pudo obtener la ubicación GPS del dispositivo. Active la geolocalización.',
    };
  }

  // Si el colaborador tiene coordenadas personalizadas asignadas, tienen prioridad
  const targetLat = (emp && emp.baseLat) ? Number(emp.baseLat) : TCONTROL_CONFIG.LAT_EMPRESA;
  const targetLng = (emp && emp.baseLng) ? Number(emp.baseLng) : TCONTROL_CONFIG.LNG_EMPRESA;

  const distancia = calcularDistanciaHaversine(coords.lat, coords.lng, targetLat, targetLng);
  const excede = distancia > TCONTROL_CONFIG.RADIO_METROS;

  return {
    valido: !excede,
    distancia,
    limite: TCONTROL_CONFIG.RADIO_METROS,
    mensaje: excede
      ? `Estás a ${distancia} m de la planta (límite permitido: ${TCONTROL_CONFIG.RADIO_METROS} m). Debe ubicarse dentro del perímetro.`
      : `Dentro del perímetro corporativo (${distancia} m).`,
  };
}

/**
 * Evalúa las condiciones horarias al registrar la ENTRADA
 * RULE-HOR-001 y RULE-HOR-002
 */
export function evaluarEntrada(fechaObj = new Date()) {
  const horas = fechaObj.getHours();
  const minutos = fechaObj.getMinutes();
  const totalMinutos = horas * 60 + minutos;

  // 07:45 AM = 7 * 60 + 45 = 465 minutos
  const limiteAtrasoMin = 465;
  const esAtraso = totalMinutos > limiteAtrasoMin;
  const minutosAtraso = esAtraso ? totalMinutos - limiteAtrasoMin : 0;

  return {
    esAtraso,
    minutosAtraso,
    estadoLlegada: esAtraso ? 'ATRASO' : 'PUNTUAL',
    requiereJustificacion: esAtraso,
    horaFormateada: fechaObj.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

/**
 * Evalúa las condiciones horarias al registrar la SALIDA
 * RULE-HOR-003, RULE-HOR-004 y RULE-EXT-001
 */
export function evaluarSalida(fechaObj = new Date()) {
  const diaSemana = fechaObj.getDay(); // 0 = Domingo, 6 = Sábado
  const esFinSemana = diaSemana === 0 || diaSemana === 6;

  const horas = fechaObj.getHours();
  const minutos = fechaObj.getMinutes();
  const totalMinutos = horas * 60 + minutos;

  // Lunes a Viernes: 16:15 (975 min). Fin de semana: 15:15 (915 min).
  const finJornadaMin = esFinSemana ? (15 * 60 + 15) : (16 * 60 + 15);
  const esSalidaAnticipada = totalMinutos < finJornadaMin;
  const minutosAnticipacion = esSalidaAnticipada ? finJornadaMin - totalMinutos : 0;

  // Horas extras automáticas: si excede > 45 minutos después del fin de jornada
  const minutosExcedidos = totalMinutos - finJornadaMin;
  const calificaHorasExtras = minutosExcedidos > TCONTROL_CONFIG.UMBRAL_HORAS_EXTRAS_MINUTOS;

  return {
    esSalidaAnticipada,
    minutosAnticipacion,
    requiereJustificacion: esSalidaAnticipada,
    calificaHorasExtras,
    minutosExcedidos: Math.max(0, minutosExcedidos),
    horaOficialSalida: esFinSemana ? TCONTROL_CONFIG.HORA_SALIDA_FIN_SEMANA : TCONTROL_CONFIG.HORA_SALIDA_SEMANA,
    horaFormateada: fechaObj.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }),
  };
}

/**
 * Determina si el corte para pedir almuerzo está vencido
 * RULE-ALM-001 (09:30 AM = 570 min)
 */
export function esCorteAlmuerzoVencido(fechaObj = new Date()) {
  const totalMinutos = fechaObj.getHours() * 60 + fechaObj.getMinutes();
  return totalMinutos > (9 * 60 + 30);
}
