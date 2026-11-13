/**
 * 一千三百二十七批：页头操作簇永不收缩，「执行」按钮被顶出视口。
 *
 * 真机（1024×900，SQL 控制台；左侧导航占 232px 后页头仅剩 768）：
 *   `.ph-r` 宽 829 → 执行按钮右缘 1029 > 视口 1024，**被裁 6px**；
 *   而 `pageScrollW === 1024`（页面整体没横向滚动），所以用户连滚都滚不到它。
 *   同一排还有 `Ctrl+⏎` 角标被切一半。
 *
 * 根因：`.ph-r { flex-shrink: 0; flex-wrap: wrap; }`
 * —— 允许换行却禁止收缩。它永远按 min-content 撑开，wrap 就永远不触发，
 * 整簇带着页头一起溢出。加 `min-width: 0` 后 wrap 才真正生效。
 *
 * 本 spec 锁这个组合而不是像素：
 *  - `.ph-r` 必须 `flex-wrap: wrap`（窄档换行而非裁切）
 *  - `.ph-r` **不得**再带 `flex-shrink: 0`（否则 wrap 是死的）
 *  - 标题侧 `.ph-l` 必须 `min-width: 0`（收缩时由标题让位，不被按钮簇挤扁）
 * 负控：把 `flex-shrink: 0` 加回去 → 第二条必红。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/PageHeader.vue'), 'utf-8');

function rule(sel: string): string {
  const i = src.indexOf(`${sel} {`);
  expect(i, `${sel} 规则必须存在`).toBeGreaterThan(-1);
  return src.slice(i, src.indexOf('}', i));
}

describe('1327 页头操作簇可收缩（否则换行永不触发）', () => {
  it('操作簇允许换行', () => {
    expect(rule('.ph-r'), '.ph-r 必须 flex-wrap: wrap').toContain('flex-wrap: wrap');
  });

  it('操作簇不得禁止收缩（flex-shrink:0 会让 wrap 失效）', () => {
    expect(rule('.ph-r'), '.ph-r 不得带 flex-shrink: 0').not.toMatch(/flex-shrink:\s*0/);
    expect(rule('.ph-r'), '.ph-r 必须 min-width: 0 才能被压窄').toContain('min-width: 0');
  });

  it('标题侧可让位（不被按钮簇挤扁）', () => {
    expect(rule('.ph-l'), '.ph-l 必须有 min-width: 0').toContain('min-width: 0');
  });
});
