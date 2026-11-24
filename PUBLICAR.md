# Publicación

Abre esta carpeta (la que contiene package.json) en VS Code. Con Node.js instalado, ejecuta:

```sh
npx --yes @vscode/vsce package
```

Instala el VSIX generado para comprobarlo y súbelo a https://marketplace.visualstudio.com/manage bajo el publisher ceslava. Si vsce pregunta por la ausencia de repositorio, puedes confirmar si todavía no tienes uno público. No inventes una URL de repositorio.
