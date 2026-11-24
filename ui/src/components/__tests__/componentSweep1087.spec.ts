/**
 * 组件层普通文本框清零；值建议组件本体登记豁免。通用组件内嵌的裸 <input> 收敛到
 * TextInput（文本）/ NInput password 档（密码型凭据，原生遮蔽 + 点击显形）。
 * 三层锁面：
 *  A. 全量清零——19 个目标组件源码不再出现裸 <input 标签；值建议输入组件本体
 *     （自带弹层/键盘导航的复合统一件，与 TextInput 平级）显式登记豁免：其内部
 *     <input> 是实现层承载（同 TextInput 之于原生 input），不在清零域；
 *  B. 形态锁——每文件至少 1 例：收敛件与皮肤锚类（input-class 落真实 input）、
 *     placeholder/aria/id 等属性保留、布局承载（:deep 落输入件根容器）不缺位；
 *     少量轻组件追加挂载行为锁（输入回写 / Enter / Esc 事件通道零漂移）；
 *  C. 裸 table 收编——MappingFieldTree 字段表壳迁 MiniTable（富行经 #rows 槽自带）。
 * 既有行为锁（clusterConnAuthType / remoteSourceFields / w10ReduceSteps525 /
 *  colFilterFocus1122 / docDiffFilter287 等）继续独立生效，此处不重复其断言。
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import TableQSearch from '../TableQSearch.vue';
import HitNav from '../HitNav.vue';
import ColFilterPopover from '../ColFilterPopover.vue';
import RemoteSourceFields from '../RemoteSourceFields.vue';

const comp = (f: string) => readFileSync(join(__dirname, '..', f), 'utf-8');

const FILES = [
  'ClusterSwitcher.vue',
  'SetupWizard.vue',
  'ColFilterPopover.vue',
  'ColPicker.vue',
  'BrowserConnect.vue',
  'CreateIndexModal.vue',
  'LoginOverlay.vue',
  'DocDiffModal.vue',
  'TableQSearch.vue',
  'HitNav.vue',
  'TablePresetMenu.vue',
  'ReconcileReportDrawer.vue',
  'RemoteSourceFields.vue',
  'CmdPalette.vue',
  'SettingsGrid.vue',
  'Pagination.vue',
  'JsonTree.vue',
  'SearchFilterBar.vue',
  'SideNav.vue',
];

/* 值建议输入组件本体（豁免登记）：SuggestInput / LuceneInput / IndexPicker /
   SettingsKeyInput / FieldPicker / devtools EndpointPathInput——自带候选弹层与
   键盘导航的复合统一件，与 TextInput 平级；内部 <input> 是实现层，不迁不清 */
const SUGGEST_INPUT_FILES = [
  'SuggestInput.vue',
  'LuceneInput.vue',
  'IndexPicker.vue',
  'SettingsKeyInput.vue',
  'FieldPicker.vue',
  'devtools/EndpointPathInput.vue',
];

const NO_BARE_INPUT = /<input[\s>]/;

/* 挂载通用：独立 host + 卸载清场（happy-dom 下 document.body 全局共享） */
const apps: { unmount: () => void }[] = [];
function mount(render: () => any) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render });
  app.mount(host);
  apps.push(app);
  return host;
}
beforeEach(() => {
  apps.forEach(a => { try { a.unmount(); } catch { /* 已卸载 */ } });
  apps.length = 0;
  document.body.innerHTML = '';
});

