# 06 — Reglas de Negocio (Business Rules)

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Reglas de Geolocalización y Perímetros

---

### RULE-GEO-001: Geocerca Haversine con Radio Máximo de 250 Metros
- **RULE-ID:** `RULE-GEO-001`
- **Descripción:** Toda marcación de asistencia ordinaria debe originarse físicamente dentro de un radio máximo de 250 metros de la estación base corporativa o de la base asignada al colaborador.
- **Condición:**
  ```javascript
  distanciaMetros = calcularDistancia(latActual, lngActual, latBase, lngBase);
  if (distanciaMetros > RADIO_METROS && modo !== 'CAMPO' && tipo !== 'SALIDA_CAMPO') {
      // RECHAZAR MARCACIÓN
  }
  ```
- **Entrada:** `latActual` (Float), `lngActual` (Float), `RADIO_METROS = 250`.
- **Proceso:** Aplica el algoritmo trigonométrico de Haversine con radio terrestre `R = 6371000` metros (`JS/tcontrol_core.js:L410-418`).
- **Resultado:** Si la distancia es $\le 250\text{ m}$, aprueba la marcación; si es $> 250\text{ m}$, bloquea la acción con mensaje que detalla los metros de distancia excedidos.
- **Excepciones:** Colaboradores con `MODO == 'CAMPO'` o timbrados de tipo `SALIDA_CAMPO` / `RETORNO_CAMPO`.
- **Archivo:** `JS/tcontrol_core.js`, `JS/index_core.js`, `backend/apps_script/api_completa.gs`
- **Función:** `calcularDistancia(lat1, lon1, lat2, lon2)`
- **Dependencias:** `navigator.geolocation`

---

### RULE-GEO-002: Prioridad de Coordenadas Satelitales Personalizadas (Base Campo)
- **RULE-ID:** `RULE-GEO-002`
- **Descripción:** Si un colaborador tiene configuradas coordenadas específicas en su perfil (`baseLat`, `baseLng`), estas tienen prioridad sobre las coordenadas generales de la empresa (`LAT_EMPRESA`, `LNG_EMPRESA`).
- **Condición:**
  ```javascript
  const latObjetivo = (emp.baseLat !== null && emp.baseLat !== undefined) ? emp.baseLat : TCONTROL_CONFIG.LAT_EMPRESA;
  const lngObjetivo = (emp.baseLng !== null && emp.baseLng !== undefined) ? emp.baseLng : TCONTROL_CONFIG.LNG_EMPRESA;
  ```
- **Entrada:** `emp.baseLat`, `emp.baseLng` del documento del colaborador en Firestore / Sheets.
- **Proceso:** Permite que personal de sucursales, obras o talleres satélites marque en su propia geocerca sin alterar la de casa matriz.
- **Resultado:** Validación de radio contra el punto de trabajo asignado.
- **Excepciones:** Si `baseLat` o `baseLng` son nulos, vacíos o iguales a 0, se aplica el centro corporativo: `LAT: -0.1288771313385675`, `LNG: -78.47896772889067`.
- **Archivo:** `JS/index_core.js`, `JS/firebase_backend.js:L383-384`, `backend/apps_script/api_completa.gs:L61-62`
- **Función:** `obtenerCoordenadasValidas()`

---

## 2. Reglas de Horarios y Control de Jornada

---

### RULE-HOR-001: Horario Estándar de Entrada e Inicio Esperado (07:30)
- **RULE-ID:** `RULE-HOR-001`
- **Descripción:** La jornada laboral oficial inicia a las 07:30 AM (hora local de Ecuador, GMT-5).
- **Condición:** `HORA_INICIO_ESPERADA = "07:30"`.
- **Entrada:** Timestamp de marcación de tipo `ENTRADA`.
- **Proceso:** Los timbrados entre 06:00 y 07:30 se consideran puntuales y no computan horas extras matutinas salvo autorización expresa de supervisor.
- **Resultado:** Registro puntual.
- **Excepciones:** Turnos especiales de guardianía o logística autorizados en perfil.
- **Archivo:** `JS/tcontrol_core.js:L14`

---

### RULE-HOR-002: Tolerancia Máxima y Umbral de Atraso (07:45)
- **RULE-ID:** `RULE-HOR-002`
- **Descripción:** Se concede un margen de gracia de 15 minutos (hasta las 07:45). Toda marcación de entrada posterior a las 07:45:00 se cataloga como atraso y exige justificación obligatoria.
- **Condición:**
  ```javascript
  const minutosEntrada = hora.getHours() * 60 + hora.getMinutes();
  if (minutosEntrada > 465) { // 7 * 60 + 45 = 465 minutos
      // EXIGIR JUSTIFICACIÓN DE ATRASO
  }
  ```
