# 23 — MATRIZ Y GESTIÓN DE RIESGOS DE MIGRACIÓN Y RECONSTRUCCIÓN

> **Proyecto:** Sistema de Control Biométrico de Asistencia y Almuerzos (TCONTROL S.A.)  
> **Fecha de Análisis:** Septiembre 2026  
> **Clasificación:** Confidencial / Arquitectura de Software  

---

## 1. INTRODUCCIÓN Y METODOLOGÍA DE EVALUACIÓN

El presente documento analiza integralmente los riesgos inherentes al proceso de reconstrucción y migración del sistema TCONTROL Asistencia. Debido a que el sistema opera en un entorno de producción activo regulado por leyes laborales (cálculo de horas suplementarias/extraordinarias) y de protección de datos personales (LOPDP Ecuador), cualquier interrupción, pérdida de sincronización o desvío de comportamiento impacta directamente en las relaciones laborales y en la operación diaria.

### Matriz de Evaluación de Riesgo (Probabilidad x Impacto)
- **Probabilidad:** Baja (1), Media (2), Alta (3)
- **Impacto:** Menor (1), Moderado (2), Crítico (3), Catastrófico (4)
- **Nivel de Severidad:**
  - **Crítico (P x I >= 8):** Requiere mitigación obligatoria antes de iniciar la migración.
  - **Alto (P x I = 6):** Requiere plan de contingencia detallado y pruebas automatizadas.
  - **Medio (P x I = 3 - 4):** Monitoreo continuo y mitigación estándar.
  - **Baja (P x I <= 2):** Aceptación o resolución ad-hoc.

---

## 2. MATRIZ DE RIESGOS TÉCNICOS Y ARQUITECTURALES

