/* 存储通道挂载期裸 JSON.parse 清零看守（851 批·G85 同族余量清扫收口）。
 *
 * 病灶家族：组件 setup 顶层 `ref(JSON.parse(localStorage.getItem(k) || '…'))` 裸形态——
 * localStorage 由用户环境共有（手改/旧版残留/跨版本键形变皆可写入任意文本），
 * parse 抛错即挂载崩溃。851 实勘三处：CmdPalette es_cmd_recent / SideNav
 * esquerystudio.nav.collapsed（全站导航件，崩=白屏级）/ RestView es_rest_hist。
 * 修法三处统一走 utils/safeJson readStoredJson 单源（try+形态校验+回落）。
 *
 * ── 断言口径 ─────────────────────────────────────────────────
 * A 组：三矿点禁止回魂——裸 `JSON.parse(<storage>.getItem(` 同行形态零残留，
 *      且 readStoredJson 接线在场（防「删守卫保绿」）。
 * B 组：全站看守——扫 src 全树（排除 __tests__），「JSON.parse( 与 getItem(
 *      同行且近 6 行（含自身）无 try」判脏，存量=0。
 *      盲区诚实备案：多行间接形态（raw 先存、parse 另行）不在本看守域——
 *      全站该形态存量均已带 try（851 实勘 useScopedDraft/jobTracker/liveMonitor/
 *      queryHistory/reportArchive/urlState/HealthReportView 七处正面在册），
 *      回潮防线=TDD 评审纪律；本看守锁的是 851 病灶的同行形态族。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');
const read = (rel: string) => readFileSync(join(srcDir, rel), 'utf8');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
const BARE_PARSE = /JSON\.parse\(\s*(?:localStorage|sessionStorage|window\.localStorage|window\.sessionStorage)\.getItem\(/;

describe('storageParseGuard851 · 存储通道挂载期裸 parse 清零', () => {
  /* —— A 组：三矿点接线锁（先红主战场） —— */

  it('A1 CmdPalette es_cmd_recent 走 readStoredJson 单源，裸形态零残留', () => {
    const code = stripComments(read('components/CmdPalette.vue'));
    expect(BARE_PARSE.test(code), 'es_cmd_recent 挂载期裸 parse 复发').toBe(false);
    expect(code).toContain("readStoredJson(localStorage, 'es_cmd_recent'");
  });

  it('A2 SideNav nav.collapsed 走 readStoredJson 单源，裸形态零残留', () => {
    const code = stripComments(read('components/SideNav.vue'));
    expect(BARE_PARSE.test(code), 'nav.collapsed 挂载期裸 parse 复发（全站导航件挂载崩溃面）').toBe(false);
    expect(code).toContain('readStoredJson(localStorage, LS_KEY');
  });

  it('A3 RestView es_rest_hist 走 readStoredJson 单源，裸形态零残留', () => {
    const code = stripComments(read('views/RestView.vue'));
    expect(BARE_PARSE.test(code), 'es_rest_hist 挂载期裸 parse 复发').toBe(false);
    expect(code).toContain("readStoredJson(localStorage, 'es_rest_hist'");
  });

  /* —— B 组：全站看守（同行形态族存量=0） —— */

  it('B1 全站 src 树「JSON.parse 与 getItem 同行且近 6 行无 try」存量=0', () => {
    const { readdirSync, statSync } = require('node:fs') as typeof import('node:fs');
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const st = statSync(p);
        if (st.isDirectory()) { if (f !== '__tests__') walk(p); }
        else if (/\.(ts|vue)$/.test(f)) files.push(p);
      }
    };
    walk(srcDir);
    const dirty: string[] = [];
    for (const f of files) {
      const lines = stripComments(readFileSync(f, 'utf8')).split('\n');
      for (let i = 0; i < lines.length; i++) {
        if (!/JSON\.parse\(/.test(lines[i]) || !/getItem\(/.test(lines[i])) continue;
        let guarded = false;
        for (let j = Math.max(0, i - 6); j <= i; j++) if (/\btry\b/.test(lines[j])) guarded = true;
        if (!guarded) dirty.push(f.replace(srcDir, '') + ':' + (i + 1));
      }
    }
    expect(dirty, '挂载期裸 parse 存量回流：\n' + dirty.join('\n')).toEqual([]);
  });
});
