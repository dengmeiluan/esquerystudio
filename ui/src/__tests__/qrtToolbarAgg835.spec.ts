/**
 * 八百三十五批：工具行密度改革落地（设计稿 goal833-toolbar-density.html 经用户批准）——
 * QRT 右簇导出格式五连平铺（CSV/MD/XLSX/PNG/JSON）合并「导出 ▾」聚合钮（铁律 C：
 * 同类枚举合一，可见 ≤5）；行高三档循环 + 列宽重置双钮合并「视图 ⋯」聚合钮
 * （行高改显式三选带当前档 ✓，比连点循环可预期）；RT 同步「视图 ⋯」（291 钮序守卫
 * 的两内核一致语义迁移到聚合层）；放大/消费方 bar-extra 常驻不变。
 * 能力零删除：五个格式导出函数、setRowH 三档、resetColWidths 实现零改动，只动入口。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h } from 'vue';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import QueryResultTable from '../components/QueryResultTable.vue';
import ResultTable from '../components/ResultTable.vue';

const rd = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const qrt = () => rd('../components/QueryResultTable.vue');
const rt = () => rd('../components/ResultTable.vue');

describe('qrtToolbarAgg835 源码锚（聚合钮在位）', () => {
  it('QRT：导出 ▾ 聚合触发器在场（haspopup=menu）', () => {
    /* 1345：aria 升级为带范围/格式的动态文案——守的仍是「触发器在场且是菜单」。 */
    expect(qrt()).toMatch(/:aria-label="`导出当前视图（[\s\S]{0,240}?aria-haspopup="menu"/);
    expect(qrt()).toContain('导出 ▾');
  });
  it('QRT：导出菜单五格式 aria 逐字保留（525/560 锁面同步更新不破）', () => {
    const v = qrt();
    for (const a of ['导出当前视图 CSV', '导出当前视图 Markdown', '导出当前视图 XLSX', '导出表格快照 PNG', '导出当前视图 JSON']) {
      expect(v).toContain(a);
    }
  });
  it('QRT：五连平铺形态退役（独立格式钮不再常驻 bar 右簇）', () => {
    const v = qrt();
    expect(v).not.toMatch(/\/> CSV\n/);
    expect(v).not.toContain('<FileDown :size="13" /> MD');
    expect(v).not.toContain('<Table :size="13" /> XLSX');
    expect(v).not.toContain('<Camera :size="13" /> PNG');
    expect(v).not.toContain('<Braces :size="13" /> JSON');
  });
  it('QRT：视图 ⋯ 聚合触发器在场 + 行高三档 setRowH 直选 + 列宽重置入菜单', () => {
    const v = qrt();
    expect(v).toMatch(/aria-label="视图设置"/);
    expect(v).toContain("setRowH('compact')");
    expect(v).toContain("setRowH('standard')");
    expect(v).toContain("setRowH('cozy')");
    expect(v).toMatch(/@click="resetColWidths\(\); closeMenus\(\)"/);
  });
  it('RT：视图 ⋯ 聚合同步落地（291 两内核一致语义迁移到聚合层）', () => {
    const v = rt();
    expect(v).toMatch(/aria-label="视图设置"/);
    expect(v).toContain("setRowH('compact')");
    expect(v).toContain("setRowH('cozy')");
    expect(v).not.toMatch(/@click="cycleRowH"/);
    expect(v).not.toContain('/> 列宽');
  });
});

describe('qrtToolbarAgg835 行为链（挂载 QRT）', () => {
  const apps: ReturnType<typeof createApp>[] = [];
  const host = document.createElement('div');
  document.body.appendChild(host);

  function makeHits(n: number) {
    return Array.from({ length: n }, (_, i) => ({ _id: 'a' + i, _source: { f0: i, f1: 'x' + i } }));
  }
  async function mountTbl() {
    const app = createApp({ setup: () => () => h(QueryResultTable as any, { hits: makeHits(12) as any, storageKey: 'q835' }) });
    app.use(createPinia());
    app.mount(host);
    apps.push(app);
    for (let i = 0; i < 10; i++) { await Promise.resolve(); }
    return app;
  }
  beforeEach(() => {
    localStorage.clear();
    apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
    apps.length = 0;
    host.innerHTML = '';
  });

  it('导出 ▾：点击开菜单（五格式项在场，空结果禁用语义保留）→ Esc 关', async () => {
    await mountTbl();
    /* 1345：aria 现在是「导出当前视图（N 行，格式…）」，按前缀认钮。 */
    const trig = [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').startsWith('导出'));
    expect(trig, '导出聚合触发器在场').toBeTruthy();
    trig!.click();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const menu = host.querySelector('.qrt-menu[role="menu"]');
    expect(menu, '菜单浮层打开').toBeTruthy();
    const items = [...menu!.querySelectorAll('button')];
    expect(items.length).toBe(5);
    for (const it of items) {
      expect(it.getAttribute('aria-label'), '五格式 aria 逐字保留').toBeTruthy();
      expect(it.disabled).toBe(false);
    }
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(host.querySelector('.qrt-menu[role="menu"]')).toBeNull();
  });

  it('视图 ⋯：行高三档显式直选写 es_tbl_rowh + class 切换；重置列宽无记忆时禁用', async () => {
    await mountTbl();
    const trig = [...host.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '视图设置');
    expect(trig, '视图聚合触发器在场').toBeTruthy();
    trig!.click();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    const menu = host.querySelector('.qrt-menu[role="menu"]');
    expect(menu).toBeTruthy();
    const loose = [...menu!.querySelectorAll('button')].find(b => b.textContent!.includes('宽松'));
    const reset = [...menu!.querySelectorAll('button')].find(b => b.getAttribute('aria-label') === '重置全部列宽');
    expect(reset, '重置列宽入口在菜单（无列宽记忆=disabled）').toBeTruthy();
    expect(reset!.disabled).toBe(true);
    loose!.click();
    for (let i = 0; i < 6; i++) await Promise.resolve();
    expect(localStorage.getItem('es_tbl_rowh')).toBe('cozy');
    expect(host.querySelector('.qrt-tbl')!.classList.contains('cozy')).toBe(true);
  });

  it('放大钮常驻（聚合改革零回退）', async () => {
    await mountTbl();
    const zoom = [...host.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('放大结果表'));
    expect(zoom).toBeTruthy();
  });
});
