/**
 * 三百二十六批：DevTools 大响应防护（用户实报「工具台操作很多 bug」取证修复）。
 * 巨型响应（数 MB）曾直塞 Monaco 卡死操作 + persist 连 result 写 localStorage 逼近
 * 5MB 上限静默写爆。三件：persist 剥离 result / >512KB 截断展示+完整原文留内存 /
 * 字符串 JSON 响应自动 prettify。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('DevTools 大响应防护（326 批）', () => {
  it('persist 剥离 result/resultFull/busy（501 批补 busy：执行中刷新即永久卡死）', () => {
    /* v3.0.1 可重入性:合并单草稿对象,busy/result 剥离契约不变。
       五百六十五批同步更新（击穿者：565 件⑤——剥离面扩 segRuns/segView 段锚，与 result 同保密级） */
    expect(v).toMatch(/JSON\.stringify\(\{\s*active: active\.value,\s*tabs: tabs\.value\.map\(t => \(\{ \.\.\.t, result: null, resultFull: null, busy: false, segRuns: \[\], segView: -1 \}\)\)/);
  });
  it('截断展示+完整原文留内存+复制取全文', () => {
    expect(v).toMatch(/const DEVTOOLS_RESP_MAX = 512 \* 1024;/);
    expect(v).toMatch(/t\.resultFull = txt;/);
    expect(v).toMatch(/copyText\(cur\.resultFull \|\| cur\.result \|\| ''\)/);
    expect(v).toContain('已截断展示');
  });
  it('JSON 响应自动 prettify', () => {
    expect(v).toContain('txt = JSON.stringify(JSON.parse(txt), null, 2);');
  });
});
