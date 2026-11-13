/**
 * W1 Task 3：索引设置键目录 + SettingsKeyInput 行为保护网。
 *
 * 纯函数部分（filterSettings / SETTINGS_CATALOG）：
 *   目录 ≥25 条且每条含 key/desc/example/dynamic 四字段；key 无重复；
 *   空关键词 cap 30 且按 key 字母序；前缀匹配优先于包含匹配；
 *   key 过滤大小写不敏感；中文 desc 命中；无匹配返回空数组。
 *
 * 组件部分（SettingsKeyInput，复刻 FieldPicker 弹层骨架，数据源=静态目录零请求）：
 *   focus 出层 / 输入过滤 / ↑↓ 导航 / Enter 回填 v-model + 关层 /
 *   Esc 关层手输值保留 / 无匹配 Enter 退化纯手输（三态契约）/
 *   底部 hint 行跟随选中项 example / dynamic 徽标文案（热更/静态）/ 点击外部关闭。
 *
 * mount 范式与 fieldPicker.spec.ts 一致（createApp+h+createPinia，apps 收集 +
 * afterEach 兜底 unmount）；静态目录无需 mock api。
 * 弹层 Teleport 在 body 下，统一查 document.body。
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createApp, h, nextTick, reactive } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

import { SETTINGS_CATALOG, filterSettings } from '../utils/indexSettingsCatalog';
import SettingsKeyInput from '../components/SettingsKeyInput.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

/* teardown 兜底：所有 mount 的 app 收集于此，afterEach 统一 unmount，
   断言中途失败也不泄漏 document 级 mousedown listener（同 fieldPicker.spec 范式） */
const apps: ReturnType<typeof createApp>[] = [];

async function mountInput(init: { modelValue?: string } = {}) {
  const state = reactive({ modelValue: init.modelValue ?? '' });
  const picked: string[] = [];
  const pinia = createPinia();
  /* 防御性保留：组件自身无路由/store 依赖，防未来依赖（同 fieldPicker.spec 范式） */
  const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
  await router.push('/');
  await router.isReady();
  const app = createApp({
    render: () => h(SettingsKeyInput, {
      modelValue: state.modelValue,
      'onUpdate:modelValue': (v: string) => { state.modelValue = v; },
      onPicked: (v: string) => picked.push(v),
    }),
  });
  apps.push(app);
  app.use(pinia);
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host, state, picked };
}

