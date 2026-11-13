/**
 * 六百五十三批：轨3 列布局 preset 消费面接线（⑥ 652 头号候选落地件）。
 * 652 内核（useTablePrefs 的 presets/savePreset/applyPreset/deletePreset，行为契约
 * useTablePrefsPreset652.spec）落工具行：新共享件 TablePresetMenu（ColPicker
 * 同款「单钮+弹层」收纳范式，铁律 C 禁平铺枚举），RT/QRT 双表 bar-right 列宽后接线。
 * 锁定（三层）：
 *  A 源码锁：双表接线四 prop + btnCls 形制 + 位次（列宽后、bar-extra 前——既有钮
 *    位置恒定，铁律 B）+ 内核解构扩员 + 铁律 C（触发器单钮，保存/删除只在弹层内）；
 *  B 行为锁（挂载 TablePresetMenu，colPicker.spec 范式——n-popover 内容 teleport 到
 *    body，断言一律查 document；happy-dom 卸载前勿清 teleport DOM）：空态/save
 *    （trim+成功清词+失败保词）/apply（≤1 击、成功关层）/del（名册现更、弹层保留）
 *    /Esc 两段收口（非空清词层仍在→空关层+焦点回触发钮，566 范式）。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick, ref } from 'vue';

import TablePresetMenu from '../components/TablePresetMenu.vue';

const rt = readFileSync(join(__dirname, '../components/ResultTable.vue'), 'utf-8');
const qrt = readFileSync(join(__dirname, '../components/QueryResultTable.vue'), 'utf-8');
const comp = readFileSync(join(__dirname, '../components/TablePresetMenu.vue'), 'utf-8');

const apps: ReturnType<typeof createApp>[] = [];
const host = document.createElement('div');
document.body.appendChild(host);

/** 挂 TablePresetMenu 并模拟内核受控面：presets 走受控 ref，save/apply/del 回调
    收集调用且 save/del 成功时同步名册（与 useTablePrefs 真实行为同构）。
    点击触发钮开层（naive trigger="click" 内部接管，colPicker.spec 同款）。 */
async function mountMenu(props: { presets: string[]; saveOk?: boolean }) {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
  const list = ref<string[]>([...props.presets]);
  const calls: { save: string[]; apply: string[]; del: string[] } = { save: [], apply: [], del: [] };
  const app = createApp({
    setup() {
      return () => h(TablePresetMenu as any, {
        presets: list.value,
        save: (n: string) => {
          calls.save.push(n);
          const ok = props.saveOk !== false;
          if (ok) list.value = [...list.value.filter(x => x !== n), n]; /* 同名覆盖位置稳定（652 契约） */
          return ok;
        },
        apply: (n: string) => { calls.apply.push(n); return true; },
        del: (n: string) => { calls.del.push(n); list.value = list.value.filter(x => x !== n); return true; },
      });
    },
  });
  app.mount(host);
  apps.push(app);
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
  return { calls, list };
}

const trigger = () => host.querySelector('button') as HTMLButtonElement;
const pop = () => document.querySelector('.tpm-pop');
const names = () => [...document.querySelectorAll('.tpm-name')].map(el => (el.textContent || '').trim());
const clickIt = async (el: Element) => {
  (el as HTMLElement).click();
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
};
const typeIn = async (sel: string, text: string) => {
  const inp = document.querySelector(sel) as HTMLInputElement;
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
  set.call(inp, text);
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  for (let i = 0; i < 4; i++) { await nextTick(); await Promise.resolve(); }
};
const esc = async () => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
};

beforeEach(() => {
  localStorage.clear();
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
  document.body.appendChild(host);
});

