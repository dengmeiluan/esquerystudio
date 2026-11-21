/**
 * 七百三十一批：DiffEditor 首刀五小刀（R112；R111 裁决表 G100+G101+G102+G103+G104）。
 *
 * ① G100（P3 语义失真·头号）「Diff · N 处变更」头计数只计真实增删行——563 批 LCS 化后
 *    diffLines 语义为全行（eq 混入），头计数沿用 diffLines.length 会把未编辑文档显示成
 *    「9 处变更」（R111 三跑实锚 add=0/del=0/eq=9）。修法=filter op!=='eq' + 头计数换源。
 * ② G101（P3 铁律 F）MetaStrip version/seq_no/pt 三段裸英文 label 补段级中文 tip
 *    （G55/G60/G74/G79/G87 同族；tip 走 MetaStrip :title 悬停通道+help 档）。
 * ③ G102（P3 铁律 C）PUT 覆盖/_update partial/Painless script 三模式钮平铺
 *    .btn.ghost.xs.act 零 aria-pressed 零 role=group → .seg 分段控件合并
 *    （QRT qrt-view-seg 单源范式）+死规则随刀退役。
 * ④ G103（P3 铁律 B）_id 输入 Enter 直达加载/对比（高频两跳；isCompare 分支 fetchCompare）。
 * ⑤ G104（P3 铁律 D 在途可感知）提交钮 Send spinning+「提交中…」+加载钮 Download
 *    spinning+对比钮 Play spinning（729 G95/721 G73 同款；722 G81 豁免口径不适用=
 *    三钮图标均在场）。
 *
 * 驱动方式照 profileFlameFirstCut729（monaco ESM 全 stub + api mock 挂载冒烟
 * +行为在途窗双读+源码锁+渲染负锚）。文档球同 730 探针 probe-a：4 字段 9 行 JSON，
 * 编辑稿走 sessionStorage carry 通道（onMounted doFetch 后恢复）——Monaco 编辑器
 * 在 stub 下不可直接注入（720-C1 同因），carry 是产品自带合法动线。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* monaco editor.api stub（729 spec 同范式：JsonArea 真挂载、注册面最小桩） */
vi.mock('monaco-editor/esm/vs/editor/editor.api', () => {
  const fakeEditor = {
    onDidChangeModelContent: () => ({ dispose() {} }),
    addAction: () => {},
    getValue: () => '',
    setValue: () => {},
    updateOptions: () => {},
    getAction: () => null,
    getSelection: () => null,
    executeEdits: () => {},
    focus: () => {},
    deltaDecorations: () => [],
    getModel: () => null,
    dispose: () => {},
  };
  return {
    editor: { defineTheme: () => {}, create: () => fakeEditor, setTheme: () => {}, setModelMarkers: () => {} },
    languages: {
      registerCompletionItemProvider: () => ({ dispose() {} }),
      registerHoverProvider: () => ({ dispose() {} }),
      register: () => {},
      setMonarchTokensProvider: () => {},
      setLanguageConfiguration: () => {},
      registerCodeActionProvider: () => ({ dispose() {} }),
      json: { jsonDefaults: { setDiagnosticsOptions: () => {} } },
      CompletionItemKind: { Property: 9, Snippet: 27, Field: 3, Keyword: 17, Value: 13 },
      CompletionItemInsertTextRule: { InsertAsSnippet: 4 },
    },
    Range: class {},
    KeyMod: { CtrlCmd: 2048 },
    KeyCode: { Enter: 3 },
    MarkerSeverity: { Hint: 1, Warning: 8 },
  };
});
vi.mock('monaco-editor/esm/vs/language/json/monaco.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/basic-languages/sql/sql.contribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/folding/browser/folding', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/find/browser/findController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/format/browser/formatActions', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/suggest/browser/suggestController', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/bracketMatching/browser/bracketMatching', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/clipboard/browser/clipboard', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/contextmenu/browser/contextmenu', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/contrib/comment/browser/comment', () => ({}));
vi.mock('monaco-editor/esm/vs/editor/editor.worker?worker', () => ({ default: class {} }));
vi.mock('monaco-editor/esm/vs/language/json/json.worker?worker', () => ({ default: class {} }));

/* 确认门直通（G104 在途窗测的是 pushing 语义非确认门——确认门 730 probe D5 已锚） */
vi.mock('../composables/confirm', () => ({ askConfirm: () => Promise.resolve(true) }));

