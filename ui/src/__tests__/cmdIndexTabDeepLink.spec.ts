/**
 * 二百二十四批：命令面板「索引+tab」深链（§5.6 债务项收口）。
 * 锁定：每个索引注入「工作区 <name>」（?idx&tab=docs）与「分片 <name>」（?idx&tab=shards）
 * 两条深链命令——通道是 IndexHub 现成的 useUrlState('tab')，纯 palette 注入零视图改动。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/CmdPalette.vue'), 'utf-8');

describe('命令面板「索引+tab」深链（二百二十四批）', () => {
  it('每索引注入 工作区(docs)/分片(shards) 两条深链，先 pick 再跳', () => {
    expect(src).toContain("{ id: 'idx-hub-' + iname, title: '工作区 ' + iname, sub: '索引工作区 · 文档', cat: '索引', icon: Database,");
    expect(src).toContain("action: () => { store.pick(iname); go({ path: '/indices', query: { idx: iname, tab: 'docs' } }); }");
    expect(src).toContain("{ id: 'idx-shards-' + iname, title: '分片 ' + iname, sub: '索引工作区 · 分片诊断', cat: '索引', icon: LayoutGrid,");
    expect(src).toContain("action: () => { store.pick(iname); go({ path: '/indices', query: { idx: iname, tab: 'shards' } }); }");
  });
  it('既有 R92-D5 三动作不受侵（查询/Mapping/Settings 深链保留）', () => {
    expect(src).toContain("{ id: 'idx-q-' + iname, title: '查询 ' + iname");
    expect(src).toContain("{ id: 'idx-m-' + iname, title: 'Mapping ' + iname");
    expect(src).toContain("{ id: 'idx-s-' + iname, title: 'Settings ' + iname");
  });
});
