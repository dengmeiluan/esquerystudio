/**
 * 五百三十四批·轨2（工蚁 W2）：AdhocRebuild / Xmigrate / ReindexPreview 扁平化降层 · 契约备案。
 *
 * ① AdhocRebuild：ar-paste/ar-manual 编辑器外框（bg0+border 壳直包编辑器）退役→编辑器直贴；
 *    引导标题升 fs-head 档行首横排；ar-input-tabs 降全局 seg 档（bg2+2px 内衬+小圆角）；
 *    P1：settings/mapping 四编辑框 lint 划线接线（SearchSandboxView 范式：
 *    useDebounceFn 250ms + setMarkers + info→hint 降级；档路由 lintSettingsBody/lintMappingBody）。
 *    ⚠粘贴 Monaco height="min(60vh, 420px)" 字面被 rebuildThreeState/adhocDerivedMapping/
 *    rebuildMigrate531 锁——只去壳不改字面。（五百三十八批同步更新：定高字面升 useTierCycle
 *    四档 :height="pasteH"，原字面=档值数组首位默认档保底，本文件高度锁同步换锚。）
 * ② Xmigrate：xm-group/xm-remote border 壳退役→border-top+sec-t（531 去 background 后下半刀）；
 *    xm-src-picked border 盒→inline 行；常规流零高度链。
 *    ⚠rebuildMigrate531 字面锁 .xm-group 531 形态与 900 档 .xm-remote padding——
 *    以后置覆盖承接裁决，锁面字面原样保留（rebuildMigrate531 必保绿）。
 * ③ ReindexPreview：rp.result 竖排标题「预估结果」退役（title:''+语义落行首 card-t sm，
 *    519 约定补账）；.panel 死类名 ×3 清理；search body lintDsl+setMarkers 接线。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const adhoc = read('../views/AdhocRebuildView.vue');
const xm = read('../views/XmigrateView.vue');
const rp = read('../views/ReindexPreviewView.vue');

/* ═══════════ ① AdhocRebuildView ═══════════ */
describe('五百三十四批：AdhocRebuild 编辑器壳退役 + seg 档 + lint 接线', () => {
  it('ar-paste 壳退役（bg0/border/radius/padding 清零，margin 保留），类锚保留', () => {
    expect(adhoc).toContain('.ar-paste { margin-bottom: var(--sp-3); }');
    expect(adhoc, 'bg0 壳不回流').not.toMatch(/\.ar-paste \{[^}]*background/);
    expect(adhoc, 'border 壳不回流').not.toMatch(/\.ar-paste \{[^}]*border/);
    expect(adhoc, '内衬壳不回流').not.toMatch(/\.ar-paste \{[^}]*padding/);
    expect(adhoc, '类锚保留（adhocDerivedMapping/adhocDiffWiring 消费）').toContain('class="ar-paste"');
  });

  it('ar-manual 壳退役，引导标题升 fs-head 档行首横排', () => {
    expect(adhoc, 'ar-manual 壳规则退役').not.toMatch(/\.ar-manual \{[^}]*border/);
    expect(adhoc, 'ar-manual bg 壳不回流').not.toMatch(/\.ar-manual \{[^}]*background/);
    /* 五百五十批同步更新：步骤标题 b→strong 纯语义清理（flattenWave550⑧），选择器随元素同步更新，
       规则体字面零变动（.strat strong 补 font-weight:650 因 b 全站兜底不盖 strong） */
    expect(adhoc).toMatch(/\.ar-paste-hd strong \{ font-size: var\(--fs-md\); font-weight: 650; color: var\(--tx0\); letter-spacing: var\(--ls-tight\); \}/);
    expect(adhoc).toMatch(/\.ar-manual-hd strong \{ font-size: var\(--fs-md\); font-weight: 650; color: var\(--tx0\); letter-spacing: var\(--ls-tight\); \}/);
  });

  it('⚠粘贴 Monaco 高度档：useTierCycle 四档（原 min(60vh, 420px) 字面在档值数组首位保底）', () => {
    /* 五百三十八批同步更新：height="min(60vh, 420px)" 定高字面 → :height="pasteH" 档值绑定
       （useTierCycle+usePref 落盘；原字面=档值数组首位=默认档，默认形态高度行为一致，
       档值全部为确定解）。旧 min(200px, 24vh) 档不回流断言原样保留 */
    expect(adhoc).toContain("'min(60vh, 420px)'");
    expect(adhoc).toContain("const { v: pasteH, cycle: cyclePasteH } = useTierCycle('adhoc.pasteH', PASTE_H_TIERS);");
    expect(adhoc).toContain(':height="pasteH"');
    expect(adhoc).toContain('data-ar-paste-h');
    expect(adhoc).not.toContain('min(200px, 24vh)');
  });

  it('ar-input-tabs 降全局 seg 档（bg2+内衬+--r-m 圆角+bg3 浮起态；border 壳退役）', () => {
    /* 554 同步更新：容器 gap/padding 2px 收口 var(--sp-0)（等值，w10/spSweep540/adhocWave544 同批同步更新） */
    expect(adhoc).toMatch(/\.ar-input-tabs \{ display: inline-flex; gap: var\(--sp-0\); padding: var\(--sp-0\); background: var\(--bg2\); border-radius: var\(--r-m\); margin-bottom: var\(--sp-3\); \}/);
    expect(adhoc, '旧 border 壳不回流').not.toMatch(/\.ar-input-tabs \{[^}]*border:/);
    expect(adhoc).toContain('.ar-input-tabs button.on { background: var(--bg3); color: var(--tx0); box-shadow: 0 1px 3px rgba(0,0,0,.3); font-weight: 600; }');
    /* rebuildMigrate531 结构序锚字面保留 */
    expect(adhoc).toContain('<div class="ar-input-tabs">');
  });

  it('P1：四编辑框 lint 划线接线（SearchSandboxView 范式：250ms 防抖 + setMarkers + info→hint）', () => {
    expect(adhoc).toContain("import { lintSettingsBody, lintMappingBody, type Finding } from '../utils/dslLint';");
    expect(adhoc).toContain("import { useDebounceFn } from '../composables/useDebounceFn';");
    expect(adhoc).toMatch(/const queueArLint = useDebounceFn\(\(\) => \{/);
    expect(adhoc).toContain('}, 250);');
    expect(adhoc).toContain('mark(setJaRef, settingsJson.value, lintSettingsBody);');
    expect(adhoc).toContain('mark(mapJaRef, mappingJson.value, lintMappingBody);');
    expect(adhoc).toContain('mark(manualSetJaRef, manualSettings.value, lintSettingsBody);');
    expect(adhoc).toContain('mark(manualMapJaRef, manualMapping.value, lintMappingBody);');
    /* setMarkers 透传口 + info→hint 降级（MonacoEditor 结构类型只收 warning/hint/error） */
    expect(adhoc).toContain("r.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));");
    /* 四 JsonArea ref 挂载锚 */
    for (const r of ['ref="setJaRef"', 'ref="mapJaRef"', 'ref="manualSetJaRef"', 'ref="manualMapJaRef"']) {
      expect(adhoc).toContain(r);
    }
    /* 非法 JSON 不 lint（JsonArea 圆点已报） */
    expect(adhoc).toMatch(/function parseArBody\(t: string\): Record<string, unknown> \| null \{/);
  });

  it('⚠同步更新声明：531 锁面字面原样保留（Workbench 双栏/pane spec/val-box 弹性档/QRT none）', () => {
    /* 547 批同步更新：两开标签尾部扩 :fill-viewport="false"（向导行动行留首屏，DslQueryView 先例；锁语义不变仍钉双栏声明形态）
       554 批同步更新：两开标签头部补 class="ar-fill-wl"（554-P0 高度档锚，554-P2 rows 驱动后类保留作 DOM 锚） */
    expect(adhoc).toMatch(/<WorkbenchLayout class="ar-fill-wl" :scope="arEdScope" :panes="AR_ED_PANES" axis="vertical" mode="arEditors" :fill-viewport="false">/);
    expect(adhoc).toMatch(/<WorkbenchLayout class="ar-fill-wl" :scope="arManualScope" :panes="AR_MANUAL_PANES" axis="vertical" mode="arManual" :fill-viewport="false">/);
    expect(adhoc).toMatch(/\.val-box \{[^}]*max-height: max\(240px, 42vh\);/);
    expect(adhoc).toMatch(/storage-key="adhoc:jobs" max-height="none"/);
  });
});

/* ═══════════ ② XmigrateView ═══════════ */
describe('五百三十四批：Xmigrate 分节降层（531 去 background 后下半刀）', () => {
  it('xm-group border 壳退役→border-top 分节分隔（534 覆盖行承接；531 死规则 547 批退役）', () => {
    /* 五百四十七批锁同步更新：531 形态字面原为「死规则在场」锁（被下行覆盖压死），
       547 批将死规则退役删除——断言由「在场」改「退役」，缘由同 rebuildMigrate531 同步更新注 */
    expect(xm).not.toMatch(/\.xm-group \{ margin-bottom: var\(--sp-3\); padding: var\(--sp-2\) var\(--sp-3\); border: 1px solid var\(--line\); border-radius: var\(--r-m\); \}/);
    expect(xm).not.toMatch(/\.xm-group \{[^}]*background/);
    /* 534 覆盖行：读侧以此为准（现行唯一生效形态，cardShellWave547 复锁） */
    expect(xm).toContain('.xm-group { margin-bottom: 0; padding: var(--sp-2) 0 0; border: 0; border-top: 1px solid var(--line); border-radius: 0; }');
    /* 编号语义保留（rebuildMigrate531 锚） */
    expect(xm).toContain('<span class="xm-g-num">1</span>');
    expect(xm).toContain('<span class="xm-g-num">2</span>');
    expect(xm).toContain('<span class="xm-g-num">3</span>');
  });

  it('三分节标题走全局 .sec-t 档；xm-remote border 壳退役→border-top+sec-t；src-picked 盒退役', () => {
    expect((xm.match(/class="xm-g-hd sec-t"/g) || []).length).toBe(3);
    expect(xm).toContain('class="xm-r-t sec-t"');
    expect(xm).toMatch(/\.xm-remote \{ margin-top: var\(--sp-3\); border: 0; border-top: 1px solid var\(--line\); padding: var\(--sp-2\) 0 0; \}/);
    expect(xm, '旧 border 盒不回流').not.toMatch(/\.xm-remote \{[^}]*background/);
    expect(xm, 'src-picked 盒规则退役（类保留作 DOM 锚）').not.toMatch(/\.xm-src-picked \{/);
    expect(xm).toContain('class="xm-conn xm-src-picked"');
    /* rebuildMigrate531 必保绿：900 档 .xm-remote padding 字面保留 */
    const block = xm.match(/@media \(max-width: 900px\) \{[\s\S]*?\n\}/);
    expect(block![0]).toContain('.xm-remote { padding: var(--sp-2); }');
    expect(block![0]).toContain('.xm-actions { flex-wrap: wrap; gap: var(--sp-2); }');
  });

  it('常规流零高度链声明：改动只涉 border/底色/圆角/内衬，零 height/min-height 新增', () => {
    /* 取三段改动区（xm-group 覆盖行→xm-g-num、xm-src-picked 注→xm-paste、xm-remote 注→xm-r-list）逐一验 */
    const seg = (from: string, to: string) => xm.slice(xm.indexOf(from), xm.indexOf(to));
    for (const [from, to] of [
      ['五百三十四批：分节降层下半刀', '.xm-g-num'],
      ['五百三十四批：.xm-src-picked border 盒退役', '.xm-hdot'],
      ['五百三十四批：.xm-remote border 盒退役', '.xm-r-list'],
    ] as [string, string][]) {
      const cut = seg(from, to);
      expect(cut, `${from} 段不得新增高度语义`).not.toMatch(/(^|[^-])height:/);
      expect(cut, `${from} 段不得新增 min-height`).not.toContain('min-height');
    }
  });
});

/* ═══════════ ③ ReindexPreviewView ═══════════ */
describe('五百三十四批：ReindexPreview 竖排标题退役 + panel 清理 + lint 接线', () => {
  it('rp.result 竖排标题「预估结果」退役（title:\'\')+语义落行首 card-t sm（519 约定补账）', () => {
    expect(rp).toMatch(/\{ id: 'rp\.result', role: 'response', title: '', minSize: 360, defaultSize: 'flex' \}/);
    expect(rp, '竖排标题字面不回流').not.toContain("title: '预估结果'");
    expect(rp).toContain('<div class="rp-hd">');
    expect(rp).toContain('<div class="card-t sm">预估结果</div>');
    /* freeEditorTiers530 锁面同步更新：rp-adv 类挂钮 + 前缀字面 + 空壳 div 不回流 */
    expect(rp).toContain('class="btn sm ghost rp-adv"');
    expect(rp).toMatch(/\.rp-adv \{ display: block; margin-left: auto;/);
    expect(rp).not.toContain('<div class="rp-adv">');
  });

  it('.panel 死类名 ×3 清理（全仓无定义，防回潮）', () => {
    expect(rp, 'panel 死类不回流').not.toMatch(/class="[^"]*\bpanel\b[^"]*"/);
    expect(rp).toContain('class="rp-bar"');
    expect(rp).toContain('class="rp-left"');
    expect(rp).toContain('class="rp-right"');
  });

  it('search body lintDsl+setMarkers 接线（SearchSandboxView 范式逐字）', () => {
    expect(rp).toContain("import { lintDsl } from '../utils/dslLint';");
    expect(rp).toContain("import { useDebounceFn } from '../composables/useDebounceFn';");
    expect(rp).toMatch(/const queueRpLint = useDebounceFn\(\(\) => \{/);
    expect(rp).toContain('}, 250);');
    expect(rp).toContain('const findings = parsedRpBody.value ? lintDsl(parsedRpBody.value, { fields: rpFields.value }) : [];');
    expect(rp).toContain("rpJaRef.value?.setMarkers?.(findings.map(f => ({ ...f, severity: f.severity === 'info' ? 'hint' as const : f.severity })));");
    expect(rp).toContain('ref="rpJaRef"');
    /* watch 即时首跑（draft 稿恢复即出划线） */
    expect(rp).toContain('watch(queryBody, () => queueRpLint(), { immediate: true });');
  });
});

/* ═══════════ ④ 五百三十五批 W4（追加）：val-box 卡中卡降层 ═══════════
   bg0+四边 border 圆角壳退役→border-top 分节（xm-group 同刀）；.val-hd 升 sec-t 档；
   531 弹性档口径（max(240px,42vh) 滚动钳制）原样保留——rebuildMigrate531:211 字面锁必保绿 */
describe('五百三十五批 W4：val-box 壳退役（border-top 分节 + sec-t 档，滚动钳制口径保留）', () => {
  it('val-box 壳退役：bg0/圆角/四边 border 不回流，border-top 分节形态在场', () => {
    expect(adhoc).toContain('.val-box { margin: var(--sp-2h) 0; padding: var(--sp-2h) 0 0; border: 0; border-top: 1px solid var(--line); max-height: max(240px, 42vh); overflow: auto; }');
    expect(adhoc, 'bg0 壳不回流').not.toMatch(/\.val-box \{[^}]*background/);
    expect(adhoc, '圆角壳不回流').not.toMatch(/\.val-box \{[^}]*border-radius/);
    expect(adhoc, '四边 border 壳不回流').not.toMatch(/\.val-box \{[^}]*border: 1px/);
    /* 531 口径注释随行（弹性档来源双锚） */
    expect(adhoc).toContain('max(240px, 42vh) 弹性档');
  });

  it('val-hd 升 sec-t 档（fs-sm/600/tx1）；StatusPill 行不动', () => {
    expect(adhoc).toMatch(/\.val-hd \{ display: flex; align-items: baseline; gap: var\(--sp-2h\); margin-bottom: var\(--sp-1h\); font-size: var\(--fs-sm\); font-weight: 600; color: var\(--tx1\); \}/);
    expect(adhoc).toContain('<StatusPill :tone="sevTone(iss.severity)" :label="sevZh(iss.severity)" :en="iss.severity" />');
  });
});

/* ═══════════ ⑤ ReindexPreview 五百三十五批 W3（追加）：Ctrl+Enter 直连 + 页内历史出口 ═══════════
   ①②③ describe（534 锁面）一字不动，本块只追加。行为面在 histPanel535.spec.ts（挂载型） */
describe('五百三十五批 W3：ReindexPreview Ctrl+Enter + 页内历史', () => {
  it('JsonArea 尾追 @submit="run"（Ctrl+Enter 直连；既有属性序与字面锚保序不破）', () => {
    /* 尾追形态锁定：v-model/ref/rows/fill/dsl-assist 原序在前，@submit 只在尾部追加 */
    expect(rp).toContain('<JsonArea v-model="queryBody" ref="rpJaRef" :rows="11" fill :dsl-assist="rpAssist" @submit="run" />');
  });

  it('引导空态 hint 补 Ctrl+Enter 快捷键提示', () => {
    expect(rp).toMatch(/<EmptyState v-else-if="!result && !runErr" :icon="Calculator" text="选择源索引后点击「运行预估」" hint="编辑器内 Ctrl\+Enter 亦可运行" \/>/);
  });

  it('run 成功端到端实测入史（performance.now 计时 + mode=reindex-preview；失败不占史位）', () => {
    expect(rp, '端到端计时起点在请求前').toContain('const t0 = performance.now();');
    expect(rp).toContain("useQueryHistoryStore().push('reindex-preview', queryBody.value, source.value, Math.round(performance.now() - t0), true);");
    /* push 只在成功分支（result.value = r 之后、catch 之前） */
    const runSeg = rp.slice(rp.indexOf('async function run()'), rp.indexOf('function reset()'));
    expect(runSeg).toMatch(/result\.value = r;[\s\S]*?useQueryHistoryStore\(\)\.push/);
  });

  it('页头历史钮 data-test="open-hist" + NModal + QueryHistoryPanel 接线（SqlConsoleView 528 范式）', () => {
    expect(rp).toContain('data-test="open-hist"');
    expect(rp).toMatch(/<n-modal v-model:show="histOpen" preset="card" title="查询历史（Reindex 预估）"/);
    expect(rp).toContain(":items=\"histRows\" :actions=\"['play', 'fill', 'copy', 'del']\" :clearable=\"false\" :importable=\"false\"");
    expect(rp).toContain('@play="replayHistRow" @fill="replayHistRow" @del="h => qh.removeOne(h.id)"');
    /* took 口径换端到端实测（QueryHistoryPanel tookTip 预留口，防缺省 ES took 文案与数据源不符） */
    expect(rp).toContain('took-tip="端到端实测耗时（performance.now 计时，含网络往返；非 ES took 字段口径）"');
    /* mode 单档过滤 + 回放=回填 queryBody 草稿（§6u 裁决：不自动跑） */
    expect(rp).toContain("const histRows = computed(() => qh.items.filter(i => i.mode === 'reindex-preview'));");
    expect(rp).toMatch(/function replayHistRow\(row: \{ query: string \}\) \{\s*queryBody\.value = row\.query;\s*histOpen\.value = false;\s*\}/);
  });
});
