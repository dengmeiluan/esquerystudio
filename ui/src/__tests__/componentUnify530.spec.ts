/**
 * 530 批 W-D「组件统一批」spec：
 * ① StatusPill 统一件——五 tone 语义档 + 缺省 n + en 英文小字档 + title 兜底；
 * ② useLinkCarry——sessionStorage 一次性 carry（esquerystudio.link.{key}），取后即焚、异常吞掉；
 * ③ useDebounceFn——缺省 250ms 防抖，连发只跑最后一次，卸载自动清理；
 * ④ 八视图改用静态锁（AnalysisSettings/BulkEditor/ConfigDrift/Plugins/Rest/SearchSandbox/Snapshots/System）。
 *
 * 【待合并清单】其余视图的裸 esquerystudio.link.* 写法（不属 W-D 独占面，逐个 lane 合并时换 useLinkCarry）：
 *   - views/AnalyzerLabView.vue ✅531 已合并（useLinkCarry('analyzer')）
 *   - views/BoostTunerView.vue ✅531 已合并（接收侧 useLinkCarry('boost')）
 *   - views/DslQueryView.vue ✅531 已合并（rankdebug/xray 发送侧）
 *   - views/IndexHubView.vue ✅531 已合并（rankdebug/xray 发送侧）
 *   - views/MatchMatrixView.vue ✅531 已合并（boost 发送侧）
 *   - views/ScoreExplainView.vue ✅531 已合并（rankdebug/xray 发送侧）
 *   - views/QueryXrayView.vue ✅531 已合并（analyzer 发送 + xray 接收侧）
 *   - views/RankDebugView.vue（唯一遗留：接收侧裸实现，下批合并）
 * 另外 BulkEditorView 的 esquerystudio.bulk.carry 键前缀不同且写侧在 favReplay（favReplayCarry.spec 看守），
 * 不属 esquerystudio.link.* 合并面，保持原样。
 * 【改用进度 531 批更新】状态徽标层（StatusPill 改用）在八视图（上表）基础上再收十四视图：
 *   Aliases/Browser/ConfigValidator/IndexOptimizer/LiveDashboard/Overview/Tasks/HealthReport/
 *   Snapshots/Slm/ReindexPreview/IndexSettings/System（部分为槽内徽标/徽标档位收口）——
 *   契约锚归 semanticTier531.spec（jobKindTone 收口 + 改用锚 + semFormat 退役锚）。
 * 【531 批改用第二梯队】Adhoc(13 处)/Xmigrate/IndexHub(5 处)/PitScroll 等深优视图徽标
 *   同批合并，锚归 rebuildMigrate531/indexHubDevtools531/queryAssist 各 spec。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const read = (p: string) => readFileSync(join(SRC, p), 'utf-8');

async function mountComp(comp: any, props: Record<string, unknown>) {
  const { createApp, h, nextTick } = await import('vue');
  const host = document.createElement('div');
  document.body.appendChild(host);
  const app = createApp({ render: () => h(comp, props as any) });
  app.config.warnHandler = () => {};
  app.mount(host);
  await nextTick();
  return { host, app };
}

beforeEach(() => { document.body.innerHTML = ''; sessionStorage.clear(); });
afterEach(() => { vi.useRealTimers(); });

describe('StatusPill 统一件', () => {
  const cases: Array<[string, string]> = [['g', 'pill g'], ['y', 'pill y'], ['r', 'pill r'], ['b', 'pill b'], ['n', 'pill n']];
  for (const [tone, cls] of cases) {
    it(`tone=${tone} 挂 theme.css .pill ${tone} 语义档，label 逐字渲染`, async () => {
      const StatusPill = (await import('../components/StatusPill.vue')).default;
      const { host, app } = await mountComp(StatusPill, { tone, label: '完全一致' });
      const pill = host.querySelector('.pill')!;
      expect(pill.className).toBe(cls);
      expect(pill.textContent).toContain('完全一致');
      app.unmount();
    });
  }

  it('tone 缺省归 n 中性档（不挂色档会渲染成透明胶囊）', async () => {
    const StatusPill = (await import('../components/StatusPill.vue')).default;
    const { host, app } = await mountComp(StatusPill, { label: '未知态' });
    expect(host.querySelector('.pill')!.className).toBe('pill n');
    app.unmount();
  });

  it('en 有值渲染英文小字档（sp-en，sv-st-en 范式合并）', async () => {
    const StatusPill = (await import('../components/StatusPill.vue')).default;
    const { host, app } = await mountComp(StatusPill, { tone: 'g', label: '成功', en: 'SUCCESS' });
    const en = host.querySelector('.sp-en')!;
    expect(en.textContent).toBe('SUCCESS');
    expect(host.querySelector('.pill')!.textContent).toContain('成功');
    app.unmount();
  });

  it('en 缺省不渲染英文小字档', async () => {
    const StatusPill = (await import('../components/StatusPill.vue')).default;
    const { host, app } = await mountComp(StatusPill, { tone: 'y', label: '部分完成' });
    expect(host.querySelector('.sp-en')).toBeNull();
    app.unmount();
  });

  it('title 透传为原生提示；未传不挂空 title 属性', async () => {
    const StatusPill = (await import('../components/StatusPill.vue')).default;
    const a = await mountComp(StatusPill, { label: 'x', title: '行详情' });
    expect(a.host.querySelector('.pill')!.getAttribute('title')).toBe('行详情');
    a.app.unmount();
    const b = await mountComp(StatusPill, { label: 'x' });
    expect(b.host.querySelector('.pill')!.hasAttribute('title')).toBe(false);
    b.app.unmount();
  });
});

describe('useLinkCarry 统一件', () => {
  it('send 后 sessionStorage 键为 esquerystudio.link.{key} 且 JSON 序列化', async () => {
    const { useLinkCarry } = await import('../composables/useLinkCarry');
    const { send } = useLinkCarry<{ idx: string }>('probe-a');
    send({ idx: 'order-1' });
    expect(sessionStorage.getItem('esquerystudio.link.probe-a')).toBe(JSON.stringify({ idx: 'order-1' }));
  });

  it('receive 还原对象且取后即焚（键清除、二次 receive 恒 null）', async () => {
    const { useLinkCarry } = await import('../composables/useLinkCarry');
    const { send, receive } = useLinkCarry<{ idx: string }>('probe-b');
    send({ idx: 'order-2' });
    expect(receive()).toEqual({ idx: 'order-2' });
    expect(sessionStorage.getItem('esquerystudio.link.probe-b')).toBeNull();
    expect(receive()).toBeNull();
  });

  it('无键 receive 返回 null（不抛错）', async () => {
    const { useLinkCarry } = await import('../composables/useLinkCarry');
    const { receive } = useLinkCarry('probe-c');
    expect(receive()).toBeNull();
  });

  it('异常吞掉：非法 JSON 返回 null 且键已被焚（不残留陈稿）', async () => {
    const { useLinkCarry } = await import('../composables/useLinkCarry');
    sessionStorage.setItem('esquerystudio.link.probe-d', '{oops');
    const { receive } = useLinkCarry<{ idx: string }>('probe-d');
    expect(receive()).toBeNull();
    expect(sessionStorage.getItem('esquerystudio.link.probe-d')).toBeNull();
  });
});

describe('useDebounceFn 统一件', () => {
  async function mountDebounced(fn: (...a: any[]) => unknown, ms?: number) {
    const { createApp, h, nextTick } = await import('vue');
    const { useDebounceFn } = await import('../composables/useDebounceFn');
    let debounced!: (...a: unknown[]) => void;
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp({
      setup() {
        debounced = ms === undefined ? useDebounceFn(fn) : useDebounceFn(fn, ms);
        return () => h('div');
      },
    });
    app.config.warnHandler = () => {};
    app.mount(host);
    await nextTick();
    return { host, app, debounced };
  }

  it('缺省 250ms：249ms 不触发、250ms 触发', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const { app, debounced } = await mountDebounced(() => calls.push(1));
    debounced();
    vi.advanceTimersByTime(249);
    expect(calls).toHaveLength(0);
    vi.advanceTimersByTime(1);
    expect(calls).toHaveLength(1);
    app.unmount();
  });

  it('自定义 ms + 连发只跑最后一次（尾值语义）', async () => {
    vi.useFakeTimers();
    const got: string[] = [];
    const { app, debounced } = await mountDebounced((v: string) => got.push(v), 80);
    debounced('a');
    vi.advanceTimersByTime(50);
    debounced('b');
    vi.advanceTimersByTime(50);
    debounced('c');
    vi.advanceTimersByTime(80);
    expect(got).toEqual(['c']);
    app.unmount();
  });

  it('组件卸载自动清理：unmount 后 timer 不再触发（手写版历史缺陷）', async () => {
    vi.useFakeTimers();
    const calls: number[] = [];
    const { app, debounced } = await mountDebounced(() => calls.push(1), 100);
    debounced();
    app.unmount();
    vi.advanceTimersByTime(500);
    expect(calls).toHaveLength(0);
  });
});

describe('八视图改用静态锁', () => {
  /* 五百五十批同步更新：syn/flt 两枚随后收口 StatusPill 统一件（550 裁定推翻本例「形态不等价保留」
     备案——theme.css 无 .tag 原语可作替代面，统一件是唯一收口；锚同步更新到改用形态，as-badge 锚类
     保留。本例剩余断言 tk 改用与 import 锚不变。详见 flattenWave550⑤ */
  it('AnalysisSettingsView：tk 徽标换 StatusPill（tone=y）；syn/flt 徽标 550 同步更新同件收口', () => {
    const s = read('views/AnalysisSettingsView.vue');
    expect(s).toContain('<StatusPill v-if="(cfg as any)?.tokenizer" tone="y"');
    expect(s).toContain("import StatusPill from '../components/StatusPill.vue'");
    expect(s).not.toContain('.as-badge.tok');
    expect(s, 'syn 改用锚（550 同步更新：裸 pill b 形态退役）')
      .toContain('<StatusPill v-if="isSynonymFilter(cfg)" class="as-badge syn" tone="b"');
    expect(s, 'flt 改用锚（550 同步更新：violet 裸形态退役）')
      .toContain('<StatusPill v-if="(cfg as any)?.filter?.length" class="as-badge flt" tone="b"');
  });

  it('BulkEditorView：结果徽标与失败样例 status 徽标换 StatusPill', () => {
    const s = read('views/BulkEditorView.vue');
    expect(s).toContain('<StatusPill v-if="!result.errors" tone="g" label="✓ 全部成功" />');
    expect(s).toContain('<StatusPill v-else tone="r" label="× 存在失败" />');
    expect(s).toContain('<StatusPill :tone="statusPillCls(f.status)" :label="String(f.status)" />');
    expect(s).not.toContain('class="pill g"');
  });

  it('ConfigDriftView：两枚 cd-badge 结论徽标换 StatusPill，42px spinner 换 SkeletonBox；五百六十批清单角标亦改用（558b 回滚件解禁重做）', () => {
    const s = read('views/ConfigDriftView.vue');
    expect(s).toContain('<StatusPill class="cd-badge" :tone="drift.settingsDiff.clean ? \'g\' : \'r\'"');
    expect(s).toContain('<StatusPill class="cd-badge" :tone="drift.mappingEqual ? \'g\' : \'r\'"');
    expect(s).not.toContain('.cd-badge.ok');
    expect(s).toContain('<SkeletonBox circle :width="42" :height="42" class="cd-loading-sk" />');
    expect(s).toContain('正在拉取对象清单…');
    /* 五百六十批锚同步更新：清单角标改用 StatusPill（原 530 批绕开裁决随 useCurrentIdxWritePages525
       逐字锁解禁退役，558b 回滚件重做兑现）——tone 走 cdVerdictPill 映射消费 */
    expect(s).toContain('<StatusPill v-if="verdicts[k.indexKey]" class="cd-verdict" :tone="cdVerdictPill(verdicts[k.indexKey])"');
  });

  it('PluginsView：矩阵行状态徽标换 StatusPill，pl-mx-badge 锚保留', () => {
    const s = read('views/PluginsView.vue');
    /* 五百六十一批同步更新：矩阵表换 QRT rows 型——StatusPill 判据入 #cell-插件 槽（row[0] 查 summary），
       形态/文案保形（pl-mx-badge 锚保留） */
    expect(s).toContain('<StatusPill v-if="mxComplete(String(row[0]))" tone="g" label="✅ 完整" class="pl-mx-badge" />');
    expect(s).toContain(`:label="'⚠ 缺 ' + (nodeCount - (mxSummary(String(row[0]))?.count ?? 0)) + ' 台'"`);
    expect(s).not.toContain('.pl-mx-badge.ok');
    expect(s).toContain('.pl-mx-badge');
  });

  it('RestView：HTTP 状态三档与请求失败徽标换 StatusPill', () => {
    const s = read('views/RestView.vue');
    expect(s).toContain(`<StatusPill v-if="resp" :tone="resp.status < 300 ? 'g' : resp.status < 500 ? 'y' : 'r'" :label="'HTTP ' + resp.status" />`);
    expect(s).toContain('<StatusPill v-if="respErr" tone="r" label="请求失败" />');
  });

  it('SearchSandboxView：lint 划线防抖换 useDebounceFn，手写 lintMarkerTimer 退役', () => {
    const s = read('views/SearchSandboxView.vue');
    expect(s).toContain("import { useDebounceFn } from '../composables/useDebounceFn'");
    expect(s).toContain('const queueLintMarkers = useDebounceFn(');
    expect(s).not.toContain('lintMarkerTimer');
  });

  it('SnapshotsView：state 徽标换 StatusPill（en 档组件化），st-chip-*/sv-st-en 本地映射退役', () => {
    const s = read('views/SnapshotsView.vue');
    expect(s).toContain(':tone="stateTone(s.state)"');
    expect(s).toContain(':tone="stateTone(restoreTarget.state)"');
    expect(s).toContain("function stateTone(state: string): 'g' | 'b' | 'r' | 'y' | 'n'");
    expect(s).not.toContain('.st-chip-');
    expect(s).not.toContain('.sv-st-en');
    expect(s).not.toContain('sv-st-en');
  });

  it('SystemView：sy-meta 手写 chip 行换 MetaStrip（mapping 读取失败并入 err 档），查询卡 inline padding 归 token 类', () => {
    const s = read('views/SystemView.vue');
    expect(s).toContain('<MetaStrip v-if="info" :items="syMeta" />');
    expect(s).toContain("{ value: 'mapping 读取失败', tone: 'err' as const }");
    expect(s).not.toContain('class="sy-meta"');
    expect(s).not.toContain('style="padding:var(--sp-3) var(--sp-4)"');
    expect(s).toContain('.sy-qcard { padding: var(--sp-3) var(--sp-4); }');
  });
});
