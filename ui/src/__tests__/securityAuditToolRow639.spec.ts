/**
 * 六百三十九批：安全中心「质感第一刀」——审计工具行 G21/G22/G23（635 批 Phase 0 差距清单，
 * 最高优先三项同批；全前端零 Java）。
 *
 * G21（P0）工具行分组收纳：ADMIN 档原 10 控件全平铺（超铁律 C 一倍）——
 *   低频筛选（fUser/fConn/fUri 三输入）与导出（TSV/Markdown 两钮）收进 ⋯ 溢出；
 *   明面=adKw 快滤 + fAction 动作 + 仅看被拒 + fRange 时间 + 刷新 + ⋯（可见按钮 ≤5）。
 * G22（P0）窄屏断点兜底：工具行 flex-wrap，尾部控件换行可达，不再物理不可达。
 * G23（P1）双路径合一：仅看被拒 与 全部动作 的 PAGE_DENIED 写同一 fAction——
 *   仅看被拒 改「一次性 shortcut」（fAction='PAGE_DENIED' 单设不 toggle），select 为单源。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const SEC = codeOf('views/SecurityView.vue');

describe('六百三十九批① G21：审计工具行分组收纳（⋯ 溢出）', () => {
  it('⋯ 溢出壳在场（details+summary 形态，复用 ld-hist-more 同语汇）', () => {
    expect(SEC, '溢出壳').toContain('class="ad-more"');
    expect(SEC, 'summary 触发器').toContain('class="ad-more-sum"');
    expect(SEC, '弹出面板').toContain('class="ad-more-pop"');
  });

  it('低频筛选与导出收进 ⋯；高频快滤/动作/时间/刷新留明面', () => {
    const iPop = SEC.indexOf('class="ad-more-pop"');
    const iEnd = SEC.indexOf('</details>', iPop);
    expect(iPop, '弹层定位').toBeGreaterThan(-1);
    const pop = SEC.slice(iPop, iEnd);
    /* 低频：三筛选输入 + 两导出钮，全在 ⋯ 弹层内 */
    expect(pop, '按用户过滤收进 ⋯').toMatch(/fUser/);
    expect(pop, '按集群过滤收进 ⋯').toMatch(/fConn/);
    expect(pop, '按 URI 前缀收进 ⋯').toMatch(/fUri/);
    expect(pop, 'TSV 导出收进 ⋯').toContain('copyAuditTsv');
    expect(pop, 'Markdown 导出收进 ⋯').toContain('copyAuditMd');
    /* 高频：明面（⋯ 之前）仍保有快滤/动作/时间/刷新 */
    const before = SEC.slice(0, iPop);
    expect(before, '快滤 adKw 明面').toContain('adKw');
    expect(before, '动作 fAction 明面').toContain('fAction');
    expect(before, '时间 fRange 明面').toContain('fRange');
    expect(before, '刷新明面').toContain('loadAudit');
    /* 明面不再平铺三低频筛选（它们只在弹层内出现一次） */
    expect(before, '按用户过滤不占明面').not.toMatch(/v-model\.trim="fUser"/);
    expect(before, '按 URI 前缀不占明面').not.toMatch(/v-model\.trim="fUri"/);
  });
});

describe('六百三十九批② G22：窄屏断点兜底', () => {
  it('审计工具行 flex-wrap（尾部控件换行可达，不再物理不可达）', () => {
    expect(SEC, '审计工具行换行').toMatch(/\.audit-card \.card-t \{ [^}]*flex-wrap: wrap;/);
  });
});

describe('六百三十九批③ G23：双路径合一（仅看被拒改单设不 toggle）', () => {
  it('仅看被拒 = 一次性 shortcut（set 不 toggle），select 为单源', () => {
    expect(SEC, '单设 PAGE_DENIED').toContain("fAction = 'PAGE_DENIED'; loadAudit()");
    expect(SEC, '不再 toggle 回空（双路径根除）').not.toContain("fAction = fAction === 'PAGE_DENIED' ? '' : 'PAGE_DENIED'");
    expect(SEC, 'on 态仍由 select 值派生（视觉一致）').toContain(":class=\"{ on: fAction === 'PAGE_DENIED' }\"");
  });
});
