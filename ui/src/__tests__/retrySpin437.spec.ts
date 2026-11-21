/**
 * 四百三十七批：全站「重试」钮图标旋转统一（419 刷新钮同族延伸）——
 * 五处重试钮（AnalysisSettings/ConfigDrift/BulkEditor/Mapping/IndexSettings）补
 * spinning 旋转与缺失的 disabled 绑定（Mapping/IndexSettings 此前重试可连点）。
 * Diag 已有 spinning 范式（retrying）保留为口径出处。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');

describe('重试钮旋转统一（437 批）', () => {
  const cases: [string, string][] = [
    ['AnalysisSettingsView.vue', 'spinning: busy'],
    ['ConfigDriftView.vue', 'spinning: loadingKeys'],
    ['BulkEditorView.vue', 'spinning: submitting'],
    ['MappingView.vue', 'spinning: loading'],
    ['IndexSettingsView.vue', 'spinning: loading'],
  ];
  for (const [f, binding] of cases) {
    it(`${f} 重试钮 spinning`, () => {
      const v = readFileSync(join(SRC, 'views', f), 'utf-8');
      expect(v, f).toContain(`:class="{ ${binding} }"`);
    });
  }

  it('Mapping/IndexSettings 重试钮防重入 disabled 在场', () => {
    expect(readFileSync(join(SRC, 'views/MappingView.vue'), 'utf-8')).toMatch(/@click="load" :disabled="loading"/);
    /* 547 批同步更新：IndexSettings 失败态整卡（card is-empty）退役——重试走 EmptyState action 位，
       防重入由分支切换承担（按钮仅在非 loading 分支在场，与旧 :disabled 等效；emptyFrameZero547 约定） */
    expect(readFileSync(join(SRC, 'views/IndexSettingsView.vue'), 'utf-8')).toMatch(/action-text="重试" @action="loadSettings"/);
  });

  it('Diag 既有 spinning 范式保留（口径出处）', () => {
    const s = readFileSync(join(SRC, 'views/DiagView.vue'), 'utf-8');
    expect(s).toContain('{ spinning: retrying }');
  });
});
