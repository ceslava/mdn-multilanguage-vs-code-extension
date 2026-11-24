'use strict';

const data = require('@mdn/browser-compat-data');
const html = require('vscode-html-languageservice');
const css = require('vscode-css-languageservice');
const ts = require('typescript');

const languages = ['html', 'css', 'scss', 'less', 'javascript', 'javascriptreact', 'typescript', 'typescriptreact'];
const styles = {
  css: css.getCSSLanguageService(),
  scss: css.getSCSSLanguageService(),
  less: css.getLESSLanguageService()
};
const types = html.TokenType;
const cssProperties = Object.assign(Object.create(null), data.css.properties);
for (const rule of Object.values(data.css['at-rules'])) {
  for (const [name, entry] of Object.entries(rule)) {
    if (name !== '__compat' && entry.__compat) cssProperties[name] ??= entry;
  }
}
const documentedGlobals = [data.javascript.builtins, data.api];
const javascriptSyntax = Object.assign(Object.create(null), data.javascript.statements, data.javascript.operators);
const entries = new WeakMap();
const registry = ts.createDocumentRegistry();
let nextScript = 0;
const svgElements = new Map(Object.entries(data.svg.elements).map(([name, entry]) => [name.toLowerCase(), entry]));

function mdnPath(entry) {
  const url = entry?.__compat?.mdn_url;
  return url?.match(/^https:\/\/developer\.mozilla\.org\/(?:en-US\/)?docs\/(.+)$/)?.[1];
}

function target(name, start, end, entry, fallback) {
  const docPath = mdnPath(entry) || fallback;
  return docPath ? { name, start, end, docPath } : null;
}

function htmlElement(name, start, end) {
  const key = name.toLowerCase();
  const entry = data.html.elements[key] ?? svgElements.get(key) ?? data.mathml.elements[key];
  return target(name, start, end, entry);
}

function htmlAttribute(element, name, start, end) {
  const owner = data.html.elements[element] ?? svgElements.get(element) ?? data.mathml.elements[element];
  const globals = data.html.global_attributes;
  const entry = owner?.[name] ?? globals[name] ?? data.svg.global_attributes[name] ??
    data.mathml.global_attributes?.[name] ?? data.svg.attributes?.[name];
  if (entry?.__compat) {
    const ownerPath = mdnPath(owner);
    return target(name, start, end, entry, ownerPath && ownerPath + '#' + encodeURIComponent(name));
  }
  if (name.startsWith('data-')) return target(name, start, end, globals.data_attributes);
  if (name.startsWith('aria-') || name === 'role') {
    const aria = mdnPath(data.html.global_attributes.role) ||
      'Web/Accessibility/ARIA/Reference/Attributes';
    return target(name, start, end, undefined, aria);
  }
  if (name.startsWith('on')) {
    const event = name.slice(2) + '_event';
    return target(name, start, end, data.api.HTMLElement?.[event] ??
      data.api.Element?.[event] ?? data.api.Window?.[event]);
  }
  return null;
}

function styleLookup(source, language, uri, version) {
  const service = styles[language];
  const document = css.TextDocument.create(uri, language, version, source);
  const stylesheet = service.parseStylesheet(document);
  const properties = [];
  stylesheet.accept(node => {
    const property = node.getProperty?.();
    const name = property?.getText();
    if (name && Object.hasOwn(cssProperties, name.toLowerCase())) {
      const key = name.toLowerCase();
      const documentation = mdnPath(cssProperties[key]) ? cssProperties[key] : cssProperties[key.replace(/^-(webkit|moz|ms|o)-/, '')];
      const entry = target(name, property.offset, property.end, documentation);
      if (entry) properties.push(entry);
    } else if (name?.startsWith('--')) {
      properties.push(target(name, property.offset, property.end, undefined, 'Web/CSS/Reference/Properties/--*'));
    }
    return true;
  });
  return offset => properties.find(property => property.start <= offset && offset < property.end);
}

function member(owner, name) {
  if (owner === 'Console') owner = 'console';
  for (const namespace of documentedGlobals) {
    const api = namespace[owner];
    const entry = api?.[name] ?? api?.[name + '_static'];
    if (mdnPath(entry)) return entry;
  }
}

function receiverMember(checker, receiver, name) {
  const types = [checker.getTypeAtLocation(receiver)];
  const visited = new Set();
  while (types.length) {
    const type = types.pop();
    if (visited.has(type)) continue;
    visited.add(type);
    const owner = type.getSymbol()?.name;
    const entry = owner && member(owner, name);
    if (entry) return entry;
    types.push(...(type.getBaseTypes() ?? []), ...(type.isUnionOrIntersection() ? type.types : []));
  }
}

