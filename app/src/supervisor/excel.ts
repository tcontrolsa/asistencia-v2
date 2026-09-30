// Exportación a Excel con SheetJS, cargado bajo demanda (asegurarXLSX del legado)
/* eslint-disable @typescript-eslint/no-explicit-any */
export async function asegurarXLSX() {
  return import('xlsx');
}

// Hoja a partir de filas (array de arrays) con anchos de columna opcionales
export async function descargarExcel(nombreArchivo: string, hojas: { nombre: string; filas: any[][]; anchos?: number[] }[]) {
  const XLSX = await asegurarXLSX();
  const wb = XLSX.utils.book_new();
  hojas.forEach(h => {
    const ws = XLSX.utils.aoa_to_sheet(h.filas);
    if (h.anchos) ws['!cols'] = h.anchos.map(wch => ({ wch }));
    XLSX.utils.book_append_sheet(wb, ws, h.nombre.slice(0, 31));
  });
  XLSX.writeFile(wb, nombreArchivo);
}
