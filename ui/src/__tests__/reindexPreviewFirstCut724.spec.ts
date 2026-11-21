/**
 * 七百二十四批：ReindexPreview 首刀小刀两件套（R105；R103 裁决表 G79+G80，⑥723 头号建议）。
 *
 * ① G79（P3 铁律 F）MetaStrip 四段 label 英文裸词补段级中文 tip——「任何英文参数必须有中文备注」：
 *    R103 读数「docs/primary bytes/avg/doc/bytes」四段 label 混排英文裸词，段级 help 档悬停零备注
 *    （容器 :title 兜底全文在场）；修法=四段 tip 补齐（715 G55/717 G60/721 G74 同族；
 *    tip 走 :title 悬停通道+MetaStrip help 档 cursor:help，备注不进可见文本）。
 * ② G80（P3 文案卫生）建议区值内嵌「# ES 7.x+」注释字面清理——slices 展示值
 *    'auto  # ES 7.x+ 自动按分片切' 把 # 注释符+解释语塞进 mono 值里（与括号解释语义重复），
 *    修法=值归 'auto'+注释语义并入既有括号；「建议 batch size」裸英文补中文备注（每批文档数）。
 * ③ G81（P3 观察·豁免备案）运行钮零 spinning——纯文本钮无图标可挂，读秒改用
 *    「预估中 X.Xs」+取消钮+busy 守卫既有=在途可感知已覆盖（铁律 D），加图标反伤位置恒定。
 *
 * 驱动方式照 reindexCancel538（NModal stub 直渲染 + MonacoEditor stub + api mock
 * 挂载冒烟）+ scoreExplainFirstCut721（tip 行为双读 + 源码锁 + 渲染负锚三段式）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createApp, h, nextTick, defineComponent } from 'vue';
import { createRouter, createMemoryHistory } from 'vue-router';
import { createPinia } from 'pinia';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/* NModal：teleport/定位非测试目标——show=true 直渲染、false 不渲染（538 同款） */
vi.mock('naive-ui', async (importOriginal) => {
  const actual = await importOriginal<typeof import('naive-ui')>();
  return {
    ...actual,
    NModal: defineComponent({
      name: 'NModal',
      props: { show: { type: Boolean, default: false } },
      emits: ['update:show'],
      setup(props, { slots }) {
        return () => (props.show ? h('div', { class: 'nm-stub' }, slots.default ? slots.default() : []) : null);
      },
    }),
  };
});

/* MonacoEditor stub：JsonArea 内核占位（本 spec 不驱动编辑器内容，538 同款） */
vi.mock('../components/MonacoEditor.vue', () => ({
  default: defineComponent({
    name: 'MonacoEditor',
    props: ['modelValue', 'language', 'height', 'readonly', 'dslAssist'],
    emits: ['update:modelValue', 'execute', 'keydown'],
    setup(props: any) {
      return () => h('div', { class: 'monaco-stub' }, String(props.modelValue ?? ''));
    },
  }),
}));

/* 预估应答五键真实口径（722 probe 同种子：docs=24680/75000=32.9%） */
const reindexPreviewFn = vi.fn((_source: string, _query: string, _signal?: AbortSignal) => Promise.resolve({
  docs: 24680,
  sourceTotalDocs: 75000,
  sourcePrimaryBytes: 118000000,
  avgDocBytes: 4720,
  estimatedTargetBytes: 116489600,
}));

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      reindexPreview: (...a: any[]) => reindexPreviewFn(...(a as [string, string, AbortSignal?])),
      mappingDetail: () => Promise.resolve({ raw: { properties: {} } }),
      clusterIndices: () => Promise.resolve([]),
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      raw: () => Promise.resolve({}),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

const apps: ReturnType<typeof createApp>[] = [];

async function settle(n = 12) {
  for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); }
}

async function mountRp(): Promise<HTMLElement> {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/', component: { template: '<div/>' } }],
  });
  await router.push('/');
  await router.isReady();
  const View = (await import('../views/ReindexPreviewView.vue')).default;
  const app = createApp({ render: () => h(View as any) });
  apps.push(app);
  app.use(createPinia());
  app.use(router);
  const host = document.createElement('div');
  document.body.appendChild(host);
  app.mount(host);
  await settle();
  return host;
}

function textBtn(root: ParentNode, text: string): HTMLButtonElement | undefined {
  return Array.from(root.querySelectorAll<HTMLButtonElement>('button')).find(b => (b.textContent || '').includes(text));
}

async function runOk(host: HTMLElement) {
  textBtn(host, '运行预估')!.click();
  await settle();
}

beforeEach(() => {
  document.body.innerHTML = '';
  history.replaceState(null, '', '#/?idx=idx_rp724');
  sessionStorage.clear();
  localStorage.clear();
  reindexPreviewFn.mockClear();
});
afterEach(() => { apps.forEach(a => a.unmount()); apps.length = 0; });

