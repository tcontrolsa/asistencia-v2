import { useQueryClient } from '@tanstack/react-query';
import { rpc } from './api';
import { claves } from './datos';
import { useUi } from '../ui/Ui';

// triggerProfilePhotoUpload: elige imagen, la reduce a 160 px (JPEG 0.75) y la sube
function reducir(archivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lector = new FileReader();
    lector.onerror = () => reject(new Error('Error procesando imagen'));
    lector.onload = ev => {
      const img = new Image();
      img.onerror = () => reject(new Error('Error procesando imagen'));
      img.onload = () => {
        const max = 160;
        let w = img.width, h = img.height;
        if (w > h) { if (w > max) { h = Math.round((h * max) / w); w = max; } } else if (h > max) { w = Math.round((w * max) / h); h = max; }
        const canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = String(ev.target?.result);
    };
    lector.readAsDataURL(archivo);
  });
}

export function useSubirFoto(nombre: string) {
  const ui = useUi();
  const qc = useQueryClient();
  return (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
      const archivo = input.files?.[0];
      if (!archivo) return;
      ui.cargando(true);
      try {
        const base64 = await reducir(archivo);
        await rpc('subir_foto', { p_base64: base64 });
        await qc.invalidateQueries({ queryKey: claves.contexto });
        ui.cargando(false);
        await ui.splash({ titulo: '¡Foto Actualizada!', nombreEmpleado: nombre,
          subtitulo: 'Tu nueva fotografía de perfil ya está activa en tu credencial digital.', icono: 'badge',
          detalles: ['Imagen optimizada y procesada', 'Credencial corporativa sincronizada'], duracion: 1400 });
      } catch (err) {
        ui.cargando(false);
        ui.toast((err as Error).message || 'Error al guardar la foto', 'error');
      }
    };
    input.click();
  };
}