describe('653 批 A 源码锁：双表接线与铁律 C 收纳', () => {
  it('双表接线：四 prop + btnCls 形制，位次=列宽钮后、bar-extra 槽前（既有钮位置恒定）', () => {
    for (const [src, cls] of [[rt, 'rt-tool-btn'], [qrt, 'qrt-tool-btn']] as const) {
      const at = src.indexOf('<TablePresetMenu');
      expect(at, 'TablePresetMenu 接线在场').toBeGreaterThan(-1);
      const seg = src.slice(at, at + 240);
      expect(seg).toContain(':presets="presets"');
      expect(seg).toContain(':save="savePreset"');
      expect(seg).toContain(':apply="applyPreset"');
      expect(seg).toContain(':del="deletePreset"');
      expect(seg).toContain(`btn-cls="${cls}"`);
      /* 835 批同步更新：列宽重置合并「视图 ⋯」聚合菜单——位次锚改视图聚合钮（列宽项在其菜单内） */
      const view = src.indexOf('aria-label="视图设置"');
      const extra = src.indexOf('<slot name="bar-extra"');
      expect(view).toBeGreaterThan(-1);
      expect(extra).toBeGreaterThan(-1);
      expect(at, '布局钮在视图聚合钮之后（位置恒定语义不变）').toBeGreaterThan(view);
      expect(at, '布局钮在 bar-extra 槽之前').toBeLessThan(extra);
    }
  });

  it('内核解构扩员：presets/savePreset/applyPreset/deletePreset 入两表 useTablePrefs 解构', () => {
    for (const src of [rt, qrt]) {
      expect(src).toContain('presets, savePreset, applyPreset, deletePreset,');
    }
  });

  it('铁律 C：触发器单钮收纳——保存/删除只在弹层内，不外露工具行平铺', () => {
    const trig = comp.match(/<template #trigger>([\s\S]*?)<\/template>/)?.[1] || '';
    expect(trig.match(/<button/g)?.length, '触发器恰好一颗钮').toBe(1);
    /* 负锁锚产品源（650-C1 口径）：两表工具行不得出现保存/删除枚举钮字面 */
    for (const src of [rt, qrt]) {
      expect(src).not.toContain('保存当前');
      expect(src).not.toContain('tpm-del');
    }
  });
});

describe('653 批 B 行为锁：TablePresetMenu 受控契约', () => {
  it('空态+save 链：空名禁用；trim 落名；成功清词+名册现项；失败保词不静默吞', async () => {
    let saveOk = true;
    const { calls } = await mountMenu({ presets: [], get saveOk() { return saveOk; } } as any);
    expect(pop(), '未开层不渲染弹层').toBeNull();
    await clickIt(trigger());
    expect(pop()).toBeTruthy();
    expect(document.querySelector('.tpm-none'), '空态行结构在场').toBeTruthy();
    const saveBtn = document.querySelector('.tpm-save-btn') as HTMLButtonElement;
    expect(saveBtn.disabled, '空名禁用保存').toBe(true);
    await typeIn('.tpm-inp', '  窄列  ');
    expect(saveBtn.disabled, '有词即启用').toBe(false);
    await clickIt(saveBtn);
    expect(calls.save).toEqual(['窄列']);
    expect((document.querySelector('.tpm-inp') as HTMLInputElement).value, '成功清词').toBe('');
    expect(names()).toEqual(['窄列']);
    expect(document.querySelector('.tpm-none'), '空态移除').toBeNull();
    /* 失败：输入保留（可修正），名册不动 */
    saveOk = false;
    await typeIn('.tpm-inp', '另一方案');
    await clickIt(document.querySelector('.tpm-save-btn') as HTMLButtonElement);
    expect(calls.save[1]).toBe('另一方案');
    expect((document.querySelector('.tpm-inp') as HTMLInputElement).value).toBe('另一方案');
    expect(names()).toEqual(['窄列']);
  });

  it('apply 链：点方案名即应用（≤1 击直达），成功关层立即见表格变化', async () => {
    const { calls } = await mountMenu({ presets: ['窄列', '宽列'] });
    await clickIt(trigger());
    expect(names()).toEqual(['窄列', '宽列']);
    await clickIt(document.querySelectorAll('.tpm-name')[1] as HTMLElement);
    expect(calls.apply).toEqual(['宽列']);
    expect(pop(), '应用成功即关层（最短路径，铁律 B）').toBeNull();
  });

  it('del 链：× 删除后名册现更新、弹层保留（可连续管理）', async () => {
    const { calls } = await mountMenu({ presets: ['a', 'b'] });
    await clickIt(trigger());
    await clickIt(document.querySelectorAll('.tpm-del')[0] as HTMLButtonElement);
    expect(calls.del).toEqual(['a']);
    expect(names()).toEqual(['b']);
    expect(pop()).toBeTruthy();
  });

  it('Esc 两段收口（566 范式）：非空清词层仍在→空关层+焦点回触发钮', async () => {
    await mountMenu({ presets: ['a'] });
    await clickIt(trigger());
    await typeIn('.tpm-inp', '草稿');
    await esc();
    expect((document.querySelector('.tpm-inp') as HTMLInputElement).value, '第一段：清词').toBe('');
    expect(pop(), '清词不关层').toBeTruthy();
    await esc();
    expect(pop(), '第二段：关层').toBeNull();
    expect(document.activeElement, '焦点回触发钮（铁律 D1#5）').toBe(trigger());
  });
});