function javascriptLookup(source, language) {
  const extension = { javascript: 'js', javascriptreact: 'jsx', typescript: 'ts', typescriptreact: 'tsx' }[language];
  const filename = '/mdn-hover-' + ++nextScript + '.' + extension;
  let revision = 0;
  let snapshot = ts.ScriptSnapshot.fromString(source);
  const host = {
    ...ts.sys,
    getCompilationSettings: () => ({
      allowJs: true, checkJs: true, noResolve: true, types: [], target: ts.ScriptTarget.ESNext,
      jsx: ts.JsxEmit.Preserve, moduleDetection: ts.ModuleDetectionKind.Force
    }),
    getScriptFileNames: () => [filename],
    getScriptVersion: file => file === filename ? String(revision) : '0',
    getProjectVersion: () => String(revision),
    getScriptSnapshot: file => {
      if (file === filename) return snapshot;
      const content = ts.sys.readFile(file);
      return content === undefined ? undefined : ts.ScriptSnapshot.fromString(content);
    },
    getCurrentDirectory: () => '/',
    getDefaultLibFileName: ts.getDefaultLibFilePath
  };
  const service = ts.createLanguageService(host, registry);

  return {
    update(text) {
      snapshot = ts.ScriptSnapshot.fromString(text);
      revision++;
    },
    dispose: () => service.dispose(),
    lookup(offset) {
      const program = service.getProgram();
      const script = program.getSourceFile(filename);
      const checker = program.getTypeChecker();
      const node = ts.getTokenAtPosition(script, offset);
      const start = node.getStart(script);
      if (offset < start || offset >= node.end) return null;
      const raw = node.getText(script);
      const parent = node.parent;
      if (ts.isJsxOpeningElement(parent) || ts.isJsxClosingElement(parent) || ts.isJsxSelfClosingElement(parent)) {
        return /^[a-z]/.test(raw) ? htmlElement(raw, start, node.end) : null;
      }
      if (ts.isJsxAttribute(parent) && parent.name === node) {
        const aliases = { className: 'class', htmlFor: 'for', tabIndex: 'tabindex', readOnly: 'readonly' };
        const tag = parent.parent.parent.tagName.getText(script);
        const name = aliases[raw] ?? raw.toLowerCase();
        const match = /^[a-z]/.test(tag) && htmlAttribute(tag, name, start, node.end);
        return match ? { ...match, name: raw } : null;
      }
      const isMember = ts.isPropertyAccessExpression(parent) && parent.name === node;
      if (ts.isIdentifier(node) || isMember) {
        const declarations = checker.getSymbolAtLocation(node)?.declarations ?? [];
        let fromLibrary = false;
        for (const declaration of declarations) {
          if (!program.isSourceFileDefaultLibrary(declaration.getSourceFile())) continue;
          fromLibrary = true;
          const owner = declaration.parent.name?.getText();
          const entry = owner && member(owner.replace(/Constructor$/, '').replace(/^Readonly(Array)$/, '$1'), raw);
          if (entry) return target(raw, start, node.end, entry);
        }
        if (isMember) {
          if (!fromLibrary) return null;
          return target(raw, start, node.end, receiverMember(checker, parent.expression, raw));
        }
        if (declarations.length && !fromLibrary) return null;
        const entry = documentedGlobals.map(group => group[raw]).find(mdnPath);
        return target(raw, start, node.end, entry);
      }
      const syntaxName = { '=>': 'arrow_functions', '?.': 'optional_chaining', '??': 'nullish_coalescing', '===': 'strict_equality', '**': 'exponentiation' }[raw] ?? raw;
      return target(raw, start, node.end, javascriptSyntax[syntaxName] ?? data.javascript.functions[syntaxName]);
    }
  };
}

function htmlLookup(source, uri, version) {
  const scanner = html.getLanguageService().createScanner(source);
  const tokens = [];
  let element = '';
  let styleValue = false;
  for (let type = scanner.scan(); type !== types.EOS; type = scanner.scan()) {
    const raw = scanner.getTokenText();
    const start = scanner.getTokenOffset();
    const end = scanner.getTokenEnd();
    let resolve;
    if (type === types.StartTag || type === types.EndTag) {
      element = raw.toLowerCase();
      resolve = () => htmlElement(raw, start, end);
    } else if (type === types.AttributeName) {
      const name = raw.toLowerCase();
      const owner = element;
      styleValue = name === 'style';
      resolve = () => htmlAttribute(owner, name, start, end);
    } else if (type === types.Styles || (type === types.AttributeValue && styleValue)) {
      const quoted = type === types.AttributeValue && /^['"]/.test(raw);
      const prefix = type === types.AttributeValue ? 'a{' : '';
      const content = quoted ? raw.slice(1, -1) : raw;
      const adjustment = start + Number(quoted) - prefix.length;
      const lookup = styleLookup(prefix + content + (prefix ? '}' : ''), 'css', uri, version);
      resolve = offset => {
        const result = lookup(offset - adjustment);
        return result && { ...result, start: result.start + adjustment, end: result.end + adjustment };
      };
    } else if (type === types.Script) {
      let script;
      resolve = offset => {
        script ??= javascriptLookup(raw, 'javascript');
        const result = script.lookup(offset - start);
        return result && { ...result, start: result.start + start, end: result.end + start };
      };
      tokens.push({ start, end, resolve, dispose: () => script?.dispose() });
      continue;
    }
    if (resolve) tokens.push({ start, end, resolve });
  }
  return {
    dispose: () => tokens.forEach(token => token.dispose?.()),
    lookup: offset => tokens.find(token => token.start <= offset && offset < token.end)?.resolve(offset)
  };
}

function release(document) {
  entries.get(document)?.dispose?.();
  entries.delete(document);
}

function identify(document, position) {
  let entry = entries.get(document);
  const language = document.languageId;
  if (entry?.language !== language || entry.version !== document.version) {
    const source = document.getText();
    const uri = document.uri.toString();
    if (entry?.language === language && entry.update) {
      entry.update(source);
    } else {
      release(document);
      if (language === 'html') entry = htmlLookup(source, uri, document.version);
      else if (styles[language]) entry = { lookup: styleLookup(source, language, uri, document.version) };
      else entry = javascriptLookup(source, language);
    }
    entry.language = language;
    entry.version = document.version;
    entries.set(document, entry);
  }
  return entry.lookup(document.offsetAt(position));
}

module.exports = { identify, languages, release };
