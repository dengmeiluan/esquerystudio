/**
 * 五百三十四批·轨4（工蚁 W4）：全站扁平化扫荡 + 统一组件化（§6v 四刀约定推广面）。
 * 仿 selectorUnify532 源码锁范式（涉 Monaco 视图一律静态源断言，happy-dom 不挂载）：
 * ① 六 Workbench 视图 pane spec `title: ''` 在场（竖排标题轨退役防回潮，519/DevTools 先例）；
 * ② 六视图 pane 内第一层卡壳类清零（局部壳 bg+border+radius 退役，刀③④）；
 * ③ IndexSettings/Snapshots 空态空框类清零（刀④——空态不留整块空框）；
 * ④ SearchSandbox 卡头标题语义在场（title 置空后单源承接锚，消重不消义）；
 * ⑤ 负向：layoutOcclusionGuard501 锁的 ResizablePane 竖排标题轨 CSS 形态零触碰；
 * ⑥ P1-1 同构确认弹窗壳合并：ModalShell 单源在场，双实现 mask/box 手搓壳清零，
 *    业务体契约锚（cf-foot/ga-foot/guard 输入/askConfirm 契约）逐块保位。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');

/* ═══════════ ① 六视图 pane spec title 置空（竖排轨退役防回潮） ═══════════ */

const PANE_TITLE_EMPTY: Record<string, RegExp[]> = {
  LuceneQueryView: [
    /id: 'lucene\.editor', role: 'request', title: '', minSize: 300, defaultSize: 380, collapsible: true/,
    /id: 'lucene\.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex'/,
  ],
  SearchSandboxView: [
    /id: 'sandbox\.editor', role: 'request', title: '', minSize: 300, defaultSize: 420, collapsible: true/,
    /id: 'sandbox\.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex'/,
  ],
  AnalyzeView: [
    /id: 'analyze\.input', role: 'request', title: '', minSize: 280, defaultSize: 420, collapsible: true/,
    /id: 'analyze\.result', role: 'response', title: '', minSize: 320, defaultSize: 'flex'/,
  ],
  BulkEditorView: [
    /id: 'bulkeditor\.params', role: 'request', title: '', minSize: 220, defaultSize: 260, collapsible: true/,
    /id: 'bulkeditor\.editor', role: 'response', title: '', minSize: 360, defaultSize: 'flex'/,
  ],
  ConfigDriftView: [
    /id: 'configdrift\.list', role: 'request', title: '', minSize: 200, defaultSize: 260, collapsible: true/,
    /id: 'configdrift\.detail', role: 'response', title: '', minSize: 320, defaultSize: 'flex'/,
  ],
  BoostTunerView: [
    /id: 'boosttuner\.params', role: 'request', title: '', minSize: 300, defaultSize: 360, collapsible: true/,
    /id: 'boosttuner\.result', role: 'response', title: '', minSize: 340, defaultSize: 'flex'/,
  ],
};

describe('五百三十四批①：六视图 pane spec title 置空（§6v 刀①竖排轨退役防回潮）', () => {
  it('每视图双 pane spec title: \'\' 在场（尺寸字面与角色零变动）', () => {
    for (const [view, regexes] of Object.entries(PANE_TITLE_EMPTY)) {
      const s = read(`../views/${view}.vue`);
      for (const re of regexes) {
        expect(s, `${view} pane spec 必须 title: ''（竖排标题轨退役，519 先例）`).toMatch(re);
      }
      expect(s, `${view} 不得回潮 pane title 文本（竖排轨双标题）`).not.toMatch(/role: 'request', title: '[^']/);
      expect(s, `${view} 不得回潮 pane title 文本（竖排轨双标题）`).not.toMatch(/role: 'response', title: '[^']/);
    }
  });
});

/* ═══════════ ② pane 内卡壳类清零（刀③④：内容直贴，分界归 fs-head border-bottom） ═══════════ */

