/**
 * 五百三十一批（WE 工蚁）：IndexHub/DevTools 契约备案（源码锁 + 抽屉行为锁）。
 * ① IndexHub ops 区卡中卡降层——照 530 批 IndexSettings ir-card 三分节范式：
 *    分节标题走全局 .sec-t 档、分节间上边框分隔（危险区分节 err 档线）、
 *    操作项描边小卡退役、仅危险区保留描边档；全部 11 个操作入口零丢失；
 * ② 索引列表抽屉「选完即收」退役——选中后不自动关（当前项 .on 高亮），
 *    关闭走关闭钮/Esc/遮罩三条既有路径（Esc 语义保留）；
 * ③ whyHit/xrayHit 裸 setItem 合并 useLinkCarry 统一件（payload 逐字保持）；
 * ④ DevTools 本 Tab 历史迁入响应 pane 内折叠区（不再顶高整页滚），高度统一
 *    max(240px, 42vh) 口径；权限降级文案缩为图标+tooltip；draftTimer 手写保留备案
 *    （统一件无 flush API，pagehide flushDraft 需要）。
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createMemoryHistory } from 'vue-router';

const ih = readFileSync(join(__dirname, '../views/IndexHubView.vue'), 'utf-8');
const dt = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

vi.mock('../api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../api')>();
  return {
    ...actual,
    api: {
      ...actual.api,
      overview: () => Promise.resolve({}),
      clusterHealth: () => Promise.resolve({}),
      clusterIndices: () => Promise.resolve([
        { index: 'idx_a', health: 'green', status: 'open', pri: 1, rep: 1, 'docs.count': 10, 'store.size': '1kb' },
      ]),
      setup: { ...actual.api.setup, status: () => Promise.resolve({ bound: true, mode: 'x', endpoint: null, appName: 't', hostVisible: true }) },
    },
  };
});

import IndexHubView from '../views/IndexHubView.vue';

describe('IndexHub ops 区卡中卡降层（五百三十一批，照 530 ir-card 三分节范式）', () => {
  it('分节标题走全局 .sec-t 档（3 常态 + 1 危险区 err 档），card-t sm ih-op-hd 退役', () => {
    /* 正则子串匹配：3 常态 + 1 危险区（带 style）= 4 处 sec-t ih-op-hd */
    expect((ih.match(/class="sec-t ih-op-hd"/g) || []).length).toBe(4);
    expect(ih).toContain('class="sec-t ih-op-hd" style="color:var(--err)"');
    expect(ih, 'card-t sm 旧档不回流').not.toContain('card-t sm ih-op-hd');
  });

  it('分节间上边框分隔（危险区分节 err 档线），操作项描边小卡退役、仅危险区保留描边档', () => {
    expect(ih).toMatch(/\.ih-op-sec \+ \.ih-op-sec \{[^}]*border-top: 1px solid/);
    expect(ih).toMatch(/\.ih-op-sec\.danger \{ border-top-color: var\(--err-line\); \}/);
    expect(ih).toMatch(/\.ih-op-card \{[^}]*\}/);
    expect(ih, '常态操作项不再带描边').toMatch(/\.ih-op-card \{\s*display: flex; flex-direction: column; gap: var\(--sp-1h\); padding: var\(--sp-2h\) var\(--sp-3\);\s*\}/);
    expect(ih, '危险区操作项保留描边档').toContain('.ih-op-sec.danger .ih-op-card { border: 1px solid color-mix(in srgb, var(--err) 35%, var(--line));');
  });

  it('全部 11 个操作入口零丢失（含权限分节锚原样）', () => {
    expect((ih.match(/class="ih-op-card"/g) || []).length).toBe(11);
    /* permGating 221 批锚原样（分节根元素不动，降层只动标题与卡壳） */
    expect(ih).toContain('<div class="ih-op-sec" v-if="canAdmin">');
    expect(ih).toContain('<div class="ih-op-sec danger" v-if="canOps">');
    /* 三分节全部接线：raw 系 3 + 性能维护 3 + 可用性 3 + 危险区 2 */
    expect(ih).toContain(`opRaw('POST', \`/\${cur}/_refresh\``);
    expect(ih).toContain(`opRaw('POST', \`/\${cur}/_flush\``);
    expect(ih).toContain(`opRaw('POST', \`/\${cur}/_cache/clear\``);
    expect(ih).toContain('@click="askForceMerge"');
    expect(ih).toContain('@click="applyRefreshInterval"');
    expect(ih).toContain('@click="applyReplicas"');
    expect(ih).toContain('@click="askClose"');
    expect(ih).toContain('@click="askOpen"');
    expect(ih).toContain('@click="unblock"');
    expect(ih).toContain('@click="askDelIndex"');
    expect(ih).toContain('@click="goto(\'/adhoc-rebuild\')"');
  });
});