/* 弹层 Teleport 到 body：统一在这里查 */
const pop = () => document.body.querySelector('.skp-pop');
const items = () => Array.from(document.body.querySelectorAll<HTMLElement>('.skp-item'));
const itemKeys = () => Array.from(document.body.querySelectorAll('.skp-item .skp-key')).map(el => el.textContent);
const foot = () => document.body.querySelector('.skp-ft');
const inp = (host: ParentNode) => host.querySelector<HTMLInputElement>('.skp-inp')!;
async function focus(host: ParentNode) { inp(host).dispatchEvent(new Event('focus')); await settle(); }
async function type(host: ParentNode, v: string) {
  const el = inp(host);
  el.value = v;
  el.dispatchEvent(new Event('input'));
  await settle();
}
async function key(host: ParentNode, k: string) {
  inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: k }));
  await settle();
}
/* 弹层关闭走 <transition> 离场：断言「已关闭」前补一帧（同 fieldPicker.spec 的 flushLeave） */
async function flushLeave() {
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
  await settle(3);
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('SETTINGS_CATALOG 目录完整性', () => {
  it('≥25 条且 key 无重复', () => {
    expect(SETTINGS_CATALOG.length, '目录至少 25 条').toBeGreaterThanOrEqual(25);
    const keys = SETTINGS_CATALOG.map(s => s.key);
    expect(new Set(keys).size, 'key 不许重复').toBe(keys.length);
  });

  it('每条含 key/desc/example/dynamic 四字段且形态正确', () => {
    for (const s of SETTINGS_CATALOG) {
      expect(typeof s.key, `key 必须是 string：${JSON.stringify(s)}`).toBe('string');
      expect(s.key.trim(), 'key 非空').toBeTruthy();
      expect(typeof s.desc, `${s.key} 缺 desc`).toBe('string');
      expect(s.desc.trim(), `${s.key} desc 非空`).toBeTruthy();
      expect(typeof s.example, `${s.key} 缺 example`).toBe('string');
      expect(s.example.trim(), `${s.key} example 非空`).toBeTruthy();
      expect(typeof s.dynamic, `${s.key} dynamic 必须是 boolean`).toBe('boolean');
    }
  });

  it('常用键在册：refresh_interval / number_of_replicas / blocks.* / translog.* / slowlog / mapping.* / codec / number_of_shards', () => {
    const keys = SETTINGS_CATALOG.map(s => s.key);
    for (const k of [
      'refresh_interval', 'number_of_replicas', 'max_result_window',
      'blocks.read_only', 'blocks.write', 'blocks.read', 'blocks.metadata',
      'routing.allocation.total_shards_per_node', 'highlight.max_analyzed_offset',
      'translog.durability', 'translog.sync_interval',
      'merge.policy.segments_per_tier', 'merge.policy.max_merged_segment',
      'indexing.slowlog.threshold.index.warn', 'search.slowlog.threshold.query.warn',
      'mapping.nested_objects.limit', 'mapping.total_fields.limit',
      'gc_deletes', 'soft_deletes.retention_lease.period',
      'max_script_fields', 'max_regex_length', 'routing.allocation.enable',
      'auto_expand_replicas', 'priority', 'hidden',
      'codec', 'number_of_shards', 'analysis.analyzer.*',
    ]) {
      expect(keys, `目录必须收录 ${k}`).toContain(k);
    }
  });
});

describe('filterSettings 纯函数', () => {
  it('空关键词：cap 30，按 key 字母序', () => {
    const out = filterSettings('');
    expect(out.length, '空关键词必须 cap 在 30 条').toBe(30);
    const keys = out.map(s => s.key);
    const sorted = [...keys].sort((a, b) => a.localeCompare(b));
    expect(keys, '空关键词结果按 key 字母序').toEqual(sorted);
  });

  it('前缀匹配优先于包含匹配：max_* 前缀全部排在 highlight.max_analyzed_offset 之前', () => {
    const out = filterSettings('max');
    const keys = out.map(s => s.key);
    expect(keys).toContain('highlight.max_analyzed_offset');
    const hlIdx = keys.indexOf('highlight.max_analyzed_offset');
    const prefixIdx = keys
      .map((k, i) => ({ k, i }))
      .filter(x => x.k.startsWith('max'))
      .map(x => x.i);
    expect(prefixIdx.length, 'max 前缀命中应有多条').toBeGreaterThanOrEqual(4);
    expect(Math.max(...prefixIdx), '所有 max_* 前缀项必须排在包含命中项之前').toBeLessThan(hlIdx);
    /* 前缀组内部按字母序 */
    const prefixKeys = prefixIdx.map(i => keys[i]);
    expect(prefixKeys).toEqual([...prefixKeys].sort((a, b) => a.localeCompare(b)));
  });

  it('key 过滤大小写不敏感', () => {
    const out = filterSettings('REFRESH');
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].key).toBe('refresh_interval');
  });

  it('中文 desc 命中', () => {
    const keys = filterSettings('副本').map(s => s.key);
    expect(keys).toContain('number_of_replicas');
    expect(keys).toContain('auto_expand_replicas');
  });

  it('desc 大小写对称：搜小写 ccr 命中 desc 含「CCR」的条目', () => {
    const keys = filterSettings('ccr').map(s => s.key);
    expect(keys, 'desc 过滤必须与 key 一样大小写不敏感').toContain('soft_deletes.enabled');
  });

  it('无匹配返回空数组', () => {
    expect(filterSettings('zzz-no-such-setting')).toEqual([]);
  });
});