- **Entrada:** Hora del sistema en cliente.
- **Proceso:** La aplicación detiene el flujo de timbrado y abre un diálogo modal exigiendo escribir la razón del atraso. Se almacena en el campo `razon_entrada_tardia` del registro.
- **Resultado:** Registro marcado con advertencia de atraso visible en el panel del supervisor.
- **Excepciones:** Permiso médico previamente aprobado en el sistema.
- **Archivo:** `JS/tcontrol_core.js:L15`, `JS/index_core.js`

---

### RULE-HOR-003: Fin Oficial de Jornada en Días Laborables (16:15)
- **RULE-ID:** `RULE-HOR-003`
- **Descripción:** La jornada ordinaria de Lunes a Viernes concluye a las 16:15:00.
- **Condición:** `HORA_SALIDA = "16:15"`.
- **Entrada:** Marcación de tipo `SALIDA`.
- **Proceso:** Si el colaborador intenta registrar su salida antes de las 16:15, el sistema clasifica el evento como `SALIDA_ANTICIPADA` y exige seleccionar o escribir un motivo (`razon_salida_temprana`).
- **Resultado:** Notificación en el dashboard del supervisor sobre retiro antes de hora.
- **Excepciones:** Ninguna.
- **Archivo:** `JS/tcontrol_core.js:L16`, `JS/index_core.js`

---

### RULE-HOR-004: Horario Oficial de Fin de Semana (Sábado y Domingo: 15:15)
- **RULE-ID:** `RULE-HOR-004`
- **Descripción:** En fines de semana (Sábados y Domingos), la hora de salida ordinaria concluye a las 15:15:00 (915 minutos del día), a diferencia de los días de semana (16:15:00).
- **Condición:**
  ```javascript
  const esFinSemana = (diaSemana === 0 || diaSemana === 6);
  const horaSalida = esFinSemana ? '15:15:00' : '16:15:00';
  ```
- **Entrada:** Fecha del registro y día de la semana.
- **Proceso:** Utilizado tanto en el proceso nocturno de autocompletado como en la regularización de auditoría. Si un colaborador no marcó salida un fin de semana, el sistema le asigna automáticamente las 15:15:00 y no las 16:15:00.
- **Resultado:** Evita atribución errónea de horas extras ficticias en fines de semana.
- **Excepciones:** Turnos de guardia 24 horas.
- **Archivo:** `backend/apps_script/autocompletar_salidas.gs:L181-183,450-456`
- **Función:** `regularizarSalidasFinDeSemana()`, `autoCompletarSalidasFaltantesSheets()`

---

## 3. Reglas de Cálculo y Autorización de Horas Extras

---

### RULE-EXT-001: Umbral de Activación de Horas Extras (> 45 Minutos Pos-Jornada)
- **RULE-ID:** `RULE-EXT-001`
- **Descripción:** El trabajo extraordinario se reconoce y autoriza automáticamente por el sistema si y solo si la salida efectiva del colaborador excede en **más de 45 minutos** el horario de finalización de su jornada.
- **Condición:**
  ```text
  Lunes a Viernes: Fin 16:15 (975 min). Umbral (+45 min): Salida > 17:00 (1020 min).
  Sábado: Fin 15:00 (900 min). Umbral (+45 min): Salida > 15:45 (945 min).
  Domingo / Feriado: Toda jornada trabajada > 45 min computa sobretiempo.
  
  if (minutosSalida - minutosFinJornada > 45) {
      HORAS_EXTRA = "SI";
      AUTORIZA = "SISTEMA (>45 MIN)";
  }
  ```
- **Entrada:** Hora efectiva de salida en `registros`.
- **Proceso:** La función `autorizarHorasExtrasAutomaticas()` recorre las salidas y actualiza en lote las columnas `HORAS_EXTRA` (Col M) y `AUTORIZA` (Col N).
- **Resultado:** Campos marcados como `SI` con etiqueta `SISTEMA (>45 MIN)` si el supervisor no la había ingresado manualmente.
- **Excepciones:** Salidas entre las 16:16 y las 16:59 no califican automáticamente para horas extras (se consideran margen ordinario de desalojo).
- **Archivo:** `backend/apps_script/mantenimiento_registros.gs:L331-486`
- **Función:** `autorizarHorasExtrasAutomaticas()`

---

### RULE-EXT-002: Exclusión de Horas Extras Artificiales por Autocompletado
- **RULE-ID:** `RULE-EXT-002`
- **Descripción:** Las salidas generadas por el sistema mediante autocompletado (`DISPOSITIVO = 'AUTO_COMPLETAR'`) jamás deben generar horas extras.
- **Condición:**
  ```javascript
  if (esSalidaAutoCompletada(disp, razonSalida, razonJust, quienJust)) {
      fila[colHE] = 'NO';
      fila[colAutoriza] = '';
  }
  ```
