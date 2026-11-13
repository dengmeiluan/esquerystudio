/**
 * 七百七十二批：BoostTuner 首刀三刀（R152；⑥771 头号建议落地=R151 裁决表
 * G245+G246+G247；741 G148/743 G152/745/747/749/751/753/755/757/760/762/764/
 * 766/768/770 首刀族同构；本页首例真挂载首刀后 spec——progressLink557 同源挂载/
 * mock 形态：视图/组件全真，只 mock ../api 出口；hash 深链 ?idx=；fields 写入走
 * setupState 直写〔767-③ 课：FieldPicker usePopupList 弹层手输复杂〕）。
 *
 * ① G245（P3 死代码·头名）bt- 五死类=页头四伴（bt-hd-l/-ic/-sub/-r，PageHeader
 *    合并漏删族——713 G53/715 G56/717 G61/721 G72/727 G86/729 G94/737 G131/741
 *    G147/761 G220/766 G232 同族）+.bt-ii（IndexPicker 退役伴漏删=764 .as-ii/
 *    766 .mm-ii 同款再演）+.ell/.dim scoped 规则各双份重复（QRT cell 段与箭头段
 *    各一份=纯重复）——修法=七规则整删零连锁；bt- 规则块 37→32 恰减五；
 *    flattenWave557 ④ .bt-ii 字面锁同步更新（正向锁改负向锚=760 先例死类版）。
 * ② G246（P3 铁律 D·次刀）跑基准钮 Anchor 单态→Loader2/Anchor 双态+「跑基准中…」
 *    在途文案（lastMode 门控=共享 busy 下只由本钮发起的执行亮文案，768 G238/
 *    766 G234/770 G241 族）+G246b 随批升格：重跑对比钮「重跑中…」文案通道
 *    （G244 纯文本口径；RefreshCw spinning 既有绑定不动）。
 * ③ G247（弱 P3 aria·随批可裁）bt-slider 补动态 aria-label（字段名+权重倍数）
 *    +bt-dropped 补 role=status（掉出=异步结果到达语义公告；G192/G224/G235 族）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/BoostTunerView.vue'), 'utf-8');

const HITS_A = [
  { _id: 'd1', _score: 2 },
  { _id: 'd2', _score: 1 },
];
/* 掉出场景：d1 掉出+d-new 新建 */
const HITS_B = [
  { _id: 'd2', _score: 3 },
  { _id: 'd-new', _score: 2.5 },
];

const searchRawFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      clusterIndices: vi.fn(async () => []),
      mappingDetail: vi.fn(async () => ({ raw: { properties: { name: { type: 'text' }, memo: { type: 'text' } } } })),
      searchRaw: (...a: any[]) => searchRawFn(...a),
    },
  };
});

import BoostTunerView from '../views/BoostTunerView.vue';

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountBt() {
  location.hash = '#/boost-tuner?idx=t1';
  const router = createRouter({
    history: createWebHashHistory(),
    routes: [{ path: '/:p(.*)*', component: BoostTunerView }],
  });
  const app = createApp({ render: () => h(BoostTunerView) });
  app.use(createPinia());
  app.use(router);
  await router.isReady();
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return { app, host };
}

/* fields 直写通道（767-③ 课）：FieldPicker usePopupList 弹层组件手输复杂→setupState 直写 */
function writeFields(host: HTMLElement, arr: { name: string; boost: number }[]) {
  const el = host.querySelector('.bt-page') as any;
  let inst = el?.__vueParentComponent;
  let hops = 0;
  while (inst && !(inst.setupState && 'fields' in inst.setupState) && hops < 30) { inst = inst.parent; hops++; }
  expect(inst, 'BoostTunerView 实例可达（setupState 含 fields）').toBeTruthy();
  inst.setupState.fields = arr;
}

function setKw(host: HTMLElement, tx: string) {
  const el = host.querySelector<HTMLInputElement>('.bt-kw')!;
  const st = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  st.call(el, tx);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

const baseBtnOf = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLButtonElement>('.bt-actions button')].find(b => (b.textContent || '').includes('跑基准'));
const cmpBtnOf = (host: HTMLElement) =>
  [...host.querySelectorAll<HTMLButtonElement>('.bt-actions button')].find(b => /重跑对比|重跑中/.test(b.textContent || ''));

