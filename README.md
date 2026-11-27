# Embed Studio para WhatsApp

Generador de tarjetas estilo Discord que crea enlaces con metadatos Open Graph para que WhatsApp pueda mostrar una vista previa enriquecida.

## Ejecutar en tu ordenador

1. Instala Node.js (versión 18 o superior): https://nodejs.org/
2. Descomprime esta carpeta.
3. Abre una terminal dentro de la carpeta.
4. Ejecuta:

   ```bash
   npm install
   npm start
   ```

5. Abre http://localhost:3000

## Publicarlo para usarlo en WhatsApp

WhatsApp necesita poder visitar la página desde Internet. `localhost` solo funciona en tu ordenador y NO generará vistas previas para otras personas.

Puedes desplegar este proyecto en un servicio compatible con Node.js (por ejemplo, Render, Railway o un VPS). Configura el comando de inicio como `npm start` y asegúrate de usar HTTPS.

### Persistencia

Los embeds se guardan en `embeds.json` en el directorio indicado por `DATA_DIR` (por defecto, la carpeta del proyecto). En servicios con disco efímero, configura un disco persistente y establece `DATA_DIR` a su ruta de montaje; de lo contrario, los datos pueden perderse al reiniciar o volver a desplegar.

## Limitaciones importantes

- WhatsApp decide el aspecto exacto de la tarjeta; no admite embeds personalizados idénticos a Discord.
- La vista previa utiliza título, descripción e imagen Open Graph.
- La URL de la imagen debe ser pública y HTTPS.
- WhatsApp almacena vistas previas en caché. Si editas un embed, el enlace ya compartido puede seguir mostrando datos antiguos.
- Este proyecto es una base sencilla: no incluye cuentas, panel de administración ni edición/borrado de embeds.
