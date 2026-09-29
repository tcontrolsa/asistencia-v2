# 22 — Análisis de Gaps e Incertidumbres (Gap Analysis)

**Sistema:** TCONTROL — Sistema de Gestión y Control Biométrico de Asistencia (2026)  
**Fecha de Análisis:** 2026-09-29  
**Estado:** [VERIFIED]  

---

## 1. Clasificación Metodológica de Certeza de Información

Para evitar asumir supuestos como verdades absolutas, cada hallazgo del análisis se clasifica estrictamente en una de las cuatro categorías formales:

- **`[VERIFIED]`:** Hecho comprobado fehacientemente mediante lectura y verificación directa en el código fuente, archivos de configuración o estado del repositorio.
- **`[INFERRED]`:** Conclusión técnica derivada lógicamente de la evidencia disponible en el código, pero no descrita de forma textual explícita.
- **`[UNKNOWN]`:** Información que no reside dentro del repositorio de código Git (e.g. configuraciones internas en servidores privados de Google, bases de datos remotas o procesos humanos no codificados).
- **`[REQUIRES_CONFIRMATION]`:** Decisión técnica, funcional o de negocio que requiere validación y aprobación explícita por parte de los líderes de proyecto o stakeholders antes de iniciar la reconstrucción.

---

## 2. Matriz de Clasificación de Información

| Área / Dominio | Hallazgo o Elemento Evaluado | Clasificación | Evidencia / Justificación Técnica |
|---|---|---|---|
| **PWA & UI** | El frontend es Vanilla JavaScript puro (ES6+) sin framework (React, Vue, Angular) ni empaquetador (Webpack, Vite). | **`[VERIFIED]`** | No existen `package.json`, `node_modules` ni configuraciones de build. `index.html` carga scripts directamente. |
| **Geocerca** | El radio de marcación permitido es de 250 metros alrededor de las coordenadas de la empresa. | **`[VERIFIED]`** | Declarado en `TCONTROL_CONFIG.RADIO_METROS = 250` y comprobado en `tcontrol_core.js:L12`. |
| **Reglas Horarias** | Entrada ordinaria 07:30, límite atraso 07:45, almuerzo 09:30, salida semana 16:15, salida fin de semana 15:15. | **`[VERIFIED]`** | Comprobado en `tcontrol_core.js:L13-16` y `autocompletar_salidas.gs:L181-183`. |
| **Horas Extras** | El sobretiempo se autoriza automáticamente si la salida excede en más de 45 minutos el fin de jornada. | **`[VERIFIED]`** | Comprobado en `mantenimiento_registros.gs:L446`. |
| **Retención** | Los registros permanecen 60 días en Firestore y luego se migran en lote a Google Sheets. | **`[VERIFIED]`** | Comprobado en `archivador_diario.gs:L12,69-85`. |
| **Dominio Web** | El sitio oficial opera bajo `asistencia.tcontrolsa.com` sobre GitHub Pages con SSL gestionado. | **`[VERIFIED]`** | Archivo `CNAME:L1` y metadatos del repositorio. |
| **Infraestructura Cloud** | La región de Cloud Firestore es `us-central1` o `nam5`. | **`[INFERRED]`** | Los proyectos creados con `firebaseapp.com` en cuentas estándar de Firebase adoptan por defecto multirregión en EE.UU. |
| **Nodo Local** | El servidor `192.168.10.129` es una estación de trabajo física o VM Windows ubicada en la oficina central. | **`[INFERRED]`** | El script `iniciar_tunel.py` utiliza comandos exclusivos de Windows (`taskkill`) y rutas `C:\Users\tcontrol\...`. |
| **Fórmulas de Vacaciones** | Estructura interna exacta de las fórmulas y macros de la hoja `CALCULAR_vacaciones`. | **`[UNKNOWN]`** | El contenido y fórmulas de esa hoja residen dentro del archivo privado en Google Drive y no están versionadas en Git. Solo conocemos los datos que `api_completa.gs` retorna (`adjudicadas`, `tomadas`, `restantes`). |
| **Volumen de Personal** | Número exacto de colaboradores activos en nómina en producción. | **`[UNKNOWN]`** | El archivo `firestore_empleados.json` está excluido del repositorio por `.gitignore:L39` para cumplir la LOPDP. |
| **Alojamiento OpenWA** | Si la instancia de OpenWA/WAHA corre en Docker, contenedor WSL o proceso Node.js directo en la estación `192.168.10.129`. | **`[UNKNOWN]`** | El repositorio solo contiene los clientes y puentes HTTP, no el script de inicialización del motor OpenWA base. |
| **Persistencia a Futuro** | ¿Debe conservarse Google Sheets como Data Warehouse en el nuevo sistema o reemplazarse por una base relacional (PostgreSQL / MySQL / Firestore puro)? | **`[REQUIRES_CONFIRMATION]`** | Google Sheets genera cuellos de botella de latencia (8-15s), pero RRHH puede depender de él para auditorías visuales y fórmulas de nómina. |
| **Servicio de WhatsApp** | ¿Se mantendrá el microservicio local con OpenWA y Cloudflare Tunnel o se migrará a la API oficial de WhatsApp Cloud (Meta / Twilio)? | **`[REQUIRES_CONFIRMATION]`** | La solución actual depende de que una PC en la oficina permanezca encendida con el túnel activo. |
| **Mecanismo de Auth** | ¿Debe conservarse el esquema de Token de Dispositivo + PIN de 4 dígitos o implementarse un proveedor formal (Firebase Auth, JWT, WebAuthn biométrico)? | **`[REQUIRES_CONFIRMATION]`** | El esquema actual no utiliza tokens firmados asimétricamente (JWT), sino consulta directa a BD. |
| **Feriados Post-2026** | ¿Cómo se actualizarán los feriados móviles ecuatorianos a partir del año 2027? | **`[REQUIRES_CONFIRMATION]`** | Actualmente están hardcodeados solo hasta 2026 (`api_completa.gs:L117-122`). Se requiere un algoritmo astronómico o tabla configurable. |
