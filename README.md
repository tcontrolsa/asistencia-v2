# T-Control Asistencia 2.0 (React + PostgreSQL)

Sistema moderno, reactivo y de alto rendimiento para el control de asistencia y personal de **T-Control S.A.**

---

## 🚀 Arquitectura y Aislamiento

- **Totalmente Independiente:** Este proyecto se encuentra contenido al 100% dentro de la carpeta `asistencia-v2/` en la raíz del repositorio. No afecta ni modifica los archivos del frontend legado (`JS/`, `CSS/`, `index.html`, `supervisor.html`).
- **Frontend:** React (Vite 5), Vanilla CSS con diseño moderno, componentes reactivos, soporte táctil (Kiosco con PinPad virtual), responsive en móviles y tablets.
- **Base de Datos:** PostgreSQL en Docker (`tcontrol-postgres`) con 105 colaboradores y más de 23,700 registros históricos.
- **Backend:** Node.js Express API en Docker (`tcontrol-api` en el puerto `3000`), sin dependencias de Firebase en el frontend.

---

## 📱 Módulos Implementados

1. **🕒 Kiosco:**
   - Selección rápida de marcación: **Entrada**, **Salida**, **Salida Almuerzo**, **Retorno Almuerzo**.
   - Búsqueda en tiempo real entre los 105 colaboradores.
   - Teclado PIN virtual táctil y responsive.
   - Captura de geolocalización (GPS).
   - Respuesta instantánea contra PostgreSQL (<10 ms).

2. **📊 Panel de Supervisor:**
   - Autenticación por PIN de supervisor.
   - KPIs en tiempo real: Colaboradores activos, Entradas hoy, Salidas hoy, Atrasos detectados.
   - Tabla interactiva con búsqueda por colaborador y filtros temporales (Hoy, Semana, Mes, Todos).
   - **Exportación directa a Excel (`.xlsx`)** con un solo clic.

3. **🛡️ Terminal Guardia:**
   - Monitoreo en vivo de quién está actualmente en planta frente a quién está fuera.

4. **🍱 Terminal Catering:**
   - Gestión y asignación de almuerzos del comedor en tiempo real.

---

## 💻 Cómo Ejecutar en Desarrollo

```bash
cd asistencia-v2
npm install
npm run dev
```

El servidor Vite correrá en `http://localhost:5173/` (o `5174` si el puerto está ocupado) y en la red local (`http://192.168.10.85:5173/`), conectándose automáticamente a PostgreSQL a través de `/api`.

## 📦 Compilación para Producción

```bash
cd asistencia-v2
npm run build
```

Genera la versión optimizada en la carpeta `asistencia-v2/dist/`.
