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

// PDF de una sección de la pantalla (asegurarHtml2Pdf + html2pdf del legado), cargado bajo demanda
export async function descargarPdf(elemento: HTMLElement, nombreArchivo: string) {
  const { default: html2pdf } = await import('html2pdf.js');
  const clone = elemento.cloneNode(true) as HTMLElement;
  clone.style.padding = '20px';
  clone.style.background = 'white';
  await html2pdf().set({
    margin: 10, filename: nombreArchivo, image: { type: 'jpeg', quality: 0.98 }, html2canvas: { scale: 2 },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
  } as any).from(clone).save();
}

// Descarga de un archivo generado en el navegador (Blob)
export function descargarBlob(contenido: string, tipo: string, nombreArchivo: string) {
  const url = URL.createObjectURL(new Blob([contenido], { type: tipo }));
  const link = document.createElement('a');
  link.href = url;
  link.download = nombreArchivo;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