/* 原生 setter 喂值（绕过 happy-dom 的 value 属性拦截，与既有输入类 spec 同手法） */
function nativeSet(el: HTMLInputElement, v: string) {
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function settle(n = 4) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

describe('A：组件层普通文本框全量清零；值建议组件本体登记豁免', () => {
  it('19 个目标组件源码无裸 <input 标签', () => {
    const offenders = FILES.filter(f => NO_BARE_INPUT.test(comp(f)));
    expect(offenders.join(','), '仍含裸 input 的文件').toBe('');
  });

  it('值建议组件本体（6 件）登记豁免：自带弹层/键盘导航的复合输入件，内部 input 是实现层承载', () => {
    for (const f of SUGGEST_INPUT_FILES) {
      expect(comp(f), f + ' 值建议本体在场（内部裸 input 属实现层，不属清零域）').toMatch(NO_BARE_INPUT);
    }
    /* 豁免域与清零域不相交：豁免件不在 FILES 清单里重复登记 */
    expect(FILES.filter(f => SUGGEST_INPUT_FILES.includes(f)).join(','), '豁免件不得同时进清零清单').toBe('');
  });
});

describe('B1：ClusterSwitcher / SetupWizard / BrowserConnect（连接与首连表单）', () => {
  it('ClusterSwitcher：五输入收敛统一件，label for ↔ id 关联保留；凭据两框 NInput password 档', () => {
    const s = comp('ClusterSwitcher.vue');
    for (const k of ['name', 'url', 'user']) {
      expect(s, k + ' 输入收敛 TextInput 且 id 关联保留').toMatch(new RegExp(`<TextInput v-model\\.trim="form\\.[a-z]+" :id="'cs-${k}-' \\+ uid" input-class="ipt( mono)?"`));
    }
    /* 凭据框 NInput password 档原生遮蔽（Firefox 无 -webkit-text-security 圆点遮蔽会露明文，
       SecurityView/SetupWizard 同款口径）；id/autocomplete 经 input-props 落真实 input 维持 label 关联；
       autocomplete=new-password（新凭据录入语义，较 off 更稳地阻断浏览器自动填充） */
    for (const k of ['pass', 'key']) {
      expect(s, k + ' 凭据框 NInput password 档且真实 input 带 id').toContain(`:input-props="{ id: 'cs-${k}-' + uid, autocomplete: 'new-password' }"`);
    }
    expect(s).not.toContain('pw-mask');
  });

  it('SetupWizard：地址/用户名 TextInput（.sw-ipt 挂载锚保留），密码/首连令牌 NInput password 档且 autocomplete 语义正确', () => {
    const s = comp('SetupWizard.vue');
    expect(s).toMatch(/<TextInput v-model\.trim="url" input-class="ipt sw-ipt mono" placeholder="http:\/\/es-host:9200" autofocus/);
    expect(s).toMatch(/<TextInput v-model\.trim="username" input-class="ipt sw-ipt" autocomplete="off"/);
    /* 首连建档 = 新密码语义；首连令牌同为新凭据录入，autocomplete=new-password 防自动填充更稳 */
    expect(s).toMatch(/<n-input v-model:value="password" type="password" show-password-on="click"[^>]*\r?\n\s*:input-props="\{ autocomplete: 'new-password' \}"/);
    expect(s).toMatch(/<n-input v-model:value="setupToken" type="password" show-password-on="click"[^>]*\r?\n\s*:input-props="\{ autocomplete: 'new-password' \}"/);
    expect(s.match(/@keydown\.enter\.prevent="onSubmit"/g)!, 'Enter 一键串联四处字面保留（w10 锁面）').toHaveLength(4);
  });

  it('BrowserConnect：地址/用户名 TextInput，密码/API Key 走 NInput password 档（凭据 autocomplete=new-password）', () => {
    const s = comp('BrowserConnect.vue');
    expect(s).toMatch(/<TextInput ref="urlInput" v-model\.trim="url" input-class="ipt bc-ipt mono" placeholder="http:\/\/es-host:9200" @keyup\.enter="connect"/);
    expect(s).toMatch(/<TextInput v-model\.trim="username" input-class="ipt bc-ipt" autocomplete="off"/);
    expect((s.match(/type="password" show-password-on="click"/g) ?? []).length, '密码与 API Key 两处 password 档').toBe(2);
    expect((s.match(/\{ autocomplete: 'new-password' \}/g) ?? []).length, '两处凭据 autocomplete=new-password').toBe(2);
  });
});

describe('B2：LoginOverlay / CreateIndexModal（登录与新建索引）', () => {
  it('LoginOverlay：用户名 TextInput + autocomplete=username（与 current-password 配对）+ autofocus 保留；登录密码 NInput password 档（current-password）', () => {
    const s = comp('LoginOverlay.vue');
    expect(s).toMatch(/<TextInput v-model\.trim="username" input-class="ipt lo-ipt" placeholder="admin" autocomplete="username" autofocus/);
    expect(s).toMatch(/<n-input v-model:value="password" type="password" show-password-on="click"[^>]*\r?\n\s*:input-props="\{ autocomplete: 'current-password' \}"/);
  });

  it('CreateIndexModal：索引名/别名收敛 TextInput，Enter 提交与别名门控字面保留', () => {
    const s = comp('CreateIndexModal.vue');
    expect(s).toMatch(/<TextInput ref="nameRef" v-model="name" input-class="inp mono" placeholder="如 my-index-2026"\r?\n\s+@keydown\.enter="canSubmit && canCreate && doCreate\(\)"/);
    expect(s).toMatch(/<TextInput v-model="alias" input-class="inp mono" placeholder="创建后原子挂载"\r?\n\s+:disabled="!canAlias" v-tip="'别名挂载需别名管理权限'"/);
    expect(s).toMatch(/\.cim-row > :deep\(\.ti\)/);
  });
});

describe('B3：ColFilterPopover / ColPicker / DocDiffModal / TablePresetMenu / ReconcileReportDrawer（源码形态锁）', () => {
  it('ColFilterPopover：值内搜索/包含词/区间双输入收敛 TextInput，皮肤锚类经 input-class 落内层 input', () => {
    const s = comp('ColFilterPopover.vue');
    expect(s).toMatch(/<TextInput v-if="search" :model-value="kw" input-class="cfp-kw mono"/);
    expect(s).toMatch(/<TextInput v-if="contains" :model-value="containsVal" input-class="cfp-kw mono"/);
    expect((s.match(/input-class="cfp-range-in mono"/g) ?? []).length, '区间 min/max 双输入').toBe(2);
    /* 布局承载：下间隔/区间弹性落输入件根容器；焦点环皮肤平移到全局规则（1122 锁面同源） */
    expect(s).toMatch(/\.cfp > :deep\(\.ti\) \{ margin-bottom: var\(--sp-1\); \}/);
    expect(s).toMatch(/\.cfp-range :deep\(\.ti\) \{ flex: 1; min-width: 0; \}/);
    expect(s).toMatch(/\.cfp input\.cfp-kw:focus \{ border-color: var\(--ac\); box-shadow: var\(--focus-ring\); \}/);
    expect(s).toMatch(/\.cfp input\.cfp-range-in:focus \{ border-color: var\(--ac\); box-shadow: var\(--focus-ring\); \}/);
  });

  it('ColPicker：字段搜索收敛 TextInput（.inp 皮肤锚 + 下间隔经 :deep 承载）', () => {
    const s = comp('ColPicker.vue');
    expect(s).toMatch(/<TextInput v-if="cols\.length > 8" v-model="kw" input-class="inp" placeholder="搜字段…" \/>/);
    expect(s).toMatch(/\.col-pick > :deep\(\.ti\) \{ margin-bottom: var\(--sp-1\); \}/);
  });

  it('DocDiffModal：字段路径过滤收敛 TextInput（锚类/aria 保留，180px 定宽经 :deep 承载）', () => {
    const s = comp('DocDiffModal.vue');
    expect(s).toMatch(/<TextInput v-model="pathKw" input-class="ddm-filter mono" placeholder="按字段路径过滤…" aria-label="按字段路径过滤" \/>/);
    expect(s).toMatch(/\.ddm-stat :deep\(\.ti\) \{ flex: 0 1 180px; \}/);
  });

  it('TablePresetMenu：方案名收敛 TextInput（.tpm-inp 挂载锚保留，弹性份额经 :deep 承载）', () => {
    const s = comp('TablePresetMenu.vue');
    expect(s).toMatch(/<TextInput v-model="name" input-class="inp tpm-inp" placeholder="方案名…" aria-label="方案名" @keydown\.enter\.prevent="doSave" \/>/);
    expect(s).toMatch(/\.tpm-save > :deep\(\.ti\) \{ flex: 1; min-width: 0; \}/);
  });

  it('ReconcileReportDrawer：过滤输入收敛 TextInput（200px 定宽经 :deep 承载，24px 定高留皮肤类）', () => {
    const s = comp('ReconcileReportDrawer.vue');
    expect(s).toMatch(/<TextInput v-model="kw" input-class="ipt rr-kw" placeholder="过滤：状态 \/ 索引 \/ 说明…" aria-label="过滤对账记录" \/>/);
    expect(s).toMatch(/\.rr-tools > :deep\(\.ti\) \{ flex: 0 1 200px; \}/);
  });
});

describe('B4：清单外六件形态锁（CmdPalette / SettingsGrid / Pagination / JsonTree / SearchFilterBar / SideNav）', () => {
  it('CmdPalette：查询框收敛 TextInput（pal-input 皮肤锚落真实 input，方向键/Enter/Esc/Tab 键位经 attrs 透传）', () => {
    const s = comp('CmdPalette.vue');
    expect(s).toMatch(/<TextInput\r?\n\s+ref="inpRef"\r?\n\s+v-model="query"\r?\n\s+input-class="pal-input"/);
    expect(s).toMatch(/@keydown\.down\.prevent="move\(1\)"/);
    expect(s).toMatch(/@keydown\.enter\.prevent="run\(rows\[active\]\?\.c\)"/);
    expect(s).toMatch(/@keydown\.esc="close"/);
    expect(s).toMatch(/\.pal-input-row > :deep\(\.ti\) \{ flex: 1; min-width: 0; \}/);
    expect(s).toMatch(/\.pal-input-row :deep\(\.pal-input\)/);
  });

  it('SettingsGrid：过滤框收敛 TextInput（ipt/mono/sg-filter 皮肤锚保留，Enter 定位键位经 attrs 透传）', () => {
    const s = comp('SettingsGrid.vue');
    expect(s).toMatch(/<TextInput\r?\n\s+v-model\.trim="kw" input-class="ipt mono sg-filter" :placeholder="filterPlaceholder"\r?\n\s+@keydown\.enter\.prevent="onHitKey"\r?\n\s+\/>/);
    expect(s).toMatch(/\.sg-bar > :deep\(\.ti\) \{ flex: 1; min-width: 0; max-width: 480px; \}/);
    expect(s).toMatch(/\.sg-bar :deep\(\.sg-filter\)/);
  });

  it('Pagination：页码跳转收敛 TextInput（字符串页码流转，Enter/blur 归位接线经 attrs 落真实 input）', () => {
    const s = comp('Pagination.vue');
    expect(s).toMatch(/<TextInput\r?\n\s+:model-value="String\(page\)" input-class="pgn-jump" :disabled="disabled"/);
    expect(s).toMatch(/@keydown\.enter\.prevent="jump\(\$event\)"/);
    expect(s).toMatch(/@blur="jump\(\$event\)"/);
    expect(s).toMatch(/\.pgn > :deep\(\.ti\) \{ width: 3\.5em; \}/);
    expect(s).toMatch(/\.pgn :deep\(\.pgn-jump\)/);
  });

  it('JsonTree：节点过滤收敛 TextInput（jt-kw 皮肤锚落真实 input，Enter 定位键位经 attrs 透传）', () => {
    const s = comp('JsonTree.vue');
    expect(s).toMatch(/<TextInput\r?\n\s+v-model="kw" input-class="jt-kw" placeholder="搜字段\/值…"\r?\n\s+@keydown\.enter\.prevent="onHitKey"\r?\n\s+\/>/);
    expect(s).toMatch(/\.jt-tools > :deep\(\.ti\) \{ width: 130px; \}/);
    expect(s).toMatch(/\.jt-tools :deep\(\.jt-kw\)/);
  });

  it('SearchFilterBar：内嵌输入收敛 TextInput（sfb-i+inputClass 皮肤锚落真实 input，Enter/Esc 键位经 attrs 透传）', () => {
    const s = comp('SearchFilterBar.vue');
    expect(s).toMatch(/:input-class="\['sfb-i', inputClass\]\.filter\(Boolean\)\.join\(' '\)"/);
    expect(s).toMatch(/@keydown\.enter\.prevent="\$emit\('enter', \$event\)"/);
    expect(s).toMatch(/@keydown\.esc\.prevent="\$emit\('update:modelValue', ''\)"/);
    expect(s).toMatch(/\.sfb > :deep\(\.ti\) \{ flex: 1; min-width: 0; \}/);
    expect(s).toMatch(/\.sfb :deep\(\.sfb-i\)/);
  });

  it('SideNav：导航搜索收敛 TextInput（nav-search-in 皮肤锚落真实 input，Esc(.stop) 经 attrs 透传）', () => {
    const s = comp('SideNav.vue');
    expect(s).toMatch(/<TextInput\r?\n\s+ref="searchEl"\r?\n\s+v-model="navQuery"\r?\n\s+input-class="nav-search-in"/);
    expect(s).toMatch(/placeholder="搜索功能 \/"/);
    expect(s).toMatch(/@keydown\.esc\.stop="navQuery = ''"/);
    expect(s).toMatch(/\.nav-search > :deep\(\.ti\) \{ flex: 1; min-width: 0; \}/);
    expect(s).toMatch(/\.nav-search :deep\(\.nav-search-in\)/);
  });
});

describe('B5：TableQSearch 挂载（输入件收敛后事件通道零漂移）', () => {
  it('渲染 input.rt-qsearch-inp；输入回写 update:kw；Esc 清空 / Enter 转发', async () => {
    const got: string[] = [];
    let enter = 0;
    mount(() => h(TableQSearch, {
      qCls: 'rt-qsearch', on: true, kw: 'ab',
      'onUpdate:kw': (v: string) => { got.push(v); },
      onEnter: () => { enter++; },
    } as any));
    await settle();

    const inp = document.querySelector('input.rt-qsearch-inp') as HTMLInputElement;
    expect(inp, '皮肤锚类随 input-class 落真实 input').toBeTruthy();
    expect(inp.placeholder).toBe('搜索结果…');
    expect(inp.getAttribute('aria-label')).toBe('快速过滤：跨可见列包含匹配');

    nativeSet(inp, 'xy');
    await settle();
    expect(got, '输入经 @input 透传回写 update:kw').toEqual(['xy']);

    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(got, 'Esc 清空').toEqual(['xy', '']);

    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await settle();
    expect(enter, 'Enter 定向转发').toBe(1);
  });
});

describe('B6：HitNav 挂载（可选输入收敛后 v-model/Enter 语义不变）', () => {
  it('传 modelValue 渲染 input.hn-inp；输入回写 update:modelValue；Enter/Shift+Enter 分流', async () => {
    const got: string[] = [];
    let next = 0; let prev = 0;
    mount(() => h(HitNav, {
      count: 3, current: 1, modelValue: 'x',
      'onUpdate:modelValue': (v: string) => { got.push(v); },
      onNext: () => { next++; },
      onPrev: () => { prev++; },
    } as any));
    await settle();

    const inp = document.querySelector('.hn input.hn-inp') as HTMLInputElement;
    expect(inp, '皮肤锚类随 input-class 落真实 input').toBeTruthy();
    expect(inp.getAttribute('aria-label')).toBe('表内搜索');

    nativeSet(inp, 'ti');
    await settle();
    expect(got).toEqual(['ti']);

    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(next, 'Enter=下一个').toBe(1);
    expect(prev, 'Shift+Enter=上一个').toBe(1);
  });
});

describe('B7：ColFilterPopover 挂载（值内搜索/区间/包含词三通道）', () => {
  it('值内搜索输入回写 update:kw；区间 min/max 回写 set-range；包含词回写 set-contains', async () => {
    const events: Record<string, unknown[][]> = {};
    const rec = (k: string) => (...args: unknown[]) => { (events[k] ??= []).push(args); };
    mount(() => h(ColFilterPopover as any, {
      col: 'name', x: 8, y: 8,
      vals: [{ v: 'a', n: 1 }], total: 1,
      selected: [], normOf: (v: unknown) => String(v),
      search: true, kw: '',
      range: true, rangeMin: '', rangeMax: '',
      contains: true, containsVal: '',
      'onUpdate:kw': rec('update:kw'),
      'onSet-range': rec('set-range'),
      'onSet-contains': rec('set-contains'),
    }));
    await settle();

    const kwInp = document.querySelector('.cfp input.cfp-kw') as HTMLInputElement;
    expect(kwInp, '值内搜索锚类落真实 input').toBeTruthy();
    nativeSet(kwInp, 'an');
    await settle();
    expect(events['update:kw']).toEqual([['an']]);

    const rangeIns = [...document.querySelectorAll('.cfp .cfp-range-in')] as HTMLInputElement[];
    expect(rangeIns.length, '区间双输入').toBe(2);
    nativeSet(rangeIns[0]!, '3');
    nativeSet(rangeIns[1]!, '9');
    await settle();
    expect(events['set-range']).toEqual([['min', '3'], ['max', '9']]);

    const containsInp = ([...document.querySelectorAll('.cfp input.cfp-kw')] as HTMLInputElement[])[1]!;
    nativeSet(containsInp, 'ok');
    await settle();
    expect(events['set-contains']).toEqual([['ok']]);
  });
});

describe('B8：RemoteSourceFields 挂载（三件收敛后 DOM 锚点与密码口径不变）', () => {
  it('host/用户名/密码三输入仍在 .xm-conn 下（占位符锚点不变）；密码 NInput password 档 + autocomplete=new-password', async () => {
    let got: unknown = null;
    mount(() => h(RemoteSourceFields, {
      hostRaw: true,
      conn: { scheme: 'https', host: 'https://h:9200', port: 9200, username: '', password: '' },
      'onUpdate:conn': (v: unknown) => { got = v; },
    } as any));
    await settle();

    const hostInp = document.querySelector('.xm-conn input[placeholder^="host"]') as HTMLInputElement;
    expect(hostInp.value, 'host 段拆解显示').toBe('h');
    nativeSet(hostInp, 'h2');
    await settle();
    expect((got as any)?.host, '编辑拼回完整串').toBe('https://h2:9200');

    const pwd = document.querySelector('.xm-conn input[type="password"]') as HTMLInputElement;
    expect(pwd, '密码口径：NInput password 档原生遮蔽').toBeTruthy();
    expect(pwd.getAttribute('autocomplete'), '新凭据录入语义防自动填充').toBe('new-password');
    expect(document.querySelector('.xm-conn input.pw-mask'), 'pw-mask 形态退役').toBeNull();

    /* 布局承载：文本两件 flex 经 :has 下探 TextInput 壳；密码框 flex 直接落 NInput 根 */
    const s = comp('RemoteSourceFields.vue');
    expect(s).toMatch(/\.xm-conn > :deep\(\.ti:has\(\.rsf-host\)\) \{ flex: 2; \}/);
    expect(s).toMatch(/\.xm-conn > :deep\(\.n-input\) \{ flex: 1; min-width: 130px; \}/);
  });
});

describe('C：MappingFieldTree 字段表壳收编 MiniTable（裸 table 清零）', () => {
  it('表头三列走列声明（类型列 110px 定宽），富行经 #rows 槽原样自带，源码不再有裸 <table>', () => {
    const s = comp('MappingFieldTree.vue');
    expect(s, '裸 table 清零（表壳归 MiniTable 统一件）').not.toMatch(/<table[\s>]/);
    expect(s).toMatch(/<MiniTable :columns="mftCols">/);
    expect(s).toMatch(/<template #rows>/);
    expect(s).toMatch(/\{ key: 'name', label: '字段' \}/);
    expect(s).toMatch(/\{ key: 'type', label: '类型', width: '110px' \}/);
    expect(s).toMatch(/\{ key: 'attrs', label: '属性' \}/);
  });
});