const getDocFn = vi.fn();
const putDocFn = vi.fn();
const updateDocFn = vi.fn();
vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      getDoc: (...a: any[]) => getDocFn(...a),
      putDoc: (...a: any[]) => putDocFn(...a),
      updateDoc: (...a: any[]) => updateDocFn(...a),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterInspect: () => Promise.resolve({ mappings: {} }),
      mappingDetail: () => Promise.resolve({ raw: { properties: { title: { type: 'text' }, views: { type: 'long' }, status: { type: 'keyword' }, tags: { type: 'keyword' } } } }),
    },
  };
});

import DiffEditorView from '../views/DiffEditorView.vue';

/* 730 探针同构球：probe-a 4 字段（formatJson 9 行）+_version 3/_seq_no 12/_primary_term 1；
   编辑稿 views 12→99 → LCS = del1+add1+eq8（10 行，非 eq=2） */
const DOC_A = { _id: 'doc1', _index: 'probe-a', _version: 3, _seq_no: 12, _primary_term: 1,
  _source: { title: 'sample', views: 12, status: 'open', tags: ['a', 'b'] } };
const DOC_B = { _id: 'doc1', _index: 'probe-b', _version: 5, _seq_no: 40, _primary_term: 1,
  _source: { title: 'sample-b', views: 12, status: 'closed', tags: ['a', 'b'], extra: 'x' } };
const EDITED_CARRY = JSON.stringify({ ...DOC_A._source, views: 99 }, null, 2);

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

