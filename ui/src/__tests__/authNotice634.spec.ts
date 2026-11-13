/**
 * 六百三十四批：权限静默缺陷修复——无审计全量权限时不再静默消失（铁律 F 信息可达 / B 无静默消失）。
 *
 * 背景（626 批实测对标：阿里云「高级监控报警」未授权时给黄色提示条 + 重新授权入口）：
 * `LiveDashboardView` 的「慢请求」整节原为 `v-if="auth.canAuditAll()"` ——权限不足时**整节无声消失**，
 * 用户零解释、无从判断「是没数据还是没权限」。
 *
 * 判据：
 *   1) 外层容器**恒渲染**（不再被 v-if 门掉），权限判定下沉到内部；
 *   2) 有权限 → 原按钮 + 面板逐字保留（零行为变更）；
 *   3) 无权限 → 渲染**说明条**：复用 `.ld-stale` 形态单源（禁私造第二套提示条），
 *      `role="status"` + 文案点明「所需权限档位 + 去哪儿看已授予范围」；
 *   4) 真机双角色验证由 probe-634-auth 承担（ADMIN 出面版 / VIEWER 出提示条）。
 * 负锁剥注释（unifyWave561 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const codeOf = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/<!--[\s\S]*?-->/g, ' ');
const VIEW = codeOf('views/LiveDashboardView.vue');

describe('六百三十四批：慢请求节权限静默修复', () => {
  it('外层容器恒渲染（800 同步更新：慢请求合并「监控明细」单容器=ld-detail 恒渲染，静默消失根治语义保留）', () => {
    expect(VIEW, '旧形态（v-if 门整节）已退役').not.toContain('v-if="auth.canAuditAll()" class="ld-hist-hist"');
    expect(VIEW, '单容器恒渲染').toMatch(/<div class="ld-detail">/);
  });

  it('权限判定下沉内部：授权分支保留原控件与面板（零行为变更；800 同步更新=视图内部 v-if）', () => {
    expect(VIEW, '内部授权分支').toContain('v-if="auth.canAuditAll(store.target)"');
    /* 800 同步更新：慢请求视图=detailTab==='slow' 内部分支（首开懒加载 ensureDetailLoad 保语义） */
    expect(VIEW, '慢请求视图仍在授权分支内').toContain("detailTab === 'slow'");
    expect(VIEW, '耗时阈值输入保留').toContain('v-model.number="slowThresholdMs"');
    expect(VIEW, '导出通道保留（802 同步更新：⋯ 菜单 copyDetail 分发）').toMatch(/detailTab\.value === 'slow'[^}]{0,60}copySlow\(fmt\)/);
    /* 784 同步更新：三表改用全站 .tbl（tbl zebra 前缀）；慢请求表格保留断言随新类形态 */
    expect(VIEW, '慢请求表格保留').toContain('<table class="tbl zebra ld-hist-hist-t">');
  });

  it('无权限分支：复用 .ld-stale 形态单源 + role=status + 点明权限档位与去处', () => {
    expect(VIEW, 'v-else 分支在场').toMatch(/<div v-else class="ld-stale" role="status">/);
    expect(VIEW, '形态单源（不私造第二套提示条类）').not.toMatch(/\.ld-auth-notice\s*\{/);
    expect(VIEW, '文案点明所需权限').toContain('审计全量权限');
    expect(VIEW, '文案给出去处（安全中心）').toContain('安全中心');
    expect(VIEW, '图标复用 AlertTriangle 单源').toMatch(/<div v-else class="ld-stale" role="status">\s*<AlertTriangle/);
  });

  it('不动 ld-stale 本体（观测中断条语义保留，形态单源共用）', () => {
    expect(VIEW, '观测中断条仍在').toContain('v-if="obsStale" class="ld-stale"');
    expect(VIEW, 'ld-stale 规则单源').toMatch(/\.ld-stale \{ display: flex; gap: var\(--sp-2\); align-items: center;/);
  });
});