- **Entrada:** Campos `dispositivo`, `razon_salida_temprana`, `quien_justifica`.
- **Proceso:** El script de regularización remueve cualquier flag de horas extras que haya sido asignado erróneamente por un autocompletado previo.
- **Resultado:** `HORAS_EXTRA = 'NO'` y `AUTORIZA = ''`.
- **Archivo:** `backend/apps_script/autocompletar_salidas.gs:L213-218,242-248`

---

## 4. Reglas de Alimentación y Catering

---

### RULE-ALM-001: Hora de Corte Inamovible para Solicitud de Almuerzo (09:30 AM)
- **RULE-ID:** `RULE-ALM-001`
- **Descripción:** Los pedidos de almuerzo diario (Normal, Dieta, Vegetariano) cierran irrevocablemente a las 09:30 AM.
- **Condición:**
  ```javascript
  const horaActual = formatearHora24(new Date());
  if (horaActual > TCONTROL_CONFIG.HORA_LIMITE_ALMUERZO && TCONTROL_CONFIG.ALMUERZO_ACTIVO) {
      // BLOQUEAR INTERFAZ DE PEDIDO
  }
  ```
- **Entrada:** Hora del sistema (`HORA_LIMITE_ALMUERZO = "09:30"`).
- **Proceso:** Si son las 09:31 o posterior, los botones de selección en la app móvil se deshabilitan con un candado visual indicando que la orden ya fue transmitida al proveedor de catering.
- **Resultado:** Impide variaciones en la orden de cocina después del despacho.
- **Excepciones:** Puede ser omitida únicamente si un supervisor en `admin_config.html` desactiva el switch global `ALMUERZO_ACTIVO = false`.
- **Archivo:** `JS/tcontrol_core.js:L13,17`, `JS/index_core.js`

---

### RULE-ALM-002: Unicidad de Ración y Control de Doble Entrega
- **RULE-ID:** `RULE-ALM-002`
- **Descripción:** Cada colaborador tiene derecho estrictamente a 1 ración alimentaria por día.
- **Condición:**
  ```javascript
  const refAlm = db.collection('consumo_almuerzos').doc(`${fecha}_${empleadoId}`);
  const snap = await refAlm.get();
  if (snap.exists && snap.data().consumido === true) {
      throw new Error("El almuerzo ya fue entregado a las " + snap.data().hora_consumo);
  }
  ```
- **Entrada:** ID del colaborador en la línea de servicio del comedor.
- **Proceso:** Al pulsar el botón `Entregar` en `catering.html`, se escribe `consumido: true` con marca de tiempo. Si se vuelve a presionar, el sistema bloquea con aviso sonoro y texto rojo.
- **Resultado:** Cero duplicidad de raciones facturadas.
- **Archivo:** `JS/firebase_backend.js:L91-92`, `JS/catering_core.js`

---

## 5. Reglas de Integridad y Deduplicación de Datos

---

### RULE-DUP-001: Idempotencia Determinística del Registro en Firestore
- **RULE-ID:** `RULE-DUP-001`
- **Descripción:** Ninguna marcación en Firestore puede generar un ID aleatorio. El identificador del documento debe ser generado mediante fórmula determinística.
- **Condición:**
  ```javascript
  const horaLimpia = (reg.hora || "").replace(/:/g, '');
  const docId = `${reg.empleadoId}_${reg.tipo}_${reg.fecha}_${horaLimpia}`;
  ```
- **Entrada:** `empleadoId`, `tipo`, `fecha`, `hora`.
- **Proceso:** Si por fallas de conectividad móvil el usuario presiona dos veces el botón, ambas peticiones sobreescriben el mismo documento sin crear un registro duplicado.
- **Resultado:** Integridad absoluta en la base operacional.
- **Archivo:** `JS/firebase_backend.js`, `JS/firebase_migration.js:L88-90`

---

### RULE-DUP-002: Deduplicación Física Directa en Google Sheets
- **RULE-ID:** `RULE-DUP-002`
- **Descripción:** En la hoja `REGISTROS`, la combinación `Fecha + ID + Tipo` debe ser unívoca por jornada para evitar doble cómputo de horas.
- **Condición:**
  ```javascript
  const key = `${fechaKey}_${id}_${tipo}`;
  if (seen[key]) {
      // ELIMINAR FILA DUPLICADA DIRECTAMENTE (sin subrayar ni alterar el original)
      filasAEliminar.push(rowNum);
  }
  ```