describe('724 G79 MetaStrip 四段中文 tip（铁律 F）', () => {
  it('运行后四段 tip 悬停可达：title 中文备注+help 档；容器兜底全文不破', async () => {
    const host = await mountRp();
    await runOk(host);
    const items = Array.from(host.querySelectorAll<HTMLElement>('.rp-meta-pos .ms-i'));
    expect(items.length, '四段统计条渲染').toBe(4);
    const byLabel = (kw: string) => items.find(el => el.textContent?.includes(kw));
    /* 段1：符合过滤 doc（占源 …） */
    const seg1 = byLabel('符合过滤');
    expect(seg1, '段1 在场').toBeTruthy();
    expect(seg1!.getAttribute('title'), 'G79 病灶：段1 英文裸 doc 无段级备注').toBe('符合过滤条件的文档数（占源索引比例）');
    /* 段2：源 primary bytes（… docs） */
    const seg2 = byLabel('primary bytes');
    expect(seg2, '段2 在场').toBeTruthy();
    expect(seg2!.getAttribute('title'), 'G79 病灶：段2 primary bytes 无段级备注').toBe('源索引主分片存储体积（全部源文档）');
    /* 段3：avg/doc */
    const seg3 = byLabel('avg/doc');
    expect(seg3, '段3 在场').toBeTruthy();
    expect(seg3!.getAttribute('title'), 'G79 病灶：avg/doc 纯英文裸词无备注').toBe('平均单文档体积（primary bytes ÷ 源 docs）');
    /* 段4：目标预估 bytes（docs × avg） */
    const seg4 = byLabel('目标预估');
    expect(seg4, '段4 在场').toBeTruthy();
    expect(seg4!.getAttribute('title'), 'G79 病灶：段4 目标预估 bytes 无段级备注').toBe('目标索引预估体积（符合过滤 doc × 平均单文档体积）');
    /* help 档四段全挂（cursor:help 悬停可达） */
    for (const el of items) expect(el.classList.contains('help'), 'tip 段挂 MetaStrip help 档').toBe(true);
    /* 容器级 :title 兜底全文不破（519 合并既有通道） */
    const strip = host.querySelector<HTMLElement>('.rp-meta-pos');
    expect(strip!.getAttribute('title')).toContain('符合过滤的 doc');
  });

  it('备注不进可见文本+执行链零回归：数值在场+api 计数自证（现状即守卫）', async () => {
    const host = await mountRp();
    await runOk(host);
    const strip = host.querySelector<HTMLElement>('.rp-meta-pos')!;
    expect(strip.textContent).toContain('24,680');
    expect(strip.textContent).toContain('32.9%');
    expect(strip.textContent, '备注走 title 通道不进可见文本').not.toContain('符合过滤条件的文档数');
    expect(reindexPreviewFn).toHaveBeenCalledTimes(1);
    expect(reindexPreviewFn.mock.calls[0][0], '深链索引上行').toBe('idx_rp724');
  });
});

describe('724 G80 建议区文案卫生', () => {
  it('slices 值归 auto：mono 值=auto 零 # 注释字面；注释语义并入括号', async () => {
    const host = await mountRp();
    await runOk(host);
    const lis = Array.from(host.querySelectorAll<HTMLElement>('.rp-suggest li'));
    expect(lis.length, '建议区三 li 渲染（+条件 warn li 不在场）').toBe(3);
    const slicesLi = lis.find(li => li.textContent?.includes('slices'))!;
    expect(slicesLi, 'slices li 在场').toBeTruthy();
    const mono = slicesLi.querySelector<HTMLElement>('.mono')!;
    expect(mono.textContent, 'G80 病灶：值内嵌 # 注释字面（应归 auto）').toBe('auto');
    expect(slicesLi.textContent, '# 注释符不进建议区文本').not.toContain('#');
    expect(slicesLi.textContent, '注释语义并入括号（ES 版本口径不丢）').toContain('ES 7.x+');
  });

  it('batch size 中文备注在场（每批文档数）；既有保守值口径不破', async () => {
    const host = await mountRp();
    await runOk(host);
    const batchLi = Array.from(host.querySelectorAll<HTMLElement>('.rp-suggest li'))
      .find(li => li.textContent?.includes('batch size'))!;
    expect(batchLi, 'batch size li 在场').toBeTruthy();
    expect(batchLi.textContent, 'G80 病灶：建议 batch size 裸英文无中文备注').toContain('每批文档数');
    expect(batchLi.querySelector('.mono')!.textContent, 'avgDocBytes=4720<10KB 档=1000 既有口径').toBe('1000');
  });
});

describe('724 源码锁', () => {
  it('G79+G80 字面锁：四段 tip 字面 + slices 值归 auto + batch size 备注', () => {
    const v = readFileSync(join(__dirname, '../views/ReindexPreviewView.vue'), 'utf-8');
    expect(v).toContain("tip: '符合过滤条件的文档数（占源索引比例）'");
    expect(v).toContain("tip: '源索引主分片存储体积（全部源文档）'");
    expect(v).toContain("tip: '平均单文档体积（primary bytes ÷ 源 docs）'");
    expect(v).toContain("tip: '目标索引预估体积（符合过滤 doc × 平均单文档体积）'");
    expect(v).toContain("return 'auto';");
    expect(v).toContain('每批文档数');
    expect(v, '注释字面零残留（值与括号归并后）').not.toContain('# ES 7.x+');
  });
});
