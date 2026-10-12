import assert from 'node:assert/strict';
import test from 'node:test';
import { markdownToText, parseInline, parseMarkdown, safeUrl, type Block, type Inline } from '../src/features/community/markdown.ts';

const flat = (inlines: Inline[]): string => inlines.map((node) => (node.t === 'text' || node.t === 'code' ? node.v : node.t === 'image' ? `[img:${node.src}]` : node.t === 'link' ? `[${flat(node.c)}](${node.href})` : `<${node.t}>${flat(node.c)}</${node.t}>`)).join('');

test('safeUrl: https, mailto, tel and same-site paths pass; scripts, data, protocol-relative and spaces do not', () => {
  for (const ok of ['https://example.com/a?b=1', '/learn/cat6a', '#section', 'http://example.com', 'mailto:a@b.com', 'tel:+17075550100']) assert.equal(safeUrl(ok), ok, ok);
  for (const bad of ['javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html;base64,AAAA', 'vbscript:x', '//evil.com/x', 'https://a b.com', '', 'ftp://x', 'java\nscript:x', ' javascript:alert(1)']) assert.equal(safeUrl(bad), '', bad);
  assert.equal(safeUrl('http://example.com/x.png', { image: true }), '');   // images must be https
  assert.equal(safeUrl('https://example.com/x.png', { image: true }), 'https://example.com/x.png');
});

test('parseInline: bold, italic, code, links, images and escapes', () => {
  assert.equal(flat(parseInline('a **bold** and *italic* and `code`')), 'a <strong>bold</strong> and <em>italic</em> and code');
  assert.equal(flat(parseInline('see [the guide](https://example.com/g) now')), 'see [the guide](https://example.com/g) now');
  assert.equal(flat(parseInline('![rack](https://example.com/r.jpg)')), '[img:https://example.com/r.jpg]');
  assert.equal(flat(parseInline('literal \\*stars\\* here')), 'literal *stars* here');
  assert.equal(flat(parseInline('snake_case_name stays')), 'snake_case_name stays');
  assert.equal(flat(parseInline('go to https://example.com/page, ok')), 'go to [https://example.com/page](https://example.com/page), ok');
});

test('parseInline: a dangerous link keeps its text but loses its address, dangerous images disappear', () => {
  const dangerous = parseInline('[click me](javascript:alert(1))');
  assert.equal(dangerous.some((node) => node.t === 'link' || node.t === 'image'), false);   // no link survives
  assert.match(flat(dangerous), /^click me/);
  assert.equal(parseInline('![x](javascript:alert(1)) after').some((node) => node.t === 'image'), false);
  assert.equal(flat(parseInline('![x](http://insecure.example/x.png)')), '');
  assert.equal(flat(parseInline('<script>alert(1)</script>')), '<script>alert(1)</script>'); // stays plain text; rendering escapes it
  assert.equal(flat(parseInline('<img src=x onerror=alert(1)>')), '<img src=x onerror=alert(1)>');
});

test('parseMarkdown: headings, paragraphs with line breaks, rules and quotes', () => {
  const blocks = parseMarkdown('# Title\n\nFirst line\nsecond line\n\n---\n\n> quoted **text**\n> more');
  assert.deepEqual(blocks.map((block) => block.t), ['h', 'p', 'hr', 'quote']);
  assert.equal(((blocks[1] as Extract<Block, { t: 'p' }>).c[0] as { v: string }).v, 'First line\nsecond line');
  assert.equal((blocks[0] as Extract<Block, { t: 'h' }>).level, 1);
});

test('parseMarkdown: bullet, numbered and checkbox lists', () => {
  const [bullets, numbers, checks] = parseMarkdown('- one\n- two\n\n1. first\n2) second\n\n- [ ] torque cap\n- [x] label both ends') as [Extract<Block, { t: 'ul' }>, Extract<Block, { t: 'ol' }>, Extract<Block, { t: 'ul' }>];
  assert.equal(bullets.items.length, 2);
  assert.equal(numbers.items.length, 2);
  assert.deepEqual(checks.items.map((item) => item.checked), [false, true]);
});

test('parseMarkdown: fenced code is kept literally, and markdown inside it is not interpreted', () => {
  const [code] = parseMarkdown('```bash\nping -c 4 10.0.0.1  # **not bold**\n```') as [Extract<Block, { t: 'code' }>];
  assert.equal(code.lang, 'bash');
  assert.equal(code.v, 'ping -c 4 10.0.0.1  # **not bold**');
  assert.equal(parseMarkdown('```\nunterminated').length, 1);
});

test('parseMarkdown: tables', () => {
  const [table] = parseMarkdown('| Cable | Max run |\n| --- | --- |\n| Cat6 | 90 m |\n| Cat6A | 90 m |') as [Extract<Block, { t: 'table' }>];
  assert.equal(table.t, 'table');
  assert.equal(table.head.length, 2);
  assert.equal(table.rows.length, 2);
  assert.equal(flat(table.rows[1][0]), 'Cat6A');
});

test('parseMarkdown: hostile or odd input never throws and never produces a script-capable node', () => {
  const hostile = [
    '<script>alert(1)</script>', '[a](javascript:alert(1))', '![a](javascript:alert(1))', '[a](data:text/html,<script>alert(1)</script>)',
    '**'.repeat(5000), '['.repeat(2000), '`'.repeat(3001), '> '.repeat(300) + 'x', '|'.repeat(500), '#'.repeat(50), '\u0000\u0001', '*'.repeat(10001),
  ];
  for (const input of hostile) {
    const blocks = parseMarkdown(input);
    const json = JSON.stringify(blocks);
    assert.doesNotMatch(json, /"href":"javascript/i);
    assert.doesNotMatch(json, /"src":"javascript/i);
    assert.doesNotMatch(json, /"(href|src)":"data:/i);
  }
  assert.deepEqual(parseMarkdown(''), []);
  assert.deepEqual(parseMarkdown(null as never), []);
});

test('markdownToText: plain excerpt without markup, capped', () => {
  assert.equal(markdownToText('# Fiber basics\n\nClean **every** connector. See [guide](https://example.com).'), 'Fiber basics Clean every connector. See guide.');
  assert.equal(markdownToText('a '.repeat(500), 20).length, 20);
});