async function fillAndUnlock(host: HTMLElement) {
  setKw(host, '手机');
  writeFields(host, [{ name: 'name', boost: 1 }]);
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  location.hash = '';
  searchRawFn.mockReset().mockResolvedValue({ hits: { hits: HITS_A } });
});

describe('772 A0 挂载不变量负锚（现状即守卫，非刀面）', () => {
  it('页头四 action 钮+手动模式默认+空表单四钮锁+引导空态+加字段钮', async () => {
    const { app, host } = await mountBt();
    expect(host.textContent).toContain('Boost 调参沙盒');
    const sw = host.querySelector<HTMLInputElement>('.bt-switch input[type=checkbox]');
    expect(sw, 'live 开关在场').toBeTruthy();
    expect(sw!.checked, '默认手动模式（不打爆生产）').toBe(false);
    const btns = [...host.querySelectorAll<HTMLButtonElement>('.bt-actions button')];
    expect(btns.length).toBe(4);
    expect(btns.every(b => b.disabled), '空表单四钮全锁（canRun 守卫）').toBe(true);
    expect([...host.querySelectorAll('button')].some(b => b.textContent?.includes('加字段'))).toBe(true);
    expect(host.textContent).toContain('尚无排名对比结果');
    app.unmount();
  });
});

describe('772 G245 七死规则整删（死代码·头名·页头四伴+IndexPicker 退役伴+ell/dim 双份）', () => {
  it('源码锁：五死类 scoped 定义绝迹（模板本就零引用；-ic 负向锚收词界防误伤活类）', () => {
    expect(src, '页头四伴之一死规则须删').not.toMatch(/\.bt-hd-l\b/);
    expect(src, '页头四伴之二死规则须删（活类无 -ic 前缀冲突，词界锚）').not.toMatch(/\.bt-hd-ic\s*\{/);
    expect(src, '页头四伴之三死规则须删').not.toMatch(/\.bt-hd-sub\b/);
    expect(src, '页头四伴之四死规则须删').not.toMatch(/\.bt-hd-r\b/);
    expect(src, 'IndexPicker 退役伴漏删死规则须删（764 .as-ii/766 .mm-ii 同款）').not.toMatch(/\.bt-ii\b/);
  });
  it('scoped 计数：bt- 规则块恰 32（771 盘点 37 恰减五）+.ell/.dim 规则各恰 1（双份去重）', () => {
    const style = src.slice(src.indexOf('<style scoped>'), src.indexOf('</style>'));
    const btRules = style.match(/^\.bt-[a-z0-9-]+[^{\n]*\{/gm) || [];
    expect(btRules.length, '「.bt-」前缀规则块数（@media 嵌套行不计）').toBe(32);
    expect((style.match(/^\.ell \{/gm) || []).length, '.ell 规则恰一份（QRT cell 段保留）').toBe(1);
    expect((style.match(/^\.dim \{/gm) || []).length, '.dim 规则恰一份（QRT cell 段保留）').toBe(1);
    expect(src, '.ell 模板消费在场（cell-_id 截断）').toContain('class="mono ell"');
    expect(src, '.dim 模板消费在场（基准排名列）').toContain('class="mono dim"');
  });
  it('活锚守卫：.bt-hd 基础规则与 .bt-switch/.bt-slider/.bt-up 不受扰', () => {
    expect(src, '.bt-hd 基础活规则不动').toMatch(/^\.bt-hd \{/m);
    expect(src, '.bt-switch 活规则不动').toMatch(/^\.bt-switch \{/m);
    expect(src, '.bt-slider 活规则不动').toMatch(/^\.bt-slider \{/m);
    expect(src, '.bt-up 活规则不动').toMatch(/^\.bt-up \{/m);
  });
});

describe('772 G246 跑基准/重跑对比在途态（铁律 D·次刀·768 G238/766 G234/770 G241 族）', () => {
  it('挂载实锚：跑基准 busy→Loader2 spinning+「跑基准中…」+Anchor 让位；完成复常 Anchor+「跑基准」', async () => {
    let resolveRun!: (v: any) => void;
    searchRawFn.mockImplementation(() => new Promise(res => { resolveRun = res; }));
    const { app, host } = await mountBt();
    await fillAndUnlock(host);
    const baseBtn = baseBtnOf(host)!;
    baseBtn.click();
    await settle(6);
    expect(baseBtn.disabled, 'busy 期间禁用').toBe(true);
    expect(baseBtn.textContent, '在途文案').toContain('跑基准中');
    expect(baseBtn.querySelector('.spinning'), 'Loader2 spinning 图标在场').toBeTruthy();
    expect(baseBtn.querySelector('[class*="lucide-anchor"]'), 'busy 期 Anchor 静态图标让位').toBe(null);
    resolveRun({ hits: { hits: HITS_A } });
    await settle(10);
    expect(baseBtn.disabled, '完成复常解禁').toBe(false);
    expect((baseBtn.textContent || '').replace(/\s+/g, ''), '复常文案').toBe('跑基准');
    expect(baseBtn.querySelector('.spinning'), 'spinning 移除').toBe(null);
    expect(baseBtn.querySelector('[class*="lucide-anchor"]'), 'Anchor 图标复位').toBeTruthy();
    expect(host.querySelectorAll('.bt-right tbody tr').length, 'QRT 表复现').toBe(2);
    app.unmount();
  });
  it('挂载实锚 G246b：重跑对比 busy→「重跑中…」+spinning；同窗跑基准钮文案恒「跑基准」（lastMode 门控对称）', async () => {
    const { app, host } = await mountBt();
    await fillAndUnlock(host);
    baseBtnOf(host)!.click();
    await settle(10); /* 基准快照拍好（重跑解禁前提） */
    let resolveRun!: (v: any) => void;
    searchRawFn.mockImplementation(() => new Promise(res => { resolveRun = res; }));
    const baseBtn = baseBtnOf(host)!;
    const cmpBtn = cmpBtnOf(host)!;
    cmpBtn.click();
    await settle(6);
    expect(cmpBtn.disabled, 'busy 期间禁用').toBe(true);
    expect(cmpBtn.textContent, '重跑在途文案（G244 纯文本口径升格）').toContain('重跑中');
    expect(cmpBtn.querySelector('.spinning'), 'RefreshCw spinning 既有绑定在场').toBeTruthy();
    expect((baseBtn.textContent || '').replace(/\s+/g, ''), '跑基准钮文案恒定（lastMode=false 门控）').toBe('跑基准');
    expect(baseBtn.querySelector('[class*="lucide-anchor"]'), '跑基准钮 Anchor 恒在（本钮未发起执行）').toBeTruthy();
    resolveRun({ hits: { hits: HITS_B } });
    await settle(10);
    expect((cmpBtn.textContent || '').replace(/\s+/g, ''), '复常文案').toBe('重跑对比');
    expect(cmpBtn.disabled).toBe(false);
    app.unmount();
  });
  it('源码锁：双钮双态形态在场（Loader2/Anchor 互换+lastMode 门控文案）', () => {
    expect(src, '跑基准钮双态（Loader2/Anchor 互换+在途文案）')
      .toMatch(/<Loader2 v-if="busy && lastMode" :size="12" class="spinning" \/><Anchor v-else :size="12" \/> \{\{ busy && lastMode \? '跑基准中…' : '跑基准' \}\}/);
    expect(src, '重跑对比钮文案通道（G244 纯文本口径）')
      .toMatch(/<RefreshCw :size="12" :class="\{ spinning: busy \}" \/> \{\{ busy && !lastMode \? '重跑中…' : '重跑对比' \}\}/);
  });
});

describe('772 G247 aria 补位（弱 P3·随批可裁·G192/G224/G235 族）', () => {
  it('挂载实锚：滑杆动态 aria-label（字段名+权重倍数，title 之外的第二通道）', async () => {
    const { app, host } = await mountBt();
    host.querySelector<HTMLButtonElement>('.bt-add')!.click();
    await settle(6);
    writeFields(host, [{ name: 'name', boost: 1 }]);
    await settle(6);
    const slider = host.querySelector<HTMLInputElement>('.bt-slider');
    expect(slider, '滑杆在场').toBeTruthy();
    const aria = slider!.getAttribute('aria-label') || '';
    expect(aria, 'aria-label 含权重语义').toContain('权重');
    expect(aria, 'aria-label 含字段名（多行滑杆可区分）').toContain('name');
    expect(slider!.getAttribute('title'), '动态 title 既有通道不动').toContain('×1.0');
    app.unmount();
  });
  it('挂载实锚：掉出条 role=status+chip+复制钮 aria（异步结果到达语义公告）', async () => {
    const { app, host } = await mountBt();
    await fillAndUnlock(host);
    baseBtnOf(host)!.click();
    await settle(10);
    searchRawFn.mockResolvedValue({ hits: { hits: HITS_B } });
    cmpBtnOf(host)!.click();
    await settle(10);
    const dr = host.querySelector('.bt-dropped');
    expect(dr, '掉出条在场（d1 掉出）').toBeTruthy();
    expect(dr!.getAttribute('role'), 'G247 语义公告 role=status').toBe('status');
    expect(dr!.textContent).toContain('掉出前 20');
    expect(dr!.textContent).toContain('d1');
    const cp = [...dr!.querySelectorAll('button')].find(b => (b.getAttribute('aria-label') || '').includes('复制'));
    expect(cp?.getAttribute('aria-label'), '复制钮 aria 含计数').toContain('1 个掉出');
    app.unmount();
  });
  it('空态守卫：无掉出（same 桶）→.bt-dropped 不渲染（v-if 不变量零改）', async () => {
    const { app, host } = await mountBt();
    await fillAndUnlock(host);
    baseBtnOf(host)!.click();
    await settle(10);
    cmpBtnOf(host)!.click(); /* same 数据（mockResolvedValue 同 HITS_A）→dropped 空 */
    await settle(10);
    expect(host.querySelector('.bt-dropped')).toBe(null);
    app.unmount();
  });
});

describe('1439 调参字段行右键', () => {
  it('右键复制/停用/删除；菜单键开同一菜单（共享 CellContextMenu）', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const { app, host } = await mountBt();
    writeFields(host, [{ name: 'name', boost: 1 }]);
    await settle();
    const row = host.querySelector<HTMLElement>('.bt-field')!;
    const open = async () => {
      row.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 20, clientY: 20 }));
      await settle();
      const menu = document.body.querySelector<HTMLElement>('.ccm');
      expect(menu, '右键菜单').toBeTruthy();
      return menu!;
    };
    let menu = await open();
    expect(menu.textContent).toContain('调参字段 · name · ×1.0');
    for (const label of ['复制字段名', '停用此字段', '删除调参字段']) {
      expect(menu.textContent, `菜单项 ${label}`).toContain(label);
    }
    (menu.querySelector('[data-key="bt-copy"]') as HTMLElement).click();
    await settle();
    expect(writeText).toHaveBeenCalledWith('name');

    menu = await open();
    (menu.querySelector('[data-key="bt-toggle"]') as HTMLElement).click();
    await settle();
    expect(host.querySelector<HTMLInputElement>('.bt-fen')!.checked, '停用后 checkbox 未勾选').toBe(false);

    row.dispatchEvent(new KeyboardEvent('keydown', { key: 'ContextMenu', bubbles: true }));
    await settle();
    const kbMenu = document.body.querySelector<HTMLElement>('.ccm');
    expect(kbMenu, '菜单键必须开同一菜单').toBeTruthy();
    expect(kbMenu!.textContent, '已停用后菜单显示启用动作').toContain('启用此字段');
    (kbMenu!.querySelector('[data-key="bt-del"]') as HTMLElement).click();
    await settle();
    expect(host.querySelectorAll('.bt-field').length, '删除后字段行移除').toBe(0);
    delete (navigator as any).clipboard;
    app.unmount();
  });
});
