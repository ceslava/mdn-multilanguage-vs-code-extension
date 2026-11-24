'use strict';

const { getLanguageService, TextDocument } = require('vscode-html-languageservice');
const service = getLanguageService();
const entities = {
  amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ',
  ndash: '\u2013', mdash: '\u2014', hellip: '\u2026', rsquo: '\u2019', lsquo: '\u2018'
};

function decode(text) {
  return text.replace(/&(#\d+|#x[\da-f]+|[a-z]+);/gi, (match, name) => {
    const entity = name.toLowerCase();
    if (!entity.startsWith('#')) return Object.hasOwn(entities, entity) ? entities[entity] : match;
    const value = entity.startsWith('#x') ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
    return value > 0 && value <= 0x10ffff && (value < 0xd800 || value > 0xdfff)
      ? String.fromCodePoint(value) : '\ufffd';
  });
}

function attr(node, name) {
  return node.attributes?.[name]?.replace(/^(['"])([\s\S]*)\1$/, '$2') ?? '';
}

function hasClass(node, name) {
  return attr(node, 'class').split(/\s+/).includes(name);
}

function* descendants(nodes) {
  for (const node of nodes) {
    yield node;
    yield* descendants(node.children);
  }
}

function innerText(source, node) {
  const html = source.slice(node.startTagEnd, node.endTagStart ?? node.end);
  return decode(html.replace(/<!--[\s\S]*?-->|<[^>]*>/g, ''));
}

function fitParagraphs(paragraphs, max) {
  const selected = [];
  let remaining = max;
  for (const text of paragraphs) {
    if (remaining < 60 && selected.length) break;
    if (text.length > remaining) {
      const cut = text.slice(0, remaining - 1);
      const sentence = [...cut.matchAll(/[.!????](?=\s|$)/gu)].at(-1);
      const end = sentence && sentence.index >= remaining * 0.55 ? sentence.index + 1 : 0;
      selected.push(end ? cut.slice(0, end) : (cut.replace(/\s+\S*$/, '') || cut) + '\u2026');
      break;
    }
    selected.push(text);
    remaining -= text.length + 2;
  }
  return selected;
}

function regionForAnchor(nodes, fragment) {
  const anchor = nodes.find(node => decode(attr(node, 'id')) === fragment);
  const term = anchor?.tag === 'dt' ? anchor : anchor?.parent?.tag === 'dt' ? anchor.parent : undefined;
  if (term) {
    const siblings = term.parent.children;
    return siblings[siblings.indexOf(term) + 1]?.tag === 'dd' ? siblings[siblings.indexOf(term) + 1] : undefined;
  }
  return anchor?.parent?.tag === 'section' ? anchor.parent : undefined;
}

function metaDescription(nodes) {
  const meta = nodes.find(node => node.tag === 'meta' &&
    (attr(node, 'name') === 'description' || attr(node, 'property') === 'og:description'));
  return meta ? decode(attr(meta, 'content')) : '';
}

function headingId(section) {
  const heading = section.children.find(node => /^h[2-6]$/.test(node.tag));
  return heading ? decode(attr(heading, 'id')).normalize('NFD').replace(/\p{Diacritic}/gu, '') : '';
}

function textBlocks(source, region, includeListItems) {
  return [...descendants(region?.children ?? [])]
    .filter(node => node.tag === 'p' || node.tag === 'dt' || (includeListItems && node.tag === 'li'))
    .map(node => innerText(source, node).replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

function extractArticle(source, max, fragment = '', preferredLanguage) {
  const document = TextDocument.create('file:///mdn.html', 'html', 0, source);
  const nodes = [...descendants(service.parseHTMLDocument(document).roots)];
  const main = nodes.find(node => node.tag === 'main' && attr(node, 'id') === 'content') ??
    nodes.find(node => node.tag === 'article' || node.tag === 'main');
  const body = main ? [...descendants(main.children)] : [];
  const sections = body.filter(node => node.tag === 'section' && hasClass(node, 'content-section'));
  const targeted = fragment ? regionForAnchor(body, decodeURIComponent(fragment)) : undefined;
  const introduction = sections.find(section => {
    const id = headingId(section);
    return /^(definicion|description|descripcion)$/i.test(id) ||
      (!id && section.children.some(node => node.tag === 'p'));
  }) ?? sections[0] ?? main;
  const paragraphs = textBlocks(source, targeted ?? introduction, Boolean(targeted));
  const substantial = paragraphs.filter(text => text.length >= 55);
  const candidates = substantial.length ? substantial : paragraphs;
  if (!fragment && candidates.length) {
    const notes = sections.find(section => /^(usage_notes|notas_de_uso|estilo_predeterminado|botones_con_iconos)$/.test(headingId(section)));
    const note = notes && textBlocks(source, notes, false).find(text => text.length >= 55);
    if (note && !candidates.includes(note)) candidates.splice(1, 0, note);
  }
  const summary = fitParagraphs(candidates.slice(0, 3), max);
  if (!summary.length) {
    const fallback = metaDescription(nodes).replace(/\s+/g, ' ').trim();
    if (fallback) summary.push(...fitParagraphs([fallback], max));
  }

  // Show a complete short example from the same article or the matching section.
  const exampleNodes = fragment ? [...descendants(targeted?.children ?? [])] : body;
  const examples = exampleNodes.filter(node => node.tag === 'pre' &&
    (hasClass(node, 'notranslate') || node.children.some(child => child.tag === 'code')));
  let example;
  for (const pre of examples) {
    const code = innerText(source, pre).trim();
    const brush = attr(pre, 'class').match(/brush:\s*(html|css|js|javascript|typescript|svg)\b/)?.[1];
    const language = brush === 'js' ? 'javascript' : brush;
    if (language && code && code.length <= 360 && code.split(/\r?\n/).length <= 8 && !code.includes('```')) {
      if (language === preferredLanguage) return { paragraphs: summary, example: { code, language } };
      example ??= { code, language };
    }
  }
  return { paragraphs: summary, example };
}

module.exports = { extractArticle };