const SHELL_GONE: Record<string, RegExp[]> = {
  /* .lc-card 壳类（×5：editor/tpl/syntax/warn/result）；lc-card-hd 横排头承接保留 */
  LuceneQueryView: [/class="lc-card[" ]/],
  /* 全局 .card 壳（ss-editor/ss-result）；pane 外顶栏 .ss-bar 不在禁列 */
  SearchSandboxView: [/class="card ss-/],
  AnalyzeView: [/class="card av-/],
  /* .be-card 壳（×3：params/editor/result）；be-card-editor 弹性链与 be-card-hd 横排头保留 */
  BulkEditorView: [/class="be-card[" ]/],
  /* .cd-card 壳（×2：settings/mapping）；cd-card-hd 横排头与 cd-verdict 徽标锚保留 */
  ConfigDriftView: [/class="cd-card"/],
  /* .bt-card 壳（×2：fields/query）；bt-card-hd 横排头与 bt-card-q 弹性链保留 */
  BoostTunerView: [/class="bt-card[" ]/],
};

describe('五百三十四批②：六视图 pane 内卡壳类清零（§6v 刀③④防回潮）', () => {
  it('pane slot 第一层禁 .card/局部壳类（横排头 *-hd 与弹性链类不在禁列）', () => {
    for (const [view, regexes] of Object.entries(SHELL_GONE)) {
      const s = read(`../views/${view}.vue`);
      for (const re of regexes) {
        expect(s, `${view} 卡壳类必须退役（pane 即容器，内容直贴）`).not.toMatch(re);
      }
    }
  });

  it('横排头承接锚在场（刀②：标题语义并入行首横排）', () => {
    expect(read('../views/LuceneQueryView.vue')).toMatch(/class="lc-card-hd"/);
    expect(read('../views/BulkEditorView.vue')).toMatch(/<div class="be-card-hd"><span>参数<\/span><\/div>/);
    expect(read('../views/ConfigDriftView.vue')).toMatch(/<span class="cd-list-tt">对象清单<\/span>/);
    expect(read('../views/BoostTunerView.vue')).toMatch(/class="bt-card-hd"/);
    /* 高度结构语义零变动锚：flex 链/min-height 钳制逐字保位 */
    expect(read('../views/LuceneQueryView.vue')).toMatch(/\.lc-result \{ flex: 1 1 auto; display: flex; flex-direction: column; min-height: 0; \}/);
    expect(read('../views/BulkEditorView.vue')).toMatch(/\.be-card-editor \{ height: 100%; display: flex; flex-direction: column; \}/);
    expect(read('../views/BoostTunerView.vue')).toMatch(/\.bt-card-q \{ flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; \}/);
  });
});

/* ═══════════ ③ 空态空框清零（刀④：EmptyState 裸置） ═══════════ */

describe('五百三十四批③：空态整块空框清零（IndexSettings/Snapshots）', () => {
  it('.is-empty-card / .sv-empty-card 模板类与壳规则双双清零', () => {
    const isv = read('../views/IndexSettingsView.vue');
    const sv = read('../views/SnapshotsView.vue');
    expect(isv, 'IndexSettings 空态空壳类退役').not.toMatch(/is-empty-card/);
    expect(sv, 'Snapshots 空态空壳类退役').not.toMatch(/sv-empty-card/);
    /* EmptyState 统一件仍在场（裸置≠裸文案） */
    expect(isv).toMatch(/<EmptyState/);
    expect(sv).toMatch(/<EmptyState/);
    /* 五百四十七批锁同步更新：「失败态整卡（card is-empty）保留」豁免备案被 547 批约定推翻
       （538「空态不留整块空框」续扫——失败态同属空框，EmptyState centered 直贴承接），
       断言由「整卡在场」改「整卡退役」，锚见 emptyFrameZero547 */
    expect(isv, '失败态整卡随 547 批约定退役（原刀④豁免备案推翻）').not.toMatch(/class="card is-empty"/);
  });
});