interface MountOpts { id?: string; mode?: string; b?: string; carry?: string }
async function mountDf(opts: MountOpts = {}) {
  const q = new URLSearchParams({ idx: 'probe-a' });
  if (opts.id) q.set('id', opts.id);
  if (opts.mode) q.set('mode', opts.mode);
  if (opts.b) q.set('b', opts.b);
  history.replaceState(null, '', '#/?' + q.toString());
  if (opts.carry != null) sessionStorage.setItem('esquerystudio.doc-diff.carry.source', opts.carry);
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const app = createApp({ render: () => h(DiffEditorView as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function findBtn(host: HTMLElement, re: RegExp): HTMLButtonElement {
  const btn = Array.from(host.querySelectorAll<HTMLButtonElement>('button'))
    .find(b => re.test((b.textContent || '').replace(/\s+/g, '')));
  expect(btn, `按钮必须存在：${re}`).toBeTruthy();
  return btn!;
}

function diffHeadText(host: HTMLElement): string {
  const span = Array.from(host.querySelectorAll('.df-card-hd > span'))
    .find(s => (s.textContent || '').includes('Diff ·'));
  expect(span, 'Diff 头计数在场').toBeTruthy();
  return (span!.textContent || '').replace(/\s+/g, ' ');
}

beforeEach(() => {
  document.body.innerHTML = '';
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('es_picked', 'probe-a');
  getDocFn.mockReset().mockImplementation((idx: string) => idx === 'probe-b' ? Promise.resolve(DOC_B) : Promise.resolve(DOC_A));
  putDocFn.mockReset().mockResolvedValue({ ok: true });
  updateDocFn.mockReset().mockResolvedValue({ ok: true });
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('731 G100 头计数只计真实增删行（eq 不计入「变更」）', () => {
  it('未编辑态=「0 处变更」（修前 9）；编辑一行后=「2 处变更」（add1+del1；修前 10）', async () => {
    const host0 = await mountDf({ id: 'doc1' });
    expect(getDocFn).toHaveBeenCalledTimes(1);
    expect(diffHeadText(host0)).toContain('Diff · 0 处变更');
    expect(host0.querySelectorAll('.df-diff-line.add').length, '未编辑零增行').toBe(0);
    expect(host0.querySelectorAll('.df-diff-line.del').length, '未编辑零删行').toBe(0);

    const host1 = await mountDf({ id: 'doc1', carry: EDITED_CARRY });
    expect(diffHeadText(host1)).toContain('Diff · 2 处变更');
    expect(host1.querySelectorAll('.df-diff-line.add').length).toBe(1);
    expect(host1.querySelectorAll('.df-diff-line.del').length).toBe(1);
    expect(host1.querySelectorAll('.df-diff-line').length, '全行 10 条不变（LCS 语义原样，只动头计数）').toBe(10);
  });
});

describe('731 G101 MetaStrip 三段中文 tip（铁律 F；G55/G60/G74/G79/G87 同族）', () => {
  it('version/seq_no/pt 三段 title=版本号/乐观锁序号/主分片任期 + help 档', async () => {
    const host = await mountDf({ id: 'doc1' });
    const items = Array.from(host.querySelectorAll('.ms-i'));
    expect(items.length, 'dfMetaItems 三段').toBe(3);
    expect(items[0].getAttribute('title')).toBe('版本号');
    expect(items[1].getAttribute('title')).toBe('乐观锁序号');
    expect(items[2].getAttribute('title')).toBe('主分片任期');
    items.forEach(i => expect(i.classList.contains('help'), 'tip 悬停通道 help 档').toBe(true));
  });
});

describe('731 G102 三模式钮 seg 分段控件合并（铁律 C；QRT 单源范式）', () => {
  it('role=group+aria-label+三钮 aria-pressed+点击切换 on 态', async () => {
    const host = await mountDf({ id: 'doc1' });
    const seg = host.querySelector('.df-mode-seg');
    expect(seg, 'G102 病灶：三模式钮仍平铺（.seg 容器缺位）').toBeTruthy();
    expect(seg!.classList.contains('seg'), '.seg 全局基类在场').toBe(true);
    expect(seg!.getAttribute('role')).toBe('group');
    expect(seg!.getAttribute('aria-label')).toBe('写回模式');
    const btns = seg!.querySelectorAll('button');
    expect(btns.length).toBe(3);
    expect([...btns].map(b => (b.textContent || '').trim())).toEqual(['PUT 覆盖', '_update partial', 'Painless script']);
    /* 默认 update 档：aria-pressed 唯一真 */
    expect([...btns].map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false']);
    expect(btns[1].classList.contains('on')).toBe(true);
    btns[0].click();
    await settle(2);
    expect(btns[0].getAttribute('aria-pressed')).toBe('true');
    expect(btns[1].getAttribute('aria-pressed')).toBe('false');
    expect(btns[0].classList.contains('on')).toBe(true);
    /* 模式切换联动 patch 请求体（既有契约零回归） */
    expect(host.querySelector('.df-code')!.textContent).toContain('POST /cluster/doc?');
  });
});

describe('731 G103 _id 输入 Enter 直达（铁律 B 高频两跳）', () => {
  function idInput(host: HTMLElement): HTMLInputElement {
    const inp = host.querySelector<HTMLInputElement>('input.inp[placeholder="文档 ID"]');
    expect(inp, '_id 输入框在场').toBeTruthy();
    return inp!;
  }
  function typeAndEnter(inp: HTMLInputElement, v: string) {
    inp.value = v;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  }

  it('patch 模式：无 id 挂载不自动拉；填 id+Enter 触发加载（getDoc +1）', async () => {
    const host = await mountDf({});
    expect(getDocFn, '无 id 不自动拉取').not.toHaveBeenCalled();
    typeAndEnter(idInput(host), 'doc1');
    await settle();
    expect(getDocFn, 'G103 病灶：Enter 不触发加载（修前 0 次）').toHaveBeenCalledTimes(1);
    expect(diffHeadText(host)).toContain('Diff · 0 处变更');
  });

  it('compare 模式：Enter 触发对比（getDoc 双拉 a+b）', async () => {
    const host = await mountDf({ mode: 'compare', b: 'probe-b' });
    expect(getDocFn, 'compare 无 id 同样不自动拉').not.toHaveBeenCalled();
    typeAndEnter(idInput(host), 'doc1');
    await settle();
    expect(getDocFn, 'G103 isCompare 分支：Enter 触发 fetchCompare（a+b 双拉）').toHaveBeenCalledTimes(2);
    expect(host.querySelector('.df-cmp-sum')!.textContent).toContain('共');
  });
});

describe('731 G104 三钮在途可感知（铁律 D；729 G95 同款）', () => {
  it('提交钮：在途窗 disabled+Send spinning+「提交中…」；完成复常', async () => {
    let release: (() => void) | null = null;
    updateDocFn.mockImplementation(() => new Promise<any>(res => { release = () => res({ ok: true }); }));
    const host = await mountDf({ id: 'doc1', carry: EDITED_CARRY });
    const btn = findBtn(host, /_update合并|提交中…/);
    expect(btn.disabled, '已修改态提交钮起手可点').toBe(false);
    btn.click();
    await settle(4);
    expect(updateDocFn).toHaveBeenCalledTimes(1);
    expect(btn.disabled, 'pushing 守卫既有').toBe(true);
    expect(btn.querySelector('.spinning'), 'G104 病灶：在途窗 Send 零 spinning').toBeTruthy();
    expect(btn.textContent).toContain('提交中…');
    release!();
    await settle();
    /* 提交成功→doFetch 重取→编辑稿归位线上版→isModified=false：disabled=true 是正确终态
       （无差异不可再提交），spinning/文案复常是本刀判据面 */
    expect(btn.disabled, '提交归位后无差异不可再提交（产品语义）').toBe(true);
    expect(btn.querySelector('.spinning')).toBeNull();
    expect(btn.textContent).toContain('_update 合并');
  });

  it('加载钮 busy 窗 Download spinning；对比钮 cmpBusy 窗 Play spinning', async () => {
    let release: (() => void) | null = null;
    getDocFn.mockImplementation(() => new Promise<any>(res => { release = () => res(DOC_A); }));
    const host = await mountDf({ id: 'doc1' });
    await settle(4);
    const loadBtn = findBtn(host, /加载文档|加载中…/);
    expect(loadBtn.disabled, 'busy 守卫既有').toBe(true);
    expect(loadBtn.querySelector('.spinning'), 'G104 病灶：busy 窗 Download 零 spinning').toBeTruthy();
    expect(loadBtn.textContent).toContain('加载中…');
    release!();
    await settle();
    expect(loadBtn.querySelector('.spinning')).toBeNull();
    expect(loadBtn.textContent).toContain('加载文档');

    /* compare 位对比钮（cmpBusy 在途窗）——fetchCompare 双拉 a+b：按 index 参数分桶
       resolve（单个 release 变量会被第二个 Promise 覆盖致首个永挂，cmpBusy 不复位） */
    const rel: (() => void)[] = [];
    getDocFn.mockImplementation((idx: string) => new Promise<any>(res => { rel.push(() => res(idx === 'probe-b' ? DOC_B : DOC_A)); }));
    const host2 = await mountDf({ mode: 'compare', b: 'probe-b', id: 'doc1' });
    await settle(4);
    const cmpBtn = findBtn(host2, /对比/);
    expect(cmpBtn.disabled, 'cmpBusy 守卫既有').toBe(true);
    expect(cmpBtn.querySelector('.spinning'), 'G104 病灶：cmpBusy 窗 Play 零 spinning').toBeTruthy();
    rel.forEach(fn => fn());
    await settle();
    expect(cmpBtn.querySelector('.spinning'), '完成复常 spinning 移除').toBeNull();
    expect(host2.querySelector('.df-cmp-sum')!.textContent, '对比链完成渲染（a≠b 有差异）').toContain('共');
  });
});

describe('731 渲染负锚（删除/改用零误伤守卫，现状即守卫）', () => {
  it('tip 不进可见文本 + 双卡/diff 行结构/已修改徽标零回归', async () => {
    const host = await mountDf({ id: 'doc1', carry: EDITED_CARRY });
    host.querySelectorAll('.ms-i').forEach(i => {
      expect(i.textContent, 'tip 只走 title 悬停通道，不进可见文本').not.toContain('版本号');
      expect(i.textContent).not.toContain('乐观锁');
      expect(i.textContent).not.toContain('主分片任期');
    });
    expect(host.querySelectorAll('.df-card').length, '双编辑卡+wide diff 卡三张').toBe(3);
    expect(host.querySelector('.df-modif'), '已修改徽标在场').toBeTruthy();
    expect(host.querySelectorAll('.df-diff-line').length, 'LCS 全行 10 条（add1/del1/eq8）').toBe(10);
    expect(host.querySelector('.df-code'), 'patch 请求体预览在场').toBeTruthy();
  });
});

describe('731 源码锁', () => {
  it('五刀字面锁 + seg 化死规则退役', () => {
    const v = readFileSync(join(__dirname, '../views/DiffEditorView.vue'), 'utf-8');
    /* 单参形态（TS2554 两参在部分字面量上报错，724/726 课同款） */
    expect(v).toContain("filter(l => l.op !== 'eq')"); // G100 头计数过滤
    expect(v).toContain("tip: '版本号'"); // G101 tip
    expect(v).toContain('class="seg df-mode-seg" role="group"'); // G102 seg 范式
    expect(v).toContain('@keyup.enter="onIdEnter"'); // G103 Enter
    expect(v).toContain('Download :size="12" :class="{ spinning: busy }"'); // G104 加载钮
    expect(v).toContain('Send :size="12" :class="{ spinning: pushing }"'); // G104 提交钮
    expect(v).toContain("pushing ? '提交中…'"); // G104 提交中文案
    /* G102 随刀退役：三模式钮选中态旧规则（seg 化后 0 引用） */
    expect(v).not.toMatch(/\.btn\.ghost\.xs\.act/);
  });
});
