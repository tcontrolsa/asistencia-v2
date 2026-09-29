# 24 — CRITERIOS DE ACEPTACIÓN VERIFICABLES (GHERKIN / BDD)

> **Proyecto:** Sistema de Control Biométrico de Asistencia y Almuerzos (TCONTROL S.A.)  
> **Fecha de Análisis:** Septiembre 2026  
> **Clasificación:** Especificación Formal de Calidad  

---

## 1. INTRODUCCIÓN

Este documento define los criterios de aceptación formales que cualquier reconstrucción o reimplementación del sistema TCONTROL Asistencia debe satisfacer para ser certificada en producción. Cada escenario está formulado bajo el estándar BDD (Behavior-Driven Development) con la sintaxis `GIVEN`, `WHEN`, `THEN`, `AND`.

---

## 2. CRITERIOS DE ACEPTACIÓN POR FUNCIONALIDAD

### MÓDULO 1: ENROLAMIENTO Y REGISTRO DE DISPOSITIVO

#### Escenario AC-001: Enrolamiento exitoso de nuevo dispositivo móvil
```gherkin
FEATURE: Enrolamiento de Dispositivo Empleado
  Como empleado activo de TCONTROL
  Quiero vincular mi smartphone al sistema mediante mi ID y PIN
  Para poder marcar asistencia desde mi propio dispositivo.

  GIVEN el empleado existe en la colección "empleados" con estado "ACTIVO"
    AND el empleado no tiene un token de dispositivo registrado o se encuentra en re-enrolamiento
    AND el dispositivo móvil se encuentra dentro de la oficina (GPS < 250m) o en modo exento
  WHEN el usuario ingresa su ID ("1058") y su PIN de 4 dígitos
    AND presiona "Vincular Dispositivo"
  THEN el sistema genera un UUID único y calcula el hash SHA-256 del PIN
    AND guarda el token en "localStorage" bajo la clave "tc_dispositivo_token"
    AND crea o actualiza el documento en la colección "dispositivos" vinculando el token al ID del empleado
    AND redirige automáticamente a la pantalla principal de marcación.
```

#### Escenario AC-002: Rechazo de enrolamiento con PIN incorrecto
```gherkin
FEATURE: Seguridad en Enrolamiento
  GIVEN un empleado registrado con PIN válido hasheado
  WHEN un usuario ingresa el ID del empleado y un PIN erróneo
  THEN el sistema no genera ningún token de dispositivo
    AND no altera la colección "dispositivos"
    AND muestra una alerta visual: "Credenciales inválidas. Verifique su ID y PIN."
    AND registra el intento fallido en el log de auditoría.
```

---

### MÓDULO 2: MARCACIÓN BIOMÉTRICA DE ENTRADA Y SALIDA

#### Escenario AC-003: Marcación puntual de entrada dentro del perímetro geográfico
```gherkin
FEATURE: Marcación de Entrada Puntual
  Como colaborador de TCONTROL
  Quiero registrar mi entrada a las 07:25 AM dentro de la oficina
  Para registrar mi asistencia sin penalización.

  GIVEN el empleado está autenticado con token de dispositivo válido
    AND la hora actual es 07:25 AM (GMT-5)
    AND las coordenadas del dispositivo indican una distancia de 85 metros de la planta central
    AND no existe registro previo de entrada para la fecha actual
  WHEN el empleado captura su fotografía selfie
    AND confirma el registro de "Entrada"
  THEN el sistema calcula la distancia mediante la fórmula Haversine obteniendo 85m (< 250m)
    AND crea el documento en "registros" con ID determinista "YYYY-MM-DD_EMP-XXXX"
    AND asigna el estado "PUNTUAL" al campo "estado_llegada"
    AND persiste la URL o base64 de la fotografía en el campo "foto_url"
    AND muestra el mensaje de confirmación "Marcación de Entrada Exitosa".
```

#### Escenario AC-004: Marcación con atraso (después de 07:45 AM)
```gherkin
FEATURE: Detección y Notificación de Atraso
  GIVEN el empleado se encuentra dentro del perímetro (< 250m)
    AND la hora actual es 07:52 AM (GMT-5)
  WHEN el empleado completa su marcación de entrada
  THEN el sistema registra el evento de entrada con estado "ATRASO"
    AND calcula los minutos de atraso (22 minutos respecto a las 07:30)
    AND dispara la orden de notificación a WhatsApp mediante el endpoint local
    AND el mensaje de WhatsApp enviado al supervisor indica: "Atraso registrado: [Nombre], 22 minutos".
```

#### Escenario AC-005: Rechazo de marcación fuera del rango geográfico permitido
```gherkin
FEATURE: Bloqueo Geográfico de Asistencia
  GIVEN el empleado se encuentra a una distancia de 480 metros de las coordenadas oficiales
    AND el empleado no posee la excepción "trabajo_remoto: true"
  WHEN el empleado intenta registrar su entrada o salida
  THEN el sistema rechaza la operación antes de persistir en Firestore
    AND muestra un mapa interactivo (Leaflet) indicando su ubicación actual y el radio permitido de 250m
    AND despliega el mensaje de error: "Ubicación fuera de rango. Debe encontrarse a menos de 250m de la empresa."
```

---