/* ═══════════ ④ SearchSandbox 卡头标题语义在场（消重不消义） ═══════════ */

describe('五百三十四批④：SearchSandbox 卡头标题单源承接', () => {
  it('Request DSL / Response 卡头文案在场（pane title 置空后唯一出处）', () => {
    const s = read('../views/SearchSandboxView.vue');
    expect(s, 'Request DSL 语义由卡头承接').toContain('Request DSL');
    expect(s, 'Response 语义由卡头承接').toContain('Response');
  });
});

/* ═══════════ ⑤ 负向→554 同步更新：ResizablePane 竖排标题轨 CSS 退役（501 锚面翻负） ═══════════ */

describe('五百三十四批⑤→554 同步更新：ResizablePane 竖排标题轨退役（layoutOcclusionGuard501 同锚翻负）', () => {
  it('axis-vertical > .rp-title 竖排轨退役（消费端 519/538 批起全量 title:\'\' 清零，死码轨本体随 554 退役；横排 title 头分支保留）', () => {
    const rp = read('../components/ResizablePane.vue');
    expect(rp).not.toMatch(/\.axis-vertical > \.rp-title/);
    expect(rp, '竖排 writing-mode 随轨退役').not.toContain('writing-mode');
    expect(rp, '横排 title 头分支保留（非竖排轨范式射程，554 备案）').toContain('v-if="title"');
  });
});

/* ═══════════ ⑥ P1-1 同构确认弹窗壳合并（ModalShell 单源） ═══════════ */

describe('五百三十四批⑥：ConfirmModal/GuardedActionButton 壳合并 ModalShell 单源', () => {
  const cm = read('../components/ConfirmModal.vue');
  const ga = read('../components/GuardedActionButton.vue');
  const ms = read('../components/ModalShell.vue');

  it('ModalShell 在场且双组件消费（mask+box 结构单源）', () => {
    expect(ms).toMatch(/class="msk-mask"/);
    expect(ms).toMatch(/class="msk-box"/);
    expect(cm).toContain("import ModalShell from './ModalShell.vue';");
    expect(ga).toContain("import ModalShell from './ModalShell.vue';");
    expect(cm).toMatch(/<ModalShell :show="show" :label="title"/);
    expect(ga).toMatch(/<ModalShell :show="modalOpen" label="影响预估"/);
  });

  it('双实现手搓 mask/box 壳清零（业务体类名契约保留）', () => {
    expect(cm, 'cf-mask 手搓壳退役').not.toMatch(/\.cf-mask \{/);
    expect(ga, 'ga-mask 手搓壳退役').not.toMatch(/\.ga-mask \{/);
    expect(cm, '.cf box 壳规则退役').not.toMatch(/\.cf \{/);
    expect(ga, '.ga box 壳规则退役').not.toMatch(/\.ga \{/);
    /* 业务体锚逐块保位 */
    expect(cm).toMatch(/class="cf-foot"/);
    expect(ga).toMatch(/class="ga-foot"/);
    expect(cm).toMatch(/ref="guardRef"/);
    expect(cm).toMatch(/rememberConfirmSkip\(props\.title\)/);
    expect(ga).toMatch(/api\.insight\.estimate\(props\.actionId, props\.params\)/);
  });

  it('语义边框与宽度档经壳 prop 透传（33 个 askConfirm 消费视图零改的前提：props/emits 契约不动）', () => {
    expect(cm, 'err/warn 语义边框走 --msk-bd').toMatch(/:line="mskLine"/);
    expect(ms).toMatch(/--msk-bd/);
    expect(cm, '宽度档 info 460').toMatch(/width="460px"/);
    expect(ga, '宽度档散值 480 不迁（theme.css 档注备案）').toMatch(/width="480px"/);
    expect(cm).toMatch(/emit\('confirm'\)/);
    expect(cm).toMatch(/emit\('update:show', false\)/);
    expect(ga).toMatch(/\(e: 'executed', receipt: any\): void/);
  });
});