describe('SettingsKeyInput 组件行为', () => {
  it('focus 出层：静态目录直出（cap 30），徽标「静态/热更」齐，hint 行显示首项 example', async () => {
    const { host } = await mountInput();
    expect(pop(), '未 focus 不出层').toBeNull();
    await focus(host);
    expect(pop(), 'focus 必须出层').toBeTruthy();
    expect(items().length, '空关键词 cap 30').toBe(30);
    expect(itemKeys()[0], '字母序首项').toBe('analysis.analyzer.*');
    const firstBadges = Array.from(pop()!.querySelectorAll('.skp-badge')).map(el => el.textContent);
    expect(firstBadges).toContain('静态');
    expect(firstBadges).toContain('热更');
    expect(foot()!.textContent, 'hint 行必须显示首项 example').toContain('{"type":"custom","tokenizer":"standard"}');
  });

  it('输入过滤出层：refres → refresh_interval，徽标「热更」，hint 行跟随', async () => {
    const { host } = await mountInput();
    await focus(host);
    await type(host, 'refres');
    /* 560 同步更新：SETTINGS_CATALOG 补 max_refresh_listeners（contains 命中 'refres'）——
       原契约意图保持：前缀命中优先，refresh_interval 仍居首（徽标/hint 行跟随断言零改），
       contains 组员按字母序殿后 */
    expect(itemKeys()).toEqual(['refresh_interval', 'max_refresh_listeners']);
    const badge = pop()!.querySelector('.skp-item .skp-badge')!;
    expect(badge.textContent).toBe('热更');
    expect(foot()!.textContent).toContain('1s / 30s / -1（禁用）');
  });

  it('↑↓ 键盘导航移动高亮项，hint 行 example 跟随选中项', async () => {
    const { host } = await mountInput();
    await focus(host);
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), '打开默认高亮首项').toBe(0);
    await key(host, 'ArrowDown');
    expect(actIdx(), '↓ 落到第二项').toBe(1);
    expect(foot()!.textContent, 'hint 必须跟随第二项 example').toContain('0-1 / 0-all / false');
    await key(host, 'ArrowUp');
    expect(actIdx(), '↑ 回首项').toBe(0);
    expect(foot()!.textContent).toContain('{"type":"custom","tokenizer":"standard"}');
  });

  it('Enter 回填：v-model 更新 + picked 发出 + 面板关闭', async () => {
    const { host, state, picked } = await mountInput();
    await focus(host);
    await type(host, 'refres');
    await key(host, 'Enter');
    expect(state.modelValue).toBe('refresh_interval');
    expect(picked).toEqual(['refresh_interval']);
    await flushLeave();
    expect(pop(), '选择后面板必须关闭').toBeNull();
  });

  it('鼠标点击选项：choose 回填 v-model + picked 发出 + 面板关闭', async () => {
    const { host, state, picked } = await mountInput();
    await focus(host);
    await type(host, 'refres');
    items()[0].click();
    await settle();
    expect(state.modelValue).toBe('refresh_interval');
    expect(picked).toEqual(['refresh_interval']);
    await flushLeave();
    expect(pop(), '点击选择后面板必须关闭').toBeNull();
  });

  it('IME 组合态 Enter 守卫：isComposing keydown 不触发 choose，手输值保留、弹层不收', async () => {
    const { host, state, picked } = await mountInput();
    await focus(host);
    await type(host, 'refres');
    inp(host).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true }));
    await settle();
    expect(state.modelValue, 'IME 组合态 Enter 不许替换手输值').toBe('refres');
    expect(picked, 'IME 组合态 Enter 不许发 picked').toEqual([]);
    expect(pop(), 'IME 组合态 Enter 后弹层保持打开').toBeTruthy();
  });

  it('Esc 关层：手输值保留，不强制改成目录键', async () => {
    const { host, state } = await mountInput();
    await focus(host);
    await type(host, 'my.custom.setting');
    await key(host, 'Escape');
    expect(state.modelValue, '手输值必须保留').toBe('my.custom.setting');
    await flushLeave();
    expect(pop(), 'Esc 后弹层必须关闭').toBeNull();
  });

  it('无匹配：出「仍可手输」提示，Enter 收面板保留手输值（退化纯手输）', async () => {
    const { host, state, picked } = await mountInput();
    await focus(host);
    await type(host, 'zzz-no-such-setting');
    expect(items().length, '无匹配不出列表').toBe(0);
    expect(pop()!.textContent).toContain('仍可手输');
    await key(host, 'Enter');
    expect(state.modelValue, '手输值必须保留').toBe('zzz-no-such-setting');
    expect(picked, '无匹配 Enter 不许发 picked').toEqual([]);
    await flushLeave();
    expect(pop(), 'Enter 后收面板').toBeNull();
  });

  it('点击外部关闭弹层', async () => {
    const { host } = await mountInput();
    await focus(host);
    expect(pop()).toBeTruthy();
    document.body.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    /* 先 settle 让 open=false 的渲染与 leave 起步落定，再 flushLeave 等离场帧（同 key() 助手内置 settle 的时序） */
    await settle();
    await flushLeave();
    expect(pop(), '点击外部必须关层').toBeNull();
  });

  /* ==== W2 T7a 评审修复：mouseenter 路径覆盖（模板 @mouseenter="cursor = i" 直接赋值解构 ref 的隐式契约保险） ==== */

  it('mouseenter 移动高亮项：鼠标悬停第二项 → act 落在第二项', async () => {
    const { host } = await mountInput();
    await focus(host);
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), '打开默认高亮首项').toBe(0);
    items()[1].dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    expect(actIdx(), 'mouseenter 后高亮必须移到第二项').toBe(1);
  });

  it('mouseenter 高亮移动后：hint 行 example 跟随鼠标高亮项', async () => {
    const { host } = await mountInput();
    await focus(host);
    expect(foot()!.textContent, '打开默认显示首项 example').toContain('{"type":"custom","tokenizer":"standard"}');
    items()[1].dispatchEvent(new MouseEvent('mouseenter'));
    await settle();
    const actIdx = () => items().findIndex(el => el.classList.contains('act'));
    expect(actIdx(), 'mouseenter 后高亮必须移到第二项').toBe(1);
    expect(foot()!.textContent, 'hint 必须跟随鼠标高亮项 example').toContain('0-1 / 0-all / false');
  });
});
