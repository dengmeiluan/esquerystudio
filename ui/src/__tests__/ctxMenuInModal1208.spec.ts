/**
 * 1208：右键菜单必须可见于 naive 弹层/浮岛之上（真实浏览器实测发现）。
 *
 * 现场（1440×1000，mock 后端）：索引工作区 → 单元格右键 →「查看完整值」→ n-modal
 * （容器 z=2000）→ 在 JsonTree 节点上右键。旧实现菜单 z=1201，菜单被弹窗盖住。
 *
 * 现行解法：右键菜单使用独立顶档 `--z-ctx-top`（theme.css 注册，10001），
 * 高于 Picker 浮岛（--z-island=9000）、路由条（9999）、全屏（10000）与 naive
 * 动态层（2000+）；不再依赖 vdirs 计数器写 inline z（字段候选浮岛 9000 压过
 * 动态 2001 的实机缺陷即由此修复）。
 *
 * 本 spec 锁三件事：
 *  1) 档位关系：--z-ctx-top 必须高于浮岛/全屏/naive 基数；
 *  2) 组件接线：mask/面板/二级都消费 --z-ctx-top，且不再有动态 zIndexManager 残留；
 *  3) 静态档不写 inline z（普通页面层序零变化）。
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

let app: any = null;

const menuSrc = () => readFileSync(join(__dirname, '../components/CellContextMenu.vue'), 'utf-8');
const themeSrc = () => readFileSync(join(__dirname, '../theme.css'), 'utf-8');

async function mountMenu() {
  const { createApp, h, nextTick } = await import('vue');
  const Menu = (await import('../components/CellContextMenu.vue')).default;
  app = createApp({
    render: () => h(Menu as any, {
      x: 40, y: 40, title: 't',
      items: [{ key: 'a', label: '复制值', run: () => {} }],
    }),
  });
  app.mount(document.createElement('div'));
  await nextTick();
  await nextTick();
}

const maskEl = () => document.querySelector('.ccm-mask') as HTMLElement | null;

beforeEach(() => {
  if (app) { app.unmount(); app = null; }
  document.body.innerHTML = '';
});

afterAll(() => { if (app) app.unmount(); });

describe('1208 右键菜单在 naive 弹层/浮岛内可见', () => {
  it('档位关系：--z-ctx-top 高于浮岛/全屏/naive 基数 2000', () => {
    const theme = themeSrc();
    const z = (name: string) => Number(theme.match(new RegExp(`--${name}:\\s*(\\d+)`))?.[1]);
    const top = z('z-ctx-top');
    expect(top, '--z-ctx-top 必须注册').toBeGreaterThan(0);
    expect(top, '必须压过 Picker 浮岛').toBeGreaterThan(z('z-island'));
    expect(top, '必须压过全屏').toBeGreaterThan(z('z-fullscreen'));
    expect(top, '必须压过 naive 动态层基数').toBeGreaterThan(2000);
  });

  it('组件接线：mask/面板/二级消费顶档，动态 zIndexManager 无残留', async () => {
    const src = await menuSrc();
    expect(src).toMatch(/\.ccm-mask \{ position: fixed; inset: 0; z-index: var\(--z-ctx-top\); \}/);
    expect(src).toMatch(/z-index: calc\(var\(--z-ctx-top\) \+ 1\);/);
    expect(src).toMatch(/z-index: calc\(var\(--z-ctx-top\) \+ 2\);/);
    expect(src).not.toContain('zIndexManager');
  });

  it('静态档不写 inline z（普通页面层序零变化）', async () => {
    await mountMenu();
    expect(maskEl()?.style.zIndex || '').toBe('');
  });
});
