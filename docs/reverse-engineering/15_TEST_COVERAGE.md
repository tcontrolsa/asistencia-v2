# 15 — Cobertura de Pruebas y Estrategia de Testing

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Estado Actual de la Cobertura de Pruebas

El repositorio **no cuenta con un framework automatizado de integración continua (CI/CD)** como Jest, Vitest, Mocha, Cypress o Playwright configurado en la raíz [VERIFIED].

La validación y control de calidad del sistema se ha desarrollado históricamente a través de tres mecanismos:
1. **Herramientas de Diagnóstico Integradas en el Frontend:** `diagnostico.html` y `visor_empleado.html`.
2. **Scripts Ad-Hoc de Verificación Matemática y de Lógica de Negocio:** Scripts PowerShell y Node/JS ubicados en `tools/scratch/`.
3. **Página de Pruebas Unitarias DOM/JS:** `tools/scratch/test_tcontrol_core.js.html`.

---

## 2. Inventario de Pruebas y Scripts de Verificación Identificados

| Tipo de Prueba | Herramienta / Archivo | Funcionalidad Evaluada | Procedimiento de Ejecución | Estado |
|---|---|---|---|---|
| **Conectividad / Integración** | `diagnostico.html` + `diagnostico_core.js` | Conectividad con Google Apps Script y latencia con Cloud Firestore | Abrir `diagnostico.html` en el navegador y ejecutar pruebas de ping | [VERIFIED] |
| **Unitaria / Utilidades** | `tools/scratch/test_tcontrol_core.js.html` | Criptografía (`hashPassword`), formateo de horas (`formatearHora`, `obtenerMinutos`) y distancia Haversine | Abrir en navegador; valida aserciones en consola | [VERIFIED] |
| **Simulación de Negocio** | `tools/scratch/simulate_all_employees.ps1` | Reglas de asistencia, atrasos y marcaciones para toda la nómina | Ejecución PowerShell contra la API de Sheets/Firestore | [VERIFIED] |
| **Cálculo de Nómina** | `tools/scratch/verify_calculations.js` | Fórmulas de liquidación de horas trabajadas y deducción de permisos | Script local de verificación numérica | [VERIFIED] |
| **Validación de Ausencias** | `tools/scratch/test_exact_logic.ps1` | Detección de salidas faltantes y regularización a 15:15 / 16:15 | Script PowerShell de validación | [VERIFIED] |
| **Inspección de Estados** | `visor_empleado.html` | Simulación visual de credencial y estados biométricos de empleados | Simulador web interactivo | [VERIFIED] |

---

## 3. Detalle de Casos de Prueba Críticos y Mapeo Funcional

A continuación se detalla la suite de casos de prueba requerida para validar cualquier reconstrucción del sistema:

---

### TC-001: Validación de Geocerca Haversine
- **Funcionalidad Relacionada:** `FUNC-EMP-003` (Marcación Biométrico-Satelital).
- **Tipo:** Unitaria / Lógica de Negocio.
- **Entorno de Prueba:** `test_tcontrol_core.js.html`.
- **Casos:**
  1. *Dentro del radio:* Latitud `-0.128870`, Longitud `-78.478960` (Distancia ~1.1m a base). **Resultado Esperado:** Válido ($\le 250\text{ m}$).
  2. *En el límite exacto:* Distancia calculada $250.0\text{ m}$. **Resultado Esperado:** Válido.
  3. *Fuera del radio:* Latitud `-0.135000`, Longitud `-78.485000` (Distancia ~950m). **Resultado Esperado:** Rechazado con excepción y mensaje de distancia excedida.
  4. *Excepción de Campo:* Distancia 15 km pero `MODO == 'CAMPO'`. **Resultado Esperado:** Aprobado.

---

### TC-002: Hashing Criptográfico de Contraseñas PIN
- **Funcionalidad Relacionada:** `FUNC-EMP-002` (Autenticación por PIN).
- **Tipo:** Unitaria.
- **Casos:**
  1. *PIN Numérico "1234":*
     - Digesto SHA-256 esperado: `03ac674216f3e15c761ee1a5e255f067953623c8b388b4459e13f978d7c846f4`.
     - Se comprueba que tanto `window.crypto.subtle` como `sha256PureJs` produzcan exactamente el mismo resultado hexadecimal de 64 caracteres.
  2. *PIN Vacío:* Retorna cadena vacía `""`.
  3. *Espacios en Blanco:* " 1234 " se limpia con `.trim()` antes del hash.

---

### TC-003: Tolerancia y Detección de Atrasos (07:45)
- **Funcionalidad Relacionada:** `RULE-HOR-002`.
- **Tipo:** Integración / Validación de Formulario.
- **Casos:**
  1. *Timbrado a las 07:44:59:* Entrada normal sin requerir justificación.
  2. *Timbrado a las 07:45:01:* Despliega modal de justificación obligatoria. Si el campo de motivo está vacío, bloquea la confirmación.

---

### TC-004: Autocompletado Diferenciado de Salidas (Semana vs Fin de Semana)
- **Funcionalidad Relacionada:** `RULE-HOR-004`, `AUTO-002`.
- **Tipo:** Integración en Google Apps Script (`autocompletar_salidas.gs`).
- **Casos:**
  1. *Martes sin timbrado de salida:* Se inserta registro con hora `16:15:00` y `DISPOSITIVO = 'AUTO_COMPLETAR'`.
  2. *Domingo sin timbrado de salida:* Se inserta registro con hora `15:15:00` y `DISPOSITIVO = 'AUTO_COMPLETAR'`.
  3. *Horas extras en autocompletado:* Se comprueba que en ambos casos `HORAS_EXTRA == 'NO'`.

---

### TC-005: Concurrencia de Almuerzos y Control de Doble Ración
- **Funcionalidad Relacionada:** `FUNC-CAT-002`, `RULE-ALM-002`.
- **Tipo:** Integración de Base de Datos.
- **Casos:**
  1. *Primer intento de entrega:* `consumo_almuerzos/{fecha}_{id}` cambia a `consumido: true`.
  2. *Segundo intento con el mismo colaborador:* El sistema arroja error de validación impidiendo doble despacho.

---

## 4. Brechas de Testing (Testing Gaps) y Recomendaciones

1. **[GAPS DETECTADOS]:**
   - Ausencia de tests unitarios ejecutables mediante `npm test`.
   - Ausencia de tests E2E que simulen el hardware de cámara web y geolocalización satelital.
   - Las validaciones de Google Apps Script dependen de ejecuciones manuales en la consola de Google Workspace.
2. **Recomendación para la Reconstrucción:**
   - Implementar un arnés de pruebas unitarias automatizadas con Vitest o Jest para la suite de funciones puras (`tcontrol_core`).
   - Implementar pruebas E2E con Playwright simulando permisos de geolocalización (`geolocation.setGeolocation`) y mock de cámara virtual.