- **Entrada:** Escaneo completo de filas de `REGISTROS`.
- **Proceso:** La función `eliminarDuplicados()` de `mantenimiento_registros.gs` elimina las filas sobrantes en orden inverso (bottom-up).
- **Resultado:** Hoja de cálculo limpia y sincronizada.
- **Archivo:** `backend/apps_script/mantenimiento_registros.gs:L264-320`

---

## 6. Reglas de Seguridad y Autenticación

---

### RULE-SEC-001: Cifrado Criptográfico de PIN con Hashing SHA-256
- **RULE-ID:** `RULE-SEC-001`
- **Descripción:** Ningún PIN de colaborador o supervisor debe almacenarse o transmitirse en texto claro si el navegador soporta Web Crypto API.
- **Condición:**
  ```javascript
  if (window.crypto && window.crypto.subtle) {
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }
  return sha256PureJs(cleanStr); // Fallback puro sin dependencias
  ```
- **Entrada:** Cadena numérica del PIN.
- **Proceso:** Genera un digesto hexadecimal SHA-256 de 64 caracteres.
- **Resultado:** Almacenamiento seguro en Firestore.
- **Archivo:** `JS/tcontrol_core.js:L56-135`

---

### RULE-SEC-002: Inmutabilidad de Auditorías y Logs en Firestore
- **RULE-ID:** `RULE-SEC-002`
- **Descripción:** Las colecciones de auditoría patronal (`logs`, `logs_whatsapp`, `auditoria_almuerzos`) son estrictamente de solo adición (append-only).
- **Condición:**
  ```text
  allow read: if true;
  allow create: if true;
  allow update, delete: if false;
  ```
- **Entrada:** Intento de modificación o borrado desde cualquier cliente web.
- **Proceso:** El motor de reglas de Firestore rechaza la petición con `PERMISSION_DENIED`.
- **Resultado:** Inalterabilidad probatoria de los registros de auditoría.
- **Archivo:** `firestore.rules:L52-67`

---

### RULE-SEC-003: Prohibición de Borrado de Colaboradores Activos (Protección Antidestrucción)
- **RULE-ID:** `RULE-SEC-003`
- **Descripción:** La colección `empleados` tiene terminantemente prohibida la operación `delete` desde clientes web.
- **Condición:**
  ```text
  match /empleados/{empleadoId} {
    allow delete: if false;
  }
  ```
- **Entrada:** Petición DELETE a `/empleados/{id}`.
- **Proceso:** La única vía válida para desvincular un colaborador es la función `desvincularColaborador` que actualiza `activo: 'NO'` y traslada la custodia a `empleados_desvinculados`.
- **Resultado:** Prevención de pérdida catastrófica de historial de nómina.
- **Archivo:** `firestore.rules:L15-19`

---

## 7. Reglas de Retención Histórica y Protección de Datos (LOPDP Ecuador)

---

### RULE-RET-001: Ventana Activa Operativa de 60 Días en Firestore
- **RULE-ID:** `RULE-RET-001`
- **Descripción:** Los registros de asistencia residen en Cloud Firestore únicamente durante **60 días consecutivos**.
- **Condición:** `DIAS_A_MANTENER = 60`. Si `fechaRegistro < (hoy - 60 días)`, el registro califica para archivado y purge.
- **Entrada:** Escaneo diario a las 20:00 por `archivador_diario.gs`.
- **Proceso:** Se traslada a la hoja `REGISTROS` o `VACACIONES` en Google Sheets y se elimina de Firestore mediante `projects/.../databases/(default)/documents:commit` con operación `delete`.
- **Resultado:** Reducción de costos de almacenamiento y base de datos operativa ultrarrápida.
- **Archivo:** `backend/apps_script/archivador_diario.gs:L12,69-85`

---

### RULE-RET-002: Custodia Pasiva de Desvinculaciones (Art. 21 LOPDP)
- **RULE-ID:** `RULE-RET-002`
- **Descripción:** Al concluir un contrato individual de trabajo, los datos del trabajador no se eliminan físicamente; se archivan en custodia confidencial para auditorías patronales (IESS, Ministerio del Trabajo, SRI) durante el plazo de prescripción legal.
- **Condición:**
  ```text
  Mover documento a empleados_desvinculados/{id}
  Desactivar tokens de dispositivos asociados (activo: false)
  Registrar en hoja Sheets DESVINCULADOS
  ```
- **Resultado:** Cumplimiento del Art. 21 de la LOPDP y Código del Trabajo de la República del Ecuador.
- **Archivo:** `JS/tcontrol_core.js:L475-477`, `JS/supervisor/supervisor_directorio.js`, `firestore.rules:L69-75`
