/**
 * 1132：`#` 单行注释（Kibana Console 的第二种注释语法）。
 *
 * Kibana 官方语法表把 `//` 与 `#` 并列为单行注释，块注释是 `/* *\/`。
 * 我们的 `stripJsonComments` 此前只认 `//`，用户照 Kibana 写 `# 说明` 会被原样发给 ES，
 * 拿到语法错误。这里锁住新增的 `#` 支持，同时确认没有破坏原有语义。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { stripJsonComments, findCommentRanges } from '../utils/jsonc';

describe('1132 JSONC 支持 # 单行注释', () => {
  it('# 行首注释被剥离', () => {
    expect(stripJsonComments('# 说明\n{"a":1}')).toBe('\n{"a":1}');
  });

  it('# 行尾注释被剥离', () => {
    expect(stripJsonComments('{"a":1} # 尾注')).toBe('{"a":1} ');
  });

  it('字符串里的 # 不被误删', () => {
    expect(stripJsonComments('{"u":"a#b"}')).toBe('{"u":"a#b"}');
  });

  it('// 与 # 可混用', () => {
    const out = JSON.parse(stripJsonComments('// 头\n# 二行\n{"a":1} # 尾'));
    expect(out).toEqual({ a: 1 });
  });

  it('块注释与 # 混用', () => {
    const out = JSON.parse(stripJsonComments('{"a":1 /* x */} # 说明'));
    expect(out).toEqual({ a: 1 });
  });

  it('原有 // 与块注释语义不变', () => {
    expect(JSON.parse(stripJsonComments('{\n // 注释\n "a": 1 /* 行尾 */\n}'))).toEqual({ a: 1 });
  });

  it('findCommentRanges 把 # 计入注释区间', () => {
    const ranges = findCommentRanges('{"a":1} # note');
    expect(ranges).toHaveLength(1);
    expect(ranges[0].start).toBe(8);
  });
});

describe('1132 DevTools 发送链改用同一单源', () => {
  const view = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

  it('DevTools 从 utils/jsonc 引入 stripJsonComments（不再自建第二份实现）', () => {
    expect(view).toContain("import { stripJsonComments } from '../utils/jsonc';");
    expect(view, '重复实现应已删除').not.toContain('devtoolsComments');
  });

  it('发送值经 stripJsonComments 剥离，后于变量展开', () => {
    const at = view.indexOf('async function execSend(');
    const end = view.indexOf('const t0 = performance.now()', at);
    const seg = view.slice(at, end);
    const expandAt = seg.indexOf('applyVars(bodyOut)');
    /* 锚到发送链里那一行本身（`const stripped = stripJsonComments(...)`），
       不能裸找 `stripJsonComments(`——格式化路径里也有同名调用，会命中错的。 */
    const stripAt = seg.indexOf('const stripped = stripJsonComments(bodyExpanded)');
    expect(stripAt).toBeGreaterThan(-1);
    expect(stripAt).toBeGreaterThan(expandAt);
  });
});
