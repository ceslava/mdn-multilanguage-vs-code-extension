# MDN in Your Language — multilingual web documentation

Read MDN Web Docs in your preferred language directly in Visual Studio Code. Hover over HTML elements and attributes, CSS properties, JavaScript built-ins, and browser APIs. The extension follows the editor language by default and falls back to English when a translation is unavailable.

## Quick start

Install the extension and hover over an HTML tag such as `<details>`, a CSS property such as `grid-template-columns`, or a JavaScript method such as `Array.from()`. The extension disables built-in HTML, CSS, SCSS, and Less hover documentation and references by default. Use the command palette to choose the MDN language or turn built-in documentation back on. The first lookup needs internet access to retrieve a summary.

Only documentation lookup URLs are requested from MDN; the extension does not need to send the entire source file. MDN content is attributed separately from the MIT-licensed extension code. See the Spanish documentation below for settings and limitations.

---

# MDN in Your Language

Consulta descripciones de MDN al pasar el ratón sobre etiquetas y atributos de HTML, propiedades de CSS, objetos y métodos estándar de JavaScript y APIs del navegador como `fetch` y `document.querySelector`. También analiza CSS y JavaScript dentro de HTML, además de SCSS, Less, JSX y TypeScript.

## Ejemplo en español

Abre un archivo CSS y escribe `display: grid;`. En la paleta de comandos, ejecuta **MDN in Your Language: Elegir idioma** y selecciona `es`. Al pasar el ratón sobre `display`, verás un resumen y un enlace a la página de MDN en español si está disponible.

## Desarrollo local

1. Abre esta carpeta en VS Code y ejecuta `npm ci`.
2. Pulsa F5 para iniciar Extension Development Host.
3. Abre un documento `.html` o `.css` y sitúa el cursor sobre un elemento o propiedad.
4. Ejecuta `MDN in Your Language: Elegir idioma` para seleccionar `auto` u otro idioma.

## Comandos

- `MDN in Your Language: Elegir idioma`
- `MDN in Your Language: Ver diagnóstico`
- `MDN in Your Language: Desactivar/restaurar documentación nativa` cambia la configuración de usuario para HTML, CSS, SCSS y Less.
- `MDN in Your Language: Vaciar caché`

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

- El hover muestra párrafos introductorios y, cuando el artículo de MDN contiene un ejemplo breve, incluye su código. Si un atributo tiene una sección propia, se prioriza esa sección.
- Los métodos de JavaScript se resuelven según el tipo que se puede inferir en el archivo. La cobertura depende de que MDN tenga una referencia y de que el analizador pueda identificar el símbolo.
- El idioma predeterminado sigue la interfaz de VS Code; si una página no está disponible se intenta en inglés.
- Se almacena una caché por idioma y página en el almacenamiento global de VS Code. Las búsquedas fallidas se almacenan durante una hora para evitar solicitudes repetidas.
- Al instalar la extensión se oculta por defecto la documentación nativa de HTML, CSS, SCSS y Less. Los valores explícitos del usuario o del proyecto tienen precedencia. VS Code puede seguir mostrando información nativa de JavaScript y TypeScript.

Los extractos y ejemplos proceden del artículo de MDN enlazado en cada hover. Consulta las condiciones aplicables al texto y al código en la licencia del contenido de MDN.

## Autor

Cristian Eslava — https://ceslava.com

Extensión independiente, no afiliada a Mozilla. Documentación de MDN Web Docs y sus colaboradores. Licencia del contenido: https://developer.mozilla.org/en-US/docs/MDN/Writing_guidelines/Attrib_copyright_license
