# PulsoClima para GitHub Pages

Esta carpeta ya contiene el archivo `index.html` y puede publicarse directamente con GitHub Pages.

## Funciones incluidas

- Pronóstico automático de cinco días para cualquier localidad buscada.
- Opción para consultar el tiempo usando la ubicación del dispositivo.
- Avisos preventivos automáticos por viento, tormentas, lluvia, calor o heladas.
- Registro e ingreso de miembros con Supabase.
- Reportes meteorológicos de la comunidad.
- Mapa interactivo con filtros por lluvia, viento, granizo, niebla y calor.
- Confirmaciones comunitarias únicas para validar reportes ajenos.
- Contadores reales de miembros y reportes publicados durante el día.
- Perfiles con localidad, antigüedad, actividad e insignias de reputación.
- Ranking de observadores destacados durante los últimos 30 días.
- Denuncias únicas de reportes para revisión del fundador o moderadores.
- Fotografías opcionales desde la cámara o galería, con vista previa y límite de 5 MB.
- Panel privado para revisar denuncias, descartar avisos u ocultar reportes conservando el registro.
- Panel de fundador para publicar un pronóstico destacado.

Los avisos preventivos son orientativos y no sustituyen las alertas emitidas por los organismos oficiales.

Para guardar la ubicación exacta, habilitar confirmaciones, perfiles, denuncias y fotografías, ejecutá nuevamente `supabase-schema.sql` en el editor SQL de Supabase. El proceso conserva los datos existentes, crea únicamente lo que falta y prepara el espacio seguro para las imágenes. Los reportes anteriores se ubican automáticamente por el nombre de la localidad cuando sea posible.

## Publicación

1. Crear un repositorio nuevo en GitHub.
2. Subir todo el contenido de esta carpeta a la raíz del repositorio.
3. Abrir **Settings → Pages**.
4. En **Build and deployment**, seleccionar **Deploy from a branch**.
5. Elegir la rama **main**, la carpeta **/(root)** y guardar.

GitHub mostrará la dirección pública después de completar la publicación.
