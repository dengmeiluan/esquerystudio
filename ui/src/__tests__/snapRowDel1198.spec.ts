/**
 * 1198：快照行「删除」静息隐藏。
 *
 * 快照时间线的每一行都并排挂「恢复」「删除」，且这两个动作早已在行右键菜单里
 * （恢复此快照… / 删除快照…）。区别在于：恢复是可逆的日常动作（保留常驻），
 * 删除是**破坏性**的——红色按钮铺满整个长列表会持续抢注意力。
 *
 * 锁：① 主行动「恢复」常驻；② 删除包进 .sv-row-del，静息 opacity:0；
 *     ③ 悬停 / focus-within 显现，触屏 (hover:none) 恒显；
 *     ④ 权限门与确认闸不动（canOps + askConfirm guardText 仍在）；
 *     ⑤ 负控：删掉 .sv-row-del 类或 opacity 规则 → 对应用例转红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/SnapshotsView.vue'), 'utf-8');

describe('1198 快照行删除静息隐藏', () => {
  it('「恢复」在包裹层外常驻（可逆的日常动作不藏）', () => {
    const row = src.slice(src.indexOf('恢复</button>') - 200, src.indexOf('class="sv-row-del"'));
    expect(row).toContain('openRestore(s)');
  });

  it('删除包在 .sv-row-del 内，静息 opacity:0', () => {
    expect(src).toContain('class="sv-row-del"');
    /* 锚整行（含 opacity:0 与 transition），不能只匹配前缀——
       第一版写成 /.sv-tl-row \.sv-row-del \{ display: inline-flex; opacity: 0;/
       时，删掉静息规则后仍会被 hover 规则行前半句蒙混过关（负控当场抓到）。 */
    /* ⚠源文件是 CRLF 行尾：锚整行时行首/行尾都要允许可选的 \r，否则锚永远打不中。 */
    expect(src).toMatch(/\r?\n\.sv-tl-row \.sv-row-del \{ display: inline-flex; opacity: 0; transition: opacity var\(--tr\); \}\r?\n/);
  });

  it('悬停 / focus-within 显现；触屏恒显', () => {
    expect(src).toMatch(/\.sv-tl-row:hover \.sv-row-del, \.sv-tl-row:focus-within \.sv-row-del \{ opacity: 1; \}/);
    expect(src).toMatch(/@media \(hover: none\) \{ \.sv-tl-row \.sv-row-del \{ opacity: 1; \} \}/);
  });

  it('权限门与确认闸不动（隐藏不等于放宽）', () => {
    expect(src).toContain('<button v-if="canOps" class="btn sm danger" @click="doDeleteSnapshot(s)"');
    expect(src).toContain("guardText: s.snapshot");
    expect(src).toContain("level: 'critical'");
  });

  it('右键菜单仍提供删除（隐藏不等于失去入口）', () => {
    expect(src).toContain("key: 'delete', label: '删除快照…'");
  });

  it('负控：删除钮不得再裸挂在行内（旧形态）', () => {
    expect(src).not.toMatch(/\n\s+<button v-if="canOps" class="btn sm danger" @click="doDeleteSnapshot\(s\)"[^>]*><Trash2 :size="11" \/> 删除<\/button>\n\s+<details class="sv-tl-more">/);
  });
});