describe('IndexHub 状态徽标/分片统计合并（五百三十一批）', () => {
  it('详情头状态徽标换 StatusPill+indexStatusZh（en 档英文小字），裸 status 三元退役', () => {
    expect(ih).toContain('<StatusPill :tone="curInfo?.status === \'open\' ? \'g\' : \'n\'"');
    expect(ih).toContain('indexStatusZh(curInfo?.status)');
    expect(ih, '裸 status pill 手滚三元不回流').not.toContain(`{{ curInfo?.status || '?' }}`);
  });

  it('分片统计四枚举数据驱动（shardSumPills + shardStateZh/shardStateTone），中英混排退役', () => {
    expect(ih).toMatch(/const shardSumPills = computed/);
    expect(ih).toContain('shardStateTone(p.state)');
    expect(ih).toContain('shardStateZh(p.state)');
    expect(ih, 'STARTED 英文裸出不回流').not.toContain('STARTED {{');
  });
});

describe('索引列表抽屉不自动关（五百三十一批，行为锁）', () => {
  let host: HTMLElement;
  beforeEach(() => {
    localStorage.clear();
    host = document.createElement('div');
    document.body.appendChild(host);
  });

  it('行点击/Enter 选中后抽屉保持打开（当前项高亮），Esc/关闭钮路径保留', async () => {
    const router = createRouter({ history: createMemoryHistory(), routes: [{ path: '/', component: { template: '<div/>' } }] });
    await router.push('/');
    await router.isReady();
    const app = createApp({ render: () => h(IndexHubView as any) });
    app.use(createPinia());
    app.use(router);
    app.mount(host);
    for (let i = 0; i < 10; i++) { await nextTick(); await Promise.resolve(); }

    const toggle = host.querySelector('button[aria-label="索引列表"]') as HTMLButtonElement;
    toggle.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.ih-drawer-mask'), '抽屉应打开').toBeTruthy();

    /* 行点击：选中但不自动关（跨索引反复对比）；当前项挂 .on 高亮 */
    const row = host.querySelector('.ih-row') as HTMLElement;
    expect(row, '抽屉内应有索引行').toBeTruthy();
    row.click();
    for (let i = 0; i < 6; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.ih-drawer-mask'), '选中后抽屉必须保持打开').toBeTruthy();
    expect(host.querySelector('.ih-row.on'), '当前项应挂 .on 高亮').toBeTruthy();

    /* Esc 关闭语义保留（capture 监听挂 document，pop 过渡走 Vue 回退 setTimeout） */
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    await vi.waitFor(() => { expect(host.querySelector('.ih-drawer-mask')).toBeNull(); }, { timeout: 2000 });
    app.unmount();
  });

  it('源码锁：行触发表达式不再携 listOpen = false；关闭钮/遮罩/Esc 三路径在场', () => {
    expect(ih).toContain('@click="select(idx.index)"');
    expect(ih, '行选中不再自动关').not.toContain('select(idx.index); listOpen = false');
    expect(ih, '工具行关闭钮保留').toContain('aria-label="关闭索引列表"');
    expect(ih, '遮罩点击关闭保留').toContain('@click.self="listOpen = false"');
    expect(ih, 'Esc capture 监听保留').toContain("document.addEventListener('keydown', onDrawerKeydown, true)");
  });
});

describe('useLinkCarry 合并（五百三十一批）', () => {
  it('whyHit/xrayHit 换统一件，payload 逐字保持；裸 esquerystudio.link.* setItem 字面退役', () => {
    expect(ih).toContain("useLinkCarry<{ index: string; id: string; query: string }>('rankdebug')");
    expect(ih).toContain("useLinkCarry<{ index: string; id: string }>('xray')");
    expect(ih).toContain('rankDebugCarry.send({ index: cur.value, id: hit._id, query: dsl.value });');
    expect(ih).toContain('xrayCarry.send({ index: cur.value, id: hit._id });');
    expect(ih, '裸 setItem 字面不回流（crossNavLinks 旧锚已随批改形）').not.toContain("sessionStorage.setItem('esquerystudio.link.");
  });
});

describe('DevTools 历史落位 + 权限图标（五百三十一批；⚠hist 迁移 P0 回退备案）', () => {
  it('dt-hist 直挂 dt-body（</WorkbenchLayout> 之后）——531 曾迁入响应 pane，产线 2.9.115 暴露与 pane 内 Monaco 100% 的高度棘轮回退；真正根因=dt-body 高度链不定解，以确定高度链根治', () => {
    const wlEndAt = dt.indexOf('</WorkbenchLayout>');
    const histAt = dt.indexOf('class="dt-hist"');
    expect(histAt).toBeGreaterThan(-1);
    expect(histAt).toBeGreaterThan(wlEndAt);
    /* hist 与 WorkbenchLayout 闭合之间不得再出现 pane 标记=确认在 panes 之外直挂 */
    expect(dt.slice(wlEndAt, histAt)).not.toContain('pane-devtools');
    /* 折叠交互与 QHP actions 白名单同步更新零改锚（histCollapse444/devtoolsHist312 同源） */
    expect(dt).toMatch(/<div class="dt-hist-tt" role="button" tabindex="0" :aria-expanded="histOpen"/);
    /* 五百五十一批同步更新（击穿者：551 轨2 刀⑤——历史行 actions 加 'fav' 一键转收藏）：
       白名单锚随字面迁（折叠交互锚零触；fav 消费 store.addFavorite rest 形态，零新存储键）。
       五百五十二批同步更新（击穿者：552 轨2 刀④——actions 窄集加 'curl' 一键复制 curl，
       面板行级仅 emit、组装归宿主 histCurl）：五动作形随字面迁为六动作形 */
    /* 五百六十一批同步更新（击穿者：561 B2 刀①——actions 窄集加 'newtab' 回放到新 Tab）：
       六动作形随字面迁为七动作形（面板行级仅 emit，mkTab+激活跳转归宿主 histNewTab；
       折叠交互锚零触） */
    expect(dt).toMatch(/:actions="\['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del'\]"/);
  });

  it('P0 根治锚：dt-body 确定高度链（height calc(100vh-vh-offset)）+ wl 可收缩；棘轮教训注释在场', () => {
    expect(dt).toContain('.dt-body { padding: var(--sp-3) var(--sp-1); display: flex; flex-direction: column; gap: var(--sp-2); height: calc(100vh - var(--vh-offset)); }');
    expect(dt).toContain('.dt-body :deep(.wl) { flex: 1 1 auto; min-height: 0; }');
    expect(dt).toContain('正反馈棘轮');
  });

  it('高度口径统一 max(240px, 42vh)；clamp(200px,34vh,420px) 退役', () => {
    expect(dt).toContain('.dt-hist-list :deep(.qhp-list) { max-height: max(240px, 42vh); }');
    expect(dt).not.toContain('clamp(200px, 34vh, 420px)');
  });

  it('权限降级文案缩为图标+tooltip（原文案字面保留在 aria/title），draftTimer 手写保留备案', () => {
    expect(dt).toContain('class="dt-perm-dim" tabindex="0" role="img" aria-label="运行需 ADMIN 角色"');
    expect(dt).toContain('<ShieldAlert :size="13" />');
    expect(dt, 'permGating 可见性语义锚零漂移').toContain('运行需 ADMIN 角色');
    /* 备案：draftTimer 不换 useDebounceFn——统一件无 flush API，pagehide flushDraft 需要 */
    expect(dt).toContain('let draftTimer');
    expect(dt).toContain('function flushDraft()');
  });
});
