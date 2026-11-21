/**
 * R92-A4 守门契约：三态（加载/失败/空）——异步 view 必须有失败重试路径，
 * 有列表渲染必须有空态文案。新增异步 view 忘做失败态会在此报警。
 *
 * 事故背景：R91b 产线 mapping 拉取失败被伪装成「未加载」空态误导排障；
 * R92 T5 全量修复 46 个 view 后以本测试防回归。
 *
 * 豁免名单与 scripts/audit-three-state.mjs 同步维护（两处都要改），
 * 新增豁免必须写理由，禁止无名单直接放行。
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/* 人工复核白名单：确认非真缺口的 view（理由详见 audit-three-state.mjs） */
const WHITELIST: Record<string, string> = {
  'PluginsView.vue': 'available/reason 机制 +「重新加载」按钮覆盖失败态',
  'WorkspaceView.vue': 'R42 §8.2 卡片级失败记名透传 + 卡片内重新加载',
  'AnalyzeView.vue': '手动运行型工作台，err-bar 面板内联透传，重跑即重试',
  'AdhocRebuildView.vue': '向导主流程无列表空态问题；辅助卡失败已 toast 透传',
  /* 第十批：lintDsl 警告条 v-for 非数据列表——query 单操作工作台无列表空态问题 */
  'UpdateByQueryView.vue': 'lintDsl 警告条 v-for 非数据列表；失败经 toast/err 透传，重跑即重试',
};

/* 手动触发工作台豁免组：加载由用户点击触发，失败经 toast/内联透传，重跑即重试。
 * G4 移出：LifecycleView.vue——onMounted 自动拉取，不属手动工作台；已补三态转启发式正向守护。
 * G8 移出：轮 I search 域 10 个（AnalysisSettings/BoostTuner/LuceneQuery/MatchMatrix/ProfileFlame/
 * QueryXray/RankDebug/ScoreExplain/SearchTemplates/SqlConsole）与轮 II 达标 9 个（ReindexAdvanced/
 * ReindexPreview/UpdateByQuery/DiffEditor/ConfigValidator/IndexOptimizer/Rest/DevTools/HealthReport），
 * 均已达标，转启发式正向守护。
 * G8 留册：AnalyzerLabView.vue——lane 级 al-err 内联透传、重跑即重试，无「重试」字面属启发式盲区；
 * SynonymsManagerView.vue——加载由用户点击触发，失败经 pushLog+notify 透传，分类成立；
 * SqlBridgeView.vue——唯一 v-for 渲染静态 COMPARE 对照表，空态判定属启发式误报。 */
const MANUAL_WORKBENCH = [
  'AnalyzerLabView.vue', 'BulkEditorView.vue', 'PitScrollView.vue',
  'SqlBridgeView.vue', 'SynonymsManagerView.vue',
];

const dir = join(__dirname, '..', 'views');
const files = readdirSync(dir).filter(f => f.endsWith('.vue'));

describe('R92 三态契约：异步 view 必须有失败重试与空态', () => {
  for (const f of files) {
    if (WHITELIST[f] || MANUAL_WORKBENCH.includes(f)) continue;
    const s = readFileSync(join(dir, f), 'utf8');
    if (!/await\s+api\.|fetch\(|await\s+Promise\.all\(/.test(s)) continue;

    it(`${f} 有「重试」路径`, () => {
      expect(/重试/.test(s), `${f} 是异步 view 但没有失败重试 UI（豁免需记名 audit-three-state.mjs + 本文件）`).toBe(true);
    });

    if (/v-for=/.test(s)) {
      it(`${f} 有空态处理`, () => {
        const hasEmpty = /暂无|无数据|无任务|未配置|EmptyState|empty-state|class="empty"|[a-z]+-empty[" ]/.test(s);
        expect(hasEmpty, `${f} 有列表渲染但没有空态文案`).toBe(true);
      });
    }
  }

  it('豁免名单不含已修复的 view（防名单腐化）', () => {
    /* 已在 R92 T5 / UX 轮 II G4 落了失败态的 view 不该再进豁免名单 */
    const fixed = ['TasksView.vue', 'SnapshotsView.vue', 'SecurityView.vue', 'LifecycleView.vue'];
    for (const f of fixed) {
      expect(WHITELIST[f], `${f} 已有完整三态，不应在白名单`).toBeUndefined();
      expect(MANUAL_WORKBENCH.includes(f), `${f} 是自动加载页，不属手动工作台`).toBe(false);
    }
  });
});
