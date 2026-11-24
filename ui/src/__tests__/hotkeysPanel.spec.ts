/**
 * R130 第七十批：快捷键登记守卫（重建 R92-D3 注释声称但已失传的 hotkeys.spec 双向断言）。
 * 背景：GOTO_TARGETS（utils/hotkeys.ts）是 goto 快捷键唯一权威源——App.vue 取 path 跳转、
 * HotkeyPanel 取 label 渲染。R93-13 曾因两份数据漂移宣传过不存在的绑定（p/h 事件），
 * 注释声称「hotkeys.spec.ts 另做双向断言兜底」但该 spec 已不在——守卫重建。
 * 锁定：
 * 1) 无死链宣传：GOTO_TARGETS 每个 path（剥 query）必须存在于 pages 合约路由集合；
 * 2) 标签同源：GOTO label 必须等于 pages 合约该路由的 name（白名单：s=沙盒——
      有意精确指向查询工作台的 sandbox 模式而非页名）；
 * 3) HotkeyPanel 引用 GOTO_TARGETS 渲染（同源结构锁，防再出现第二份硬编码清单）；
 * 4) 面板登记完整性：RT/QRT 行导航（四十八/五十五批能力）在「数据表格」组——
      此前该组只登记迁移作业表，全站表格键盘能力对按 ? 的用户不可见。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pagesContract from '@contract';
import { GOTO_TARGETS } from '../utils/hotkeys';

const SRC = join(__dirname, '..');
const raw = pagesContract as any;
const pages: any[] = Array.isArray(raw) ? raw : raw.pages ?? [];
const routeNames: Record<string, string> = {};
for (const p of pages) routeNames[String(p.route).split('?')[0]] = p.name;

/* 有意不与页名同源的 label：指向页内具体模式而非页名 */
const LABEL_WHITELIST = new Set(['/search?mode=sandbox']);

describe('快捷键登记守卫（七十批）', () => {
  it('GOTO_TARGETS 无死链：每个 path 都在 pages 合约路由集合中', () => {
    const missing = Object.entries(GOTO_TARGETS)
      .filter(([, t]) => !(t.path.split('?')[0] in routeNames))
      .map(([k, t]) => `g,${k} → ${t.path} 不在路由表`);
    expect(missing).toEqual([]);
  });

  it('GOTO label 与页名同源（白名单外的漂移即失败）', () => {
    const drift = Object.entries(GOTO_TARGETS)
      .filter(([k, t]) => !LABEL_WHITELIST.has(t.path) && routeNames[t.path.split('?')[0]] !== t.label)
      .map(([k, t]) => `g,${k} label「${t.label}」≠ 页名「${routeNames[t.path.split('?')[0]]}」`);
    expect(drift).toEqual([]);
  });

  it('HotkeyPanel 投影 GOTO_TARGETS（同源结构锁，防硬编码第二份清单回潮）', () => {
    const panel = readFileSync(join(SRC, 'components/HotkeyPanel.vue'), 'utf-8');
    expect(panel).toContain('GOTO_TARGETS');
    expect(panel).not.toMatch(/desc: '[^']*历史[^']*'/); /* 退役页不得再被宣传（R93-13 事故回归锁） */
  });

  it('数据表格组登记 RT/QRT 行导航（全站表格键盘能力可发现）', () => {
    const panel = readFileSync(join(SRC, 'components/HotkeyPanel.vue'), 'utf-8');
    expect(panel).toMatch(/ResultTable \/ QRT \/ 迁移作业表/);
    expect(panel).toMatch(/行导航（高亮行随之移动）/);
    /* 一百七十三批：Esc 语义补清框选；Del 补 Backspace 双键；框选进面板 */
    expect(panel).toMatch(/退出导航态（清勾选 \/ 清框选 \/ 收起展开 \/ 失焦，按表能力）/);
    expect(panel).toMatch(/keys: \['Del', 'Backspace'\]/);
    expect(panel).toMatch(/从单元格拖出框选区域/);
  });

  /* 七十三批：字母单键投影（真机烟测发现 24 个 NAV 字母单键从未进面板——「有功能没人知道」）。
     面板从 pages 合约投影渲染（与 router NAV 同源），行为级锁定渲染数量与内容。 */
  describe('字母单键投影（七十三批）', () => {
    const raw: any = pagesContract;
    const alphaKeys: string[] = ((Array.isArray(raw) ? raw : raw.pages ?? []) as any[])
      .filter((p: any) => typeof p.hotkey === 'string' && p.hotkey.length === 1 && !/^\d$/.test(p.hotkey))
      .map((p: any) => p.hotkey);

    it('面板源码投影 pages 合约（同源结构锁）', () => {
      const panel = readFileSync(join(SRC, 'components/HotkeyPanel.vue'), 'utf-8');
      expect(panel).toContain('@contract');
      expect(panel).toMatch(/alphaRows/);
      expect(alphaKeys.length, '合约应有字母单键（自检防空跑）').toBeGreaterThanOrEqual(20);
    });

    it('挂载渲染：字母单键组数量与合约一致，抽键名在场', async () => {
      const { createApp, h, nextTick } = await import('vue');
      const { createPinia } = await import('pinia');
      const HotkeyPanel = (await import('../components/HotkeyPanel.vue')).default;
      const host = document.createElement('div');
      document.body.appendChild(host);
      const app = createApp({ render: () => h(HotkeyPanel as any, { show: true }) });
      app.use(createPinia());
      app.mount(host);
      try {
        for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
        /* teleport 到 body:断言查 document(三十批 n-popover 同款),卸载前勿清 body */
        const text = document.body.textContent ?? '';
        expect(text).toContain('字母单键：');
        expect(text).toContain('b 收藏夹');
        expect(text).toContain('m Bulk 编辑');
        expect(text).toContain('r 远程集群');
        expect(text).toContain('v 一键体检');
      } finally {
        app.unmount();
        host.remove();
      }
    });
  });
});
