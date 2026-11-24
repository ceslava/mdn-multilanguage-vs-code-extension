'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { identify, release } = require('../src/symbols');

const cases = [
  ['html', '<details\n open>', 'open', '/details#open'],
  ['html', '<input required>', 'required', '/input#required'],
  ['html', '<div data-name="x">', 'data-name', '/Global_attributes/data-*'],
  ['html', '<div style="color: red">', 'color', '/Properties/color'],
  ['html', '<style>p { container-type: inline-size }</style>', 'container-type', '/Properties/container-type'],
  ['html', '<script>document.querySelector("main")</script>', 'querySelector', '/Document/querySelector'],
  ['html', '<svg><linearGradient /></svg>', 'linearGradient', '/Element/linearGradient'],
  ['html', '<div title="style > input">', 'input', null],
  ['css', 'a { grid-template-columns\n: 1fr; }', 'grid-template-columns', '/Properties/grid-template-columns'],
  ['css', 'a { --spacing: 1rem; }', '--spacing', '/Properties/--*'],
  ['css', '/* color:red */ a { display: grid; }', 'color', null],
  ['scss', '$value: 1px; a { margin: $value; }', 'margin', '/Properties/margin'],
  ['less', '@value: 1px; a { padding: @value; }', 'padding', '/Properties/padding'],
  ['javascript', 'const items = [1, 2]; items.map(x => x);', 'map', '/Array/map'],
  ['javascript', 'const items = Array.from([]);', 'from', '/Array/from'],
  ['javascript', 'const el = document.querySelector("main"); el.classList;', 'classList', '/Element/classList'],
  ['javascript', 'console.log(JSON.stringify({}));', 'log', '/console/log_static'],
  ['javascript', 'fetch("/data");', 'fetch', '/Window/fetch'],
  ['javascript', 'const fetch = () => null; fetch();', 'fetch', null],
  ['javascript', '// fetch()', 'fetch', null],
  ['javascriptreact', 'const ui = <label htmlFor="x">Hello</label>;', 'htmlFor', '/Attributes/for'],
  ['typescript', 'const text: string = "a"; text.toUpperCase();', 'toUpperCase', '/String/toUpperCase']
];

for (const [languageId, source, word, expected] of cases) {
  test(languageId + ' hover: ' + source.replace(/\s+/g, ' '), () => {
    const document = {
      languageId,
      version: 1,
      getText: () => source,
      uri: 'file:///test',
      offsetAt: offset => offset
    };
    try {
      const start = source.lastIndexOf(word);
      const result = identify(document, start);
      if (expected === null) {
        assert.ok(result == null);
      } else {
        assert.ok(result?.docPath.endsWith(expected), JSON.stringify(result));
        assert.equal(source.slice(result.start, result.end), word);
      }
    } finally {
      release(document);
    }
  });
}
