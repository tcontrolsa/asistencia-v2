# 25 — AUDITORÍA DE INCONSISTENCIAS, CÓDIGO HUÉRFANO Y DEUDA TÉCNICA

> **Proyecto:** Sistema de Control Biométrico de Asistencia y Almuerzos (TCONTROL S.A.)  
> **Fecha de Análisis:** Septiembre 2026  
> **Clasificación:** Auditoría Técnica y Control de Calidad  

---

## 1. INTRODUCCIÓN

Durante la fase de ingeniería inversa exhaustiva del repositorio `Asistencia`, se realizó una trazabilidad cruzada bidireccional entre:
- Archivos fuente y scripts (`HTML`, `JS`, `GAS`, `Python`, `Batch`)
- Endpoints y servicios de mensajería
- Modelos de datos y colecciones de base de datos
- Reglas de negocio y flujos de usuario

Este documento consolida todas las discrepancias, código sin invocación activa, dependencias no documentadas y vulnerabilidades de mantenimiento detectadas.

---

## 2. INCONSISTENCIAS CRÍTICAS DE ARQUITECTURA Y CÓDIGO

### INC-001: IPs y Puertos Hardcoded en el Entorno del Cliente
- **Ubicación:** [tcontrol_core.js](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/JS/tcontrol_core.js), scripts de túnel en `WhatsApp/`
- **Evidencia:** `http://192.168.10.129:2785/api/send` y `http://127.0.0.1:2786`
- **Problema:** Si la máquina de garita/servidor cambia de IP por DHCP, o si se despliega en una subred distinta, las notificaciones de WhatsApp fallan silenciosamente sin posibilidad de configuración dinámica.
- **Acción en Reconstrucción:** Reemplazar por variables de entorno inyectadas en build time o almacenadas centralizadamente en `configuracion/general` en Firestore.

### INC-002: Tabla de Días Feriados con Límite Temporal en 2026
- **Ubicación:** [tcontrol_core.js](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/JS/tcontrol_core.js#L145-L190)
- **Evidencia:** Arreglo estático de feriados nacionales de Ecuador codificado únicamente para los años 2024, 2025 y 2026.
- **Problema:** A partir del 1 de enero de 2027, el sistema dejará de reconocer feriados nacionales, considerando días festivos como jornadas laborales regulares e incurriendo en falsos atrasos y cálculos erróneos de horas extras.
- **Acción en Reconstrucción:** Externalizar el calendario de feriados a una colección en Firestore (`configuracion_feriados`) o consumir una API de calendario oficial.

### INC-003: Credencial Maestra de Garita Compartida y Hardcoded
- **Ubicación:** [asistencia.html](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/asistencia.html), [guardia_panel.js](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/JS/guardia_panel.js#L42)
- **Evidencia:** Comparación directa en texto claro contra `CLAVE_GUARDIA = "TCONTROL2026"`.
- **Problema:** Cualquier empleado o persona con acceso a inspeccionar el código fuente del navegador puede obtener la clave y acceder al panel de guardia para alterar marcaciones o impersonar compañeros.
- **Acción en Reconstrucción:** Autenticación por roles mediante Firebase Auth y verificación del token en backend.

### INC-004: ID de Administrador Fijo en Código (`ADMIN_ID = "1058"`)
- **Ubicación:** [asistencia.html](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/asistencia.html), [supervisor.html](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/supervisor.html)
- **Evidencia:** `if (empleadoId === "1058") { enableAdminActions(); }`
- **Problema:** Acoplamiento directo de privilegios de superusuario a un ID de empleado específico. Si dicho colaborador cambia de rol o se retira de la empresa, se requiere un commit de código para cambiar de administrador.
- **Acción en Reconstrucción:** Migrar a un campo `rol: "SUPER_ADMIN" | "SUPERVISOR" | "EMPLEADO"` en la base de datos o custom claims de Firebase Auth.

---

## 3. COMPONENTES Y FUNCIONES HUÉRFANAS O SIN CONSUMIDOR

| Archivo / Símbolo | Tipo | Evidencia / Observación | Diagnóstico |
|---|---|---|---|
| `test_sha256.js` | Archivo | Ubicado en raíz o herramientas auxiliares; no importado en ningún HTML. | Script de prueba manual de laboratorio. Candidato a eliminar en reconstrucción. |
| `debug_asistencia.bat` | Script | Archivo de depuración local Windows que abre la consola de Chrome en puerto de debugging. | Herramienta de soporte local. |
| `v1_legacy_backup/` | Directorio | Fragmentos de código previo a la versión PWA 2026. | Código obsoleto. Candidato a descarte. |
| `checkOvertimeLegacy()` | Función JS | Función de cálculo que fue sustituida por el modal dinámico de justificación. | Código muerto (Dead Code). |

---

## 4. CAMPOS DE DATOS Y TABLAS SIN FUNCIONALIDAD CLARA

| Entidad / Colección | Campo | Estado de Uso | Recomendación |
|---|---|---|---|
| `empleados` | `telefono_secundario` | Presente en formulario de enrolamiento pero nunca referenciado en envíos de WhatsApp. | Unificar a un único canal o implementar envío alternativo. |
| `registros` | `dispositivo_bateria` | Capturado ocasionalmente en payload pero no analizado en reportes ni dashboards. | Mantener solo si aporta a auditoría forense de fallos móviles. |
| `consumo_almuerzos` | `calificacion_servicio` | Campo preparado para encuestas de satisfacción con valores 1-5, pero la vista de comensal no posee estrellas de calificación activas. | Activar la interfaz de calificación o retirar el campo del esquema. |

---

## 5. RIESGOS DE CONCURRENCIA Y TIMING

1. **Desfase de Reloj de Cliente (Drift):**
   - El sistema toma la hora del dispositivo cliente (`new Date()`) para iniciar validaciones visuales, aunque el timestamp final es ratificado por Firestore (`serverTimestamp()`).
   - Si un usuario altera manualmente la hora de su teléfono para aparentar haber llegado a las 07:29 AM, la UI le permite capturar la foto, aunque Firestore registrará el timestamp de servidor real. La discrepancia entre la hora mostrada y la hora guardada genera confusión en el empleado.
   - **Solución:** Sincronizar el reloj del cliente con una llamada NTP / HTTP HEAD previa al habilitar la marcación.

2. **Doble Envío por Falta de Debounce en Botones:**
   - En conexiones 3G/LTE inestables, si el usuario pulsa repetidamente el botón "Confirmar Marcación", pueden generarse llamadas concurrentes a Firestore antes de que el botón entre en estado deshabilitado (`disabled`).
   - **Solución:** Implementar debounce inmediato y bloqueo de pantalla con overlay en el primer click.

---

## 6. SÍNTESIS DE LA AUDITORÍA

- **Total de Inconsistencias Detectadas:** 12 hallazgos documentados.
- **Severidad Alta:** 4 (IPs hardcoded, feriados 2026, clave guardia estática, ADMIN_ID fijo).
- **Severidad Media:** 5 (Dead code, drift de reloj, debounce, campos no explotados).
- **Severidad Baja:** 3 (Scripts de depuración huérfanos, directorios residuales).
- **Conclusión de Arquitectura:** El sistema actual es plenamente operativo pero posee una deuda técnica considerable ligada a secretos e identificadores en cliente. La reconstrucción debe erradicar por completo los acoplamientos hardcoded.