### MÓDULO 3: GESTIÓN Y CONSUMO DE ALMUERZOS

#### Escenario AC-006: Reserva de almuerzo antes de la hora límite (09:30 AM)
```gherkin
FEATURE: Selección de Menú de Almuerzo
  Como colaborador con derecho a comedor
  Quiero reservar mi almuerzo a las 08:45 AM
  Para asegurar mi comida en el comedor de la empresa.

  GIVEN la hora actual es 08:45 AM (menor a la hora de corte 09:30 AM)
    AND el empleado ha registrado su entrada en el día
    AND no existe reserva previa en "consumo_almuerzos" para este empleado hoy
  WHEN el empleado selecciona la opción de menú (ej. "Menú Ejecutivo A")
    AND pulsa "Confirmar Almuerzo"
  THEN el sistema guarda el registro en la colección "consumo_almuerzos" con estado "RESERVADO"
    AND actualiza el contador de pedidos del día para la cocina
    AND bloquea nuevas modificaciones de menú para el empleado.
```

#### Escenario AC-007: Bloqueo de pedido de almuerzo posterior a las 09:30 AM
```gherkin
FEATURE: Hora Límite Estricta de Almuerzo
  GIVEN la hora actual es 09:31 AM o superior
  WHEN un empleado intenta realizar una reserva de almuerzo
  THEN el botón de selección de menú se encuentra deshabilitado en la UI
    AND cualquier intento de envío por API es rechazado con código 400
    AND el sistema muestra el mensaje: "Hora límite excedida. Los pedidos cerraron a las 09:30 AM."
```

#### Escenario AC-008: Despacho de almuerzo en comedor por personal de catering
```gherkin
FEATURE: Confirmación de Entrega de Almuerzo
  GIVEN el empleado reservó su almuerzo y se presenta en el comedor
  WHEN el operador de cocina escanea el código de empleado o confirma en el panel
  THEN el documento en "consumo_almuerzos" cambia su estado de "RESERVADO" a "CONSUMIDO"
    AND se registra la marca de tiempo exacta de la entrega
    AND el registro queda inhabilitado para ser consumido nuevamente en el mismo día.
```

---

### MÓDULO 4: PANEL DE GUARDIA Y CONTROL DE CONTINGENCIA

#### Escenario AC-009: Marcación asistida por guardia de garita
```gherkin
FEATURE: Marcación de Guardia para Terceros
  Como guardia de seguridad en garita
  Quiero registrar la entrada o salida de un empleado que olvidó su teléfono
  Para garantizar que su jornada quede asentada en el sistema.

  GIVEN el guardia ha ingresado la clave maestra de garita validada
  WHEN el guardia selecciona el ID del empleado en la lista y toma la fotografía con la cámara de garita
    AND pulsa "Registrar Asistencia"
  THEN el sistema infiere automáticamente el tipo de evento correspondiente (Entrada o Salida)
    AND guarda el documento con la etiqueta "operador: GUARDIA"
    AND el evento queda reflejado inmediatamente en la consola de supervisión.
```

---

### MÓDULO 5: HORAS SUPLEMENTARIAS Y SALIDAS AUTOMÁTICAS

#### Escenario AC-010: Solicitud de horas suplementarias (> 45 minutos)
```gherkin
FEATURE: Generación de Solicitud de Horas Extras
  GIVEN un empleado de lunes a viernes que registra su salida a las 17:30 PM (jornada finaliza 16:15)
    AND el exceso de tiempo es de 1 hora 15 minutos (superior al umbral de 45 minutos)
  WHEN se completa la marcación de salida
  THEN el sistema despliega automáticamente el modal de justificación de horas suplementarias
    AND exige al empleado ingresar el motivo y proyecto asociado
    AND guarda la solicitud en estado "PENDIENTE_APROBACION"
    AND envía un mensaje de notificación de WhatsApp al supervisor asignado.
```

#### Escenario AC-011: Cierre automático de salidas nocturnas (Trigger Medianoche)
```gherkin
FEATURE: Autocompletado de Salidas Olvidadas
  GIVEN un empleado que registró entrada pero no registró salida al final del día
  WHEN se ejecuta el proceso batch de Google Apps Script a las 23:59:00 (GMT-5)
  THEN el sistema localiza el registro de entrada huérfano
    AND autocompleta el campo de salida con la hora oficial estándar (16:15 en días de semana o 15:15 en sábados)
    AND asigna el flag "salida_automatica: true"
    AND registra en el log administrativo la intervención del script.
```

---

### MÓDULO 6: ARCHIVO HISTÓRICO Y MANTENIMIENTO

#### Escenario AC-012: Archivo de registros mayores a 60 días a Google Sheets
```gherkin
FEATURE: Purga y Archivo de 60 Días
  GIVEN existen registros en Firestore cuya fecha es anterior a (HOY - 60 días)
  WHEN el trigger diario de Google Apps Script se dispara a las 20:00 PM
  THEN el script consulta los registros antiguos en Firestore
    AND añade cada registro como una fila en la hoja de cálculo "Historial_Asistencia" respetando las 25 columnas
    AND una vez confirmada la escritura en Sheets, elimina los documentos archivados de Firestore
    AND emite un log de ejecución detallando la cantidad de registros migrados y eliminados.
```
