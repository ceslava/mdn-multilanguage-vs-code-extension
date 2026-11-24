'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { extractArticle } = require('../src/mdn-article');

test('uses the article definition and prefers a complete HTML example', () => {
  const source = `<meta name="description" content="Short metadata.">
    <main id="content"><aside><p>Unrelated sidebar copy.</p></aside>
    <section class="content-section"><h2 id="definici&#243;n">Definition</h2>
      <p>Short label.</p>
      <dl><dt>The &lt;button&gt; element starts an action when the user activates it.</dt>
      <dd><p>A second paragraph from the reference article adds more context to the control.</p></dd></dl>
    </section>
    <section class="content-section">
      <pre class="brush: css"><code>button { color: red; }</code></pre>
      <pre class="brush: html"><code>&lt;button type="button"&gt;Open&lt;/button&gt;</code></pre>
    </section></main>`;
  const article = extractArticle(source, 500, '', 'html');
  assert.equal(article.paragraphs.length, 2);
  assert.match(article.paragraphs[0], /The <button>/);
  assert.equal(article.example.code, '<button type="button">Open</button>');
});

test('keeps a linked attribute scoped to its own definition', () => {
  const source = `<main id="content">
      <section class="content-section"><p>Parent introduction.</p></section>
      <section class="content-section"><h2 id="attributes">Attributes</h2>
        <dl><dt id="type">type</dt><dd>
          <p>The type determines the action that takes place when the button is pressed.</p>
          <ul><li>Use submit to send the form associated with the button.</li></ul>
        </dd></dl>
        <pre class="brush: html"><code>Different example.</code></pre>
      </section></main>`;
  const article = extractArticle(source, 500, 'type', 'html');
  assert.match(article.paragraphs[0], /^The type/);
  assert.match(article.paragraphs.join(' '), /send the form/);
  assert.equal(article.example, undefined);
});

test('falls back to metadata and respects the character limit', () => {
  const source = '<meta property="og:description" content="Start here. This is a longer overview of the API and when to use it.">';
  const article = extractArticle(source, 25);
  assert.ok(article.paragraphs[0].startsWith('Start here.'));
  assert.ok(article.paragraphs[0].length <= 25);
});
