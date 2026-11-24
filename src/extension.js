'use strict';
const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const output = vscode.window.createOutputChannel('MDN Multilenguaje');
const pending = new Map();
const supported = ['auto','es','en-US','fr','pt-BR','de','it','ja','ko','zh-CN','ru'];
const globals = new Set('accesskey autocapitalize autofocus class contenteditable dir draggable enterkeyhint hidden id inert inputmode is lang nonce part popover role slot spellcheck style tabindex title translate'.split(' '));
const attrElements = {
  src: new Set(['audio','embed','iframe','img','input','script','source','track','video']),
  href: new Set(['a','area','base','link']),
  alt: new Set(['area','img','input']),
  type: new Set(['button','input','link','script','source','style']),
  rel: new Set(['a','area','form','link']),
  value: new Set(['button','input','li','meter','option','progress']),
  for: new Set(['label','output']),
  controls: new Set(['audio','video']),
  poster: new Set(['video']),
  width: new Set(['canvas','embed','iframe','img','input','object','video']),
  height: new Set(['canvas','embed','iframe','img','input','object','video']),
  name: new Set(['button','form','iframe','input','meta','object','output','select','textarea']),
  placeholder: new Set(['input','textarea']),
  disabled: new Set(['button','fieldset','input','optgroup','option','select','textarea']),
  checked: new Set(['input']),
  selected: new Set(['option']),
  media: new Set(['link','source','style']),
  charset: new Set(['meta','script']),
  content: new Set(['meta']),
  action: new Set(['form']),
  method: new Set(['form']),
  target: new Set(['a','area','base','form']),
  loading: new Set(['iframe','img']),
  sizes: new Set(['img','link','source']),
  srcset: new Set(['img','source']),
  datetime: new Set(['del','ins','time'])
};
const local = {
  'html:title':'El elemento <title> define el título del documento que aparece en la pestaña del navegador.',
  'html:meta':'El elemento <meta> proporciona metadatos como la codificación, la descripción o la configuración de la ventana gráfica.',
  'html:link':'El elemento <link> relaciona el documento con recursos externos, como hojas de estilo.',
  'css:display':'La propiedad display establece cómo se representa un elemento y cómo se distribuyen sus hijos.',
  'css:color':'La propiedad color establece el color del texto.',
  'css:margin':'La propiedad margin controla el espacio exterior de un elemento.',
  'css:padding':'La propiedad padding controla el espacio entre el contenido y el borde.',
  'attribute:class':'El atributo class permite asignar clases a un elemento HTML.',
  'attribute:id':'El atributo id identifica de forma única un elemento del documento.'
};
const settings = () => vscode.workspace.getConfiguration('mdnMultilenguaje');
function locale() {
  const configured = settings().get('language','auto');
  if (configured !== 'auto') return configured;
  const ui = vscode.env.language || 'en-US';
  return supported.slice(1).find(x => x.toLowerCase() === ui.toLowerCase()) ||
    supported.slice(1).find(x => x.split('-')[0].toLowerCase() === ui.split('-')[0].toLowerCase()) || 'en-US';
}
const mdnRoot = 'https://developer.mozilla.org/';
function pathFor(kind,name,element) {
  const n = encodeURIComponent(name);
  if(kind==='html') return `Web/HTML/Reference/Elements/${n}`;
  if(kind==='css') return `Web/CSS/${n}`;
  if(kind==='js') return `Web/JavaScript/Reference/Global_Objects/${n}`;
  if(kind==='attribute') {
    if(globals.has(name)) return `Web/HTML/Reference/Global_attributes/${n}`;
    if(element && attrElements[name]?.has(element)) return `Web/HTML/Reference/Elements/${encodeURIComponent(element)}#${n}`;
    return null;
  }
  return null;
}
function docUrl(lang, docPath) {return `${mdnRoot}${lang}/docs/${docPath}`;}
function decode(s) {
  return s.replace(/&(?:amp|quot|apos|lt|gt|nbsp|#(\d+)|#x([\da-f]+));/gi,(match,dec,hex)=>{
    if(dec || hex) {try{return String.fromCodePoint(dec?Number(dec):parseInt(hex,16));}catch{return match;}}
    return {'&amp;':'&','&quot;':'"','&apos;':"'",'&lt;':'<','&gt;':'>','&nbsp;':' '}[match.toLowerCase()]||match;
  });
}
function description(html,max) {
  const metaTags = html.match(/<meta\b[^>]*>/gi)||[];
  for(const tag of metaTags) {
    if(!/\bname\s*=\s*["']description["']/i.test(tag) && !/\bproperty\s*=\s*["']og:description["']/i.test(tag)) continue;
    const content=tag.match(/\bcontent\s*=\s*(?:"([^"]*)"|'([^']*)')/i);
    if(content) {
      const txt=decode(content[1]??content[2]??'').replace(/\s+/g,' ').trim();
      if(txt) return txt.length>max?txt.slice(0,max).replace(/\s+\S*$/,'')+'…':txt;
    }
  }
  return '';
}
async function fetchDescription(url,max) {
  const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),6500);
  try {
    const response=await fetch(url,{signal:controller.signal,headers:{'Accept':'text/html','User-Agent':'MDN-Multilenguaje-VSCode/0.1.7'}});
    if(!response.ok) throw new Error(`HTTP ${response.status}`);
    const size=Number(response.headers.get('content-length')||0);
    if(size>2_000_000) throw new Error('Respuesta demasiado grande');
    const html=await response.text();
    if(html.length>2_000_000) throw new Error('Respuesta demasiado grande');
    return description(html,max);
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
async function getInfo(kind,name,element,lang) {
  const docPath=pathFor(kind,name,element);
  if(!docPath) return null;
  const max=settings().get('maxCharacters',500);
  const key=JSON.stringify([lang,docPath,max]);
  const cached=diskCache[key];
  const now=Date.now();
  if(cached && cached.until>now) return cached.result;
  if(pending.has(key)) return pending.get(key);
  const promise=(async()=>{
    let result=null;
    for(const candidate of new Set([lang,'en-US'])) {
      const url=docUrl(candidate,docPath);
      try {
        const summary=await fetchDescription(url,max);
        if(summary) {result={summary,lang:candidate,url};output.appendLine(`OK ${candidate}: ${url}`);break;}
        output.appendLine(`Sin descripción: ${url}`);
      } catch(e) {output.appendLine(`Fallo ${candidate}: ${url} — ${e.message}`);}
    }
    if(!result && lang.startsWith('es') && local[`${kind}:${name.toLowerCase()}`]) {
      result={summary:local[`${kind}:${name.toLowerCase()}`],lang:'es',url:docUrl('es',docPath),local:true};
    }
    const days=settings().get('cacheDays',30);
    const ttl=result ? (days===0 ? 0 : days*86400000) : 3600000;
    if(ttl>0) {diskCache[key]={result,until:Date.now()+ttl};void saveCache();}
    return result;
  })().finally(()=>pending.delete(key));
  pending.set(key,promise);return promise;
}
function identify(document,position) {
  const lang=document.languageId,line=document.lineAt(position.line).text,offset=position.character;
  if(['css','scss','less'].includes(lang)) {
    for(const m of line.matchAll(/([a-zA-Z-][\w-]*)\s*:/g)) {
      const start=m.index,end=start+m[1].length;
      if(offset>=start&&offset<=end && !m[1].startsWith('--')) return {kind:'css',name:m[1],start,end};
    }
    return null;
  }
  if(['html','javascriptreact','typescriptreact'].includes(lang)) {
    // Only inspect the active tag fragment, not unrelated tags elsewhere on the line.
    const before=line.slice(0,offset),opening=before.lastIndexOf('<');
    if(opening<0 || before.lastIndexOf('>')>opening) return null;
    const tail=line.slice(opening),close=tail.indexOf('>');
    const fragment=close<0?tail:tail.slice(0,close+1);
    const tag=fragment.match(/^<\/?([a-zA-Z][\w-]*)/);
    if(!tag) return null;
    const element=tag[1].toLowerCase(),tagStart=opening+tag[0].lastIndexOf(tag[1]);
    if(offset>=tagStart&&offset<=tagStart+tag[1].length) return {kind:'html',name:element,start:tagStart,end:tagStart+tag[1].length};
    // Ignore attributes inside quoted values.
    const attrPattern=/\s([a-zA-Z_:][\w:.-]*)(?=\s*=|\s|\/?\s*>|$)/g;
    for(const m of fragment.matchAll(attrPattern)) {
      const start=opening+m.index+m[0].lastIndexOf(m[1]),end=start+m[1].length;
      if(offset<start||offset>end) continue;
      const prefix=line.slice(opening,start),quotes=prefix.match(/['"]/g)||[];
      if(quotes.length%2) return null;
      return {kind:'attribute',name:m[1].toLowerCase(),element,start,end};
    }
    return null;
  }
  if(lang==='javascript') {
    const range=document.getWordRangeAtPosition(position,/[A-Za-z_$][\w$]*/);
    if(range){const name=document.getText(range);if(/^[A-Z][\w]*$/.test(name))return {kind:'js',name,start:range.start.character,end:range.end.character};}
  }
  return null;
}
const hoverSettings=['html.hover.documentation','html.hover.references','css.hover.documentation','css.hover.references','scss.hover.documentation','less.hover.documentation'];
async function nativeHoverToggle(context) {
  const saved=context.globalState.get('previousNativeHoverSettings');
  if(saved) {
    const answer=await vscode.window.showWarningMessage('¿Restaurar la configuración de documentación nativa guardada anteriormente?',{modal:true},'Restaurar');
    if(answer!=='Restaurar')return;
    for(const [key,previous] of Object.entries(saved)) await vscode.workspace.getConfiguration().update(key,previous,vscode.ConfigurationTarget.Global);
    await context.globalState.update('previousNativeHoverSettings',undefined);
    vscode.window.showInformationMessage('MDN: configuración nativa restaurada.');
    return;
  }
  const answer=await vscode.window.showWarningMessage('¿Desactivar las descripciones nativas de HTML/CSS en la configuración de usuario? No se desactivarán las ventanas de MDN. Puedes restaurarlas con este mismo comando.',{modal:true},'Desactivar');
  if(answer!=='Desactivar')return;
  const previous={};const cfg=vscode.workspace.getConfiguration();
  for(const key of hoverSettings) previous[key]=cfg.inspect(key)?.globalValue;
  await context.globalState.update('previousNativeHoverSettings',previous);
  for(const key of hoverSettings) await cfg.update(key,false,vscode.ConfigurationTarget.Global);
  // In current VS Code versions this setting uses the string enum 'on'.
  const editorHover=cfg.inspect('editor.hover.enabled');
  if(editorHover?.globalValue==='off') await cfg.update('editor.hover.enabled','on',vscode.ConfigurationTarget.Global);
  vscode.window.showInformationMessage('MDN: documentación nativa desactivada. El hover general sigue activo.');
}
async function activate(context) {
  cacheFile=path.join(context.globalStorageUri.fsPath,'mdn-cache.json');
  try {diskCache=JSON.parse(await fs.readFile(cacheFile,'utf8'));}catch{diskCache={};}
  const provider=vscode.languages.registerHoverProvider(['html','css','scss','less','javascript','javascriptreact','typescriptreact'],{
    async provideHover(document,position,token){
      const target=identify(document,position);if(!target)return;
      const lang=locale();let info;
      try {info=await getInfo(target.kind,target.name,target.element,lang);}catch(e){output.appendLine(`Error inesperado: ${e.stack||e}`);return;}
      if(!info||token.isCancellationRequested)return;
      const md=new vscode.MarkdownString();md.isTrusted=false;
      md.appendMarkdown(`**MDN Multilenguaje · ${target.name} (${info.lang})**  \n\n`);
      if(info.local)md.appendMarkdown('*Resumen local de emergencia; no es una cita de MDN.*  \n\n');
      else if(info.lang!==lang)md.appendMarkdown(`*Traducción no disponible en ${lang}; se muestra inglés.*  \n\n`);
      md.appendText(info.summary);md.appendMarkdown(`\n\n[Abrir MDN (${info.lang})](${info.url})`);
      return new vscode.Hover(md,new vscode.Range(position.line,target.start,position.line,target.end));
    }
  });
  context.subscriptions.push(provider,output,
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
