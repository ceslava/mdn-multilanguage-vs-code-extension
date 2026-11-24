'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const { identify, languages, release } = require('./symbols');
const { extractArticle } = require('./mdn-article');
const output = vscode.window.createOutputChannel('MDN in Your Language');
const pending = new Map();
const supported = ['auto','es','en-US','fr','pt-BR','de','it','ja','ko','zh-CN','ru'];
const settings = () => vscode.workspace.getConfiguration('mdnMultilenguaje');
function locale() {
  const configured = settings().get('language','auto');
  if (configured !== 'auto') return configured;
  const ui = vscode.env.language || 'en-US';
  return supported.slice(1).find(x => x.toLowerCase() === ui.toLowerCase()) ||
    supported.slice(1).find(x => x.split('-')[0].toLowerCase() === ui.split('-')[0].toLowerCase()) || 'en-US';
}
const mdnRoot = 'https://developer.mozilla.org/';
function docUrl(lang, docPath) {return `${mdnRoot}${lang}/docs/${docPath}`;}
async function fetchDescription(url,max) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  try {
    const response=await fetch(url,{signal:controller.signal,headers:{'Accept':'text/html'}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const size=Number(response.headers.get('content-length')||0);
    if(size>2_000_000) throw new Error('Respuesta demasiado grande');
    const html=await response.text();
    if(html.length>2_000_000) throw new Error('Respuesta demasiado grande');
    const canonical = new URL(response.url);
    if (canonical.origin !== new URL(mdnRoot).origin) throw new Error('Respuesta fuera de MDN');
    const language = canonical.pathname.match(/^\/([^/]+)\/docs\//)?.[1];
    if (!language) throw new Error('Página de documentación no disponible');
    const fragment = new URL(url).hash.slice(1);
    if (fragment && !canonical.hash) canonical.hash = fragment;
    const subject = canonical.pathname.match(/\/Web\/(HTML|CSS|JavaScript|API|SVG)\//i)?.[1]?.toLowerCase();
    const languageId = subject === 'api' ? 'javascript' : subject;
    return {
      ...extractArticle(html, max, canonical.hash.slice(1), languageId),
      lang: language,
      url: canonical.href
    };
  } finally {clearTimeout(timer);}
}
let diskCache={};let cacheFile='';let saveQueue=Promise.resolve();
async function saveCache() {
  const snapshot=JSON.stringify(diskCache);
  saveQueue=saveQueue.catch(()=>{}).then(async()=>{
    await fs.mkdir(path.dirname(cacheFile),{recursive:true});
    const temp=cacheFile+'.tmp';await fs.writeFile(temp,snapshot,'utf8');
    await fs.rename(temp,cacheFile);
  }).catch(e=>output.appendLine(`Error al guardar caché: ${e.message}`));
  return saveQueue;
}
async function getInfo(docPath, lang) {
  const max=settings().get('maxCharacters',500);
  const key=JSON.stringify(['v3',lang,docPath,max]);
  const cached=diskCache[key];
  const now=Date.now();
  if(cached && cached.until>now) return cached.result;
  if(pending.has(key)) return pending.get(key);
  const promise=(async()=>{
    let result=null;
    for(const candidate of new Set([lang,'en-US'])) {
      const url=docUrl(candidate,docPath);
      try {
        const info = await fetchDescription(url, max);
        if (info.paragraphs.length || info.example) {
          result = info;
          output.appendLine(`OK ${info.lang}: ${info.url}`);
          break;
        }
        output.appendLine(`Sin descripción: ${url}`);
      } catch (e) {
        output.appendLine(`Fallo ${candidate}: ${url} — ${e.message}`);
      }
    }
    const days=settings().get('cacheDays',30);
    const ttl=result ? (days===0 ? 0 : days*86400000) : 3600000;
    if(ttl>0) {diskCache[key]={result,until:Date.now()+ttl};void saveCache();}
    return result;
  })().finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
const hoverSettings = ['html', 'css', 'scss', 'less'].flatMap(
  language => ['documentation', 'references'].map(part => `${language}.hover.${part}`)
);
const legacyHoverSettings = hoverSettings.filter(key => !/^(scss|less)\.hover\.references$/.test(key));

async function nativeHoverToggle(context) {
  const saved = context.globalState.get('previousNativeHoverSettings');
  const cfg = vscode.workspace.getConfiguration();
  if (saved) {
    for (const key of legacyHoverSettings) await cfg.update(key, saved[key], vscode.ConfigurationTarget.Global);
    await context.globalState.update('previousNativeHoverSettings', undefined);
    vscode.window.showInformationMessage('MDN: configuración nativa anterior restaurada.');
    return;
  }
  const value = !cfg.get('html.hover.documentation', false);
  for (const key of hoverSettings) await cfg.update(key, value, vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage(value ? 'MDN: documentación nativa activada.' : 'MDN: documentación nativa desactivada.');
}
async function activate(context) {
  cacheFile=path.join(context.globalStorageUri.fsPath,'mdn-cache.json');
  try {diskCache=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{diskCache={};}
  const provider=vscode.languages.registerHoverProvider(languages, {
    async provideHover(document,position,token){
      const lang = locale();
      let target, info;
      try {
        target = identify(document, position);
        if (!target || token.isCancellationRequested) return;
        info = await getInfo(target.docPath, lang);
      }catch(e){output.appendLine(`Error inesperado: ${e.stack||e}`);return;}
      if (token.isCancellationRequested) return;
      info ??= { paragraphs: [], lang, url: docUrl(lang, target.docPath) };
      const md=new vscode.MarkdownString();md.isTrusted=false;
      md.appendMarkdown(`**MDN in Your Language · ${target.name} (${info.lang})**  \n\n`);
      if(info.lang!==lang)md.appendMarkdown(`*Traducción no disponible en ${lang}; se muestra inglés.*  \n\n`);
      for (const paragraph of info.paragraphs) {
        md.appendText(paragraph);
        md.appendMarkdown('\n\n');
      }
      if (info.example) md.appendCodeblock(info.example.code, info.example.language);
      md.appendMarkdown(`\n\n[Abrir MDN (${info.lang})](${info.url})`);
      return new vscode.Hover(md,new vscode.Range(document.positionAt(target.start), document.positionAt(target.end)));
    }
  });
  context.subscriptions.push(provider,output, vscode.workspace.onDidCloseTextDocument(release),
    vscode.commands.registerCommand('mdnMultilenguaje.showLog',()=>output.show(true)),
    vscode.commands.registerCommand('mdnMultilenguaje.selectLanguage',async()=>{
      const choice=await vscode.window.showQuickPick(supported.map(x=>({label:x,description:x==='auto'?`Idioma de VS Code: ${vscode.env.language}`:''})),{placeHolder:'Idioma de MDN'});
      if(choice){await settings().update('language',choice.label,vscode.ConfigurationTarget.Global);vscode.window.showInformationMessage(`MDN: idioma efectivo ${locale()}`);}
    }),
    vscode.commands.registerCommand('mdnMultilenguaje.toggleNativeHover',()=>nativeHoverToggle(context)),
    vscode.commands.registerCommand('mdnMultilenguaje.clearCache',async()=>{diskCache={};pending.clear();await saveCache();vscode.window.showInformationMessage('MDN: caché borrada.');})
  );
}
function deactivate(){}
module.exports={activate,deactivate};