| ID | Categoría | Descripción del Riesgo | Prob. | Imp. | Severidad | Estrategia de Mitigación |
|---|---|---|---|---|---|---|
| **RSK-TEC-001** | **Persistencia** | Sobrescritura no intencionada en Firestore por uso de IDs deterministas (`YYYY-MM-DD_EMP-XXXX`) si se modifica el algoritmo de generación. | 2 | 4 | **Crítico (8)** | Mantener estrictamente el formato `${fechaStr}_EMP-${id}`. Implementar transacciones o precondition checks (`exists == false`) si se desea evitar colisiones accidentales. |
| **RSK-TEC-002** | **Concurrencia** | Condición de carrera en consumo de almuerzos cuando múltiples comensales intentan reservar el último plato o confirmar simultáneamente. | 2 | 3 | **Alto (6)** | Utilizar transacciones atómicas de Firestore (`runTransaction`) con contadores distribuidos para el balance de cocina en lugar de lecturas simples. |
| **RSK-TEC-003** | **Seguridad** | Exposición de credenciales de Firebase en cliente público web permitiendo a atacantes inspeccionar reglas o consultar directamente Firestore. | 3 | 3 | **Crítico (9)** | Auditar y endurecer las Security Rules de Firestore; migrar consultas administrativas a Cloud Functions protegidas por App Check y Custom Claims. |
| **RSK-TEC-004** | **Criptografía** | Discrepancias entre `crypto.subtle.digest` y algoritmos de hashing en backends de reconstrucción (salt/encoding UTF-8 vs Latin-1). | 2 | 4 | **Crítico (8)** | Probar compatibilidad de hashes existentes contra la implementación [sha256PureJs](file:///c:/Users/tcontrol/Documents/GitHub/Asistencia/JS/tcontrol_core.js#L23-L45) en un test suite automatizado. |
| **RSK-TEC-005** | **Geolocalización** | Variación en la precisión del GPS de dispositivos móviles y diferencias de redondeo en la fórmula del semiverseno (Haversine). | 3 | 2 | **Alto (6)** | Mantener radio terrestre estándar `R = 6371` km y tolerancia de 250 m; incorporar visualización de precisión (`coords.accuracy`) en el cliente. |

---

## 3. RIESGOS DE DATOS Y MIGRACIÓN

| ID | Categoría | Descripción del Riesgo | Prob. | Imp. | Severidad | Estrategia de Mitigación |
|---|---|---|---|---|---|---|
| **RSK-DAT-001** | **Integridad** | Desalineación de esquemas entre Firestore (campos anidados en español: `tipo`, `hora`, `coordenadas`) y el archivo histórico en Google Sheets (25 columnas fijas). | 2 | 4 | **Crítico (8)** | Congelar el esquema de archivo de Google Sheets. Crear un transformador de datos bidireccional verificado mediante scripts de reconciliación. |
| **RSK-DAT-002** | **Pérdida de Historial** | Corrupción durante el proceso de exportación/importación de colecciones `registros` y `consumo_almuerzos`. | 1 | 4 | **Medio (4)** | Realizar snapshot completo mediante `gcloud firestore export` en Google Cloud Storage previo a cualquier operación de migración. |
| **RSK-DAT-003** | **Datos Huérfanos** | Registros de asistencia vinculados a empleados dados de baja o eliminados sin que exista documento en `empleados_desvinculados`. | 2 | 2 | **Medio (4)** | Ejecutar script de integridad referencial previo a la reconstrucción, validando que todo `empleado_id` exista en empleados activos o históricos. |
| **RSK-DAT-004** | **Formato Fechas** | Incompatibilidad de zona horaria (UTC vs `America/Guayaquil` GMT-5) provocando que marcas nocturnas o matutinas se registren en el día incorrecto. | 2 | 4 | **Crítico (8)** | Estandarizar almacenamiento en ISO 8601 UTC en backend y formateo explícito en zona horaria `America/Guayaquil` en cliente. |

---

## 4. RIESGOS DE INTEGRACIONES EXTERNAS

| ID | Categoría | Descripción del Riesgo | Prob. | Imp. | Severidad | Estrategia de Mitigación |
|---|---|---|---|---|---|---|
| **RSK-INT-001** | **WhatsApp / WAHA** | Suspensión de cuenta de WhatsApp por detección de envíos masivos o cambios en la API no oficial de Baileys / OpenWA. | 3 | 3 | **Crítico (9)** | Mantener cola de reintentos con backoff exponencial y pausas de 1-2 segundos entre mensajes. Implementar fallback a notificación por correo o push. |
| **RSK-INT-002** | **Túnel Cloudflare** | Caída del subproceso `cloudflared.exe` o revocación del túnel efímero en la máquina local `192.168.10.129`. | 3 | 3 | **Crítico (9)** | Instalar Cloudflare Tunnel como servicio de Windows persistente (Named Tunnel con token permanente) en lugar de sesiones efímeras Quick Tunnel. |
| **RSK-INT-003** | **Google Apps Script Quotas** | Agotamiento de cuotas de ejecución de Google Apps Script (límite de 6 min/ejecución y cuota de peticiones HTTP URLFetch diario). | 2 | 3 | **Alto (6)** | Limitar el lote del archivador automático a bloques de 50 registros por iteración. Migrar procesamiento pesado a Cloud Functions. |
| **RSK-INT-004** | **Google Drive CDN** | Cambios en las políticas de acceso directo a imágenes de Google Drive (`drive.google.com/uc?id=...` y `lh3.googleusercontent.com`). | 2 | 3 | **Alto (6)** | Migrar progresivamente el almacenamiento de fotografías y avatares a Cloud Storage for Firebase con URLs firmadas o de acceso público controlado. |

---

## 5. RIESGOS DE SEGURIDAD Y CUMPLIMIENTO LEGAL

| ID | Categoría | Descripción del Riesgo | Prob. | Imp. | Severidad | Estrategia de Mitigación |
|---|---|---|---|---|---|---|
| **RSK-SEC-001** | **LOPDP Ecuador** | Almacenamiento no encriptado de fotografías faciales (datos biométricos) y geolocalización que contravenga la Ley de Protección de Datos. | 2 | 4 | **Crítico (8)** | Incorporar cláusulas explícitas de consentimiento en enrolamiento. Cifrar metadatos biométricos y definir política de purga a los 60 días. |
| **RSK-SEC-002** | **Suplantación Guardia** | Compromiso de la clave compartida de guardia (`TCONTROL2026`) permitiendo a terceros alterar registros de asistencia de cualquier personal. | 3 | 3 | **Crítico (9)** | Reemplazar clave estática por autenticación individual de guardias con usuario, contraseña individual y registro de auditoría del operador. |
| **RSK-SEC-003** | **Device Spoofing** | Modificación manual del `localStorage` (`tc_dispositivo_token`) o emulación de geolocalización en herramientas de desarrollo del navegador. | 2 | 3 | **Alto (6)** | Validación de tokens de dispositivo en backend contra colección `dispositivos`; verificación de flags `mockLocation` en Android/PWA. |

---

## 6. RIESGOS OPERACIONALES Y DE TRANSICIÓN

| ID | Categoría | Descripción del Riesgo | Prob. | Imp. | Severidad | Estrategia de Mitigación |
|---|---|---|---|---|---|---|
| **RSK-OPS-001** | **Corte de Servicio Matutino** | Falla del sistema entre 07:00 y 08:00 AM impidiendo el registro de ingreso de más de 40 colaboradores. | 2 | 4 | **Crítico (8)** | Ejecutar fase de paralelismo (Shadow Running) donde el sistema actual y el nuevo operen concurrentemente durante 14 días. |
| **RSK-OPS-002** | **Desconfiguración de Comedor** | Pérdida de pedidos de almuerzo antes de las 09:30 AM provocando desabastecimiento en cocina y reclamos de catering. | 2 | 3 | **Alto (6)** | Respaldo automático diario a las 09:35 AM de la colección `consumo_almuerzos` enviado por correo al proveedor del comedor. |
| **RSK-OPS-003** | **Resistencia del Usuario** | Rechazo de empleados ante cambios en la interfaz o nuevos pasos de autenticación biométrica. | 2 | 2 | **Medio (4)** | Preservar idéntica jerarquía visual, flujo de marcado rápido en 2 toques (PIN + Selfie) y capacitación previa al lanzamiento. |

---

## 7. PLAN DE CONTINGENCIA Y ROLLBACK

1. **Procedimiento de Rollback Inmediato:**
   - La rama `main` del repositorio original permanecerá inalterada y lista para ser redesplegada en GitHub Pages en < 5 minutos en caso de falla crítica del nuevo sistema.
   - El túnel y backend local de WhatsApp permanecerán operando sin cambios de dependencias en el servidor `192.168.10.129`.
2. **Punto de No Retorno:**
   - Se declarará únicamente cuando el nuevo sistema haya superado 30 días continuos de producción sin incidentes de pérdida de marcación y con conciliación al 100% de la nómina.
