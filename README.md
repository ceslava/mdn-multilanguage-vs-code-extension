# MDN Multilenguaje — multilingual web documentation

Read MDN Web Docs in your preferred language directly in Visual Studio Code. Hover over HTML elements, supported attributes, CSS properties and selected JavaScript globals. The extension follows the editor language by default and falls back to English when a translation is unavailable.

## Quick start

Install the extension, open an HTML or CSS file and hover over a supported symbol. Use the command palette to select a language, clear the cache or toggle built-in HTML/CSS documentation (with confirmation). The first lookup requires internet access. Cached results are kept locally. Attribute summaries may describe the parent element rather than the specific attribute; JavaScript coverage is limited.

Only documentation lookup URLs are requested from MDN; the extension does not need to send the entire source file. MDN content is attributed separately from the MIT-licensed extension code. See the Spanish documentation below for settings and limitations.

---

# MDN Multilenguaje

Extensión experimental para consultar descripciones de MDN al pasar el ratón sobre etiquetas HTML, atributos HTML y propiedades CSS. Reconoce algunos objetos JavaScript globales.

## Desarrollo local

1. Abre esta carpeta en VS Code.
2. Pulsa F5 para iniciar Extension Development Host.
3. Abre un documento `.html` o `.css` y sitúa el cursor sobre un elemento o propiedad.
4. Ejecuta `MDN Multilenguaje: Elegir idioma` para seleccionar `auto` u otro idioma.

## Comandos

- `MDN Multilenguaje: Elegir idioma`
- `MDN Multilenguaje: Ver diagnóstico`
- `MDN Multilenguaje: Desactivar/restaurar documentación nativa`: solicita confirmación y cambia la configuración de usuario de HTML/CSS; recuerda los valores globales anteriores para restaurarlos.
- `MDN Multilenguaje: Vaciar caché`

## Ajustes

```json
{
  "editor.hover.enabled": "on",
  "mdnMultilenguaje.language": "auto",
  "mdnMultilenguaje.cacheDays": 30,
  "mdnMultilenguaje.maxCharacters": 500
}
```

## Notas

- Los atributos específicos, como `src`, se vinculan con la página del elemento que los contiene (por ejemplo, `video`), en vez de consultar una ruta inexistente de atributos globales. El resumen mostrado puede describir el **elemento** y no exclusivamente el atributo; el enlace apunta a la sección del atributo.
- Para los atributos no reconocidos, no se inventa una página de MDN.
- El idioma predeterminado sigue la interfaz de VS Code; si una página no está disponible se intenta en inglés.
- Se almacena una caché por idioma y página en el almacenamiento global de VS Code. Las búsquedas fallidas se almacenan durante una hora para evitar solicitudes repetidas.
- La configuración de documentación nativa se modifica solo tras confirmación. La restauración se limita a los valores de usuario que estaban guardados; los ajustes del proyecto pueden tener precedencia.
- No sustituye las funciones integradas del editor y no puede impedir que otras extensiones aporten contenido al hover.
- Es una versión experimental: requiere conexión en la primera consulta y la versión 0.1.6 fue probada por el autor; esta revisión de presentación no añade funciones.

Fuente: https://developer.mozilla.org/ y repositorios de MDN. El contenido mostrado es un resumen de metadatos de las páginas, no una reproducción completa de la documentación.

## Autor

Cristian Eslava — https://ceslava.com

Extensión independiente, no afiliada a Mozilla. Documentación de MDN Web Docs y sus colaboradores. Licencia del contenido: https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license
