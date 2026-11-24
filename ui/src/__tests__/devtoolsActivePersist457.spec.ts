/**
 * 四百五十七批：DevTools active 标签持久化——刷新后回到用户所在标签
 * （此前 tabs 恢复但 active 恒归 0）。独立键 esquerystudio.devtools.active.v1:<target>
 * （不动 tabs 数组结构保持旧数据兼容），恢复钳位防越界，预填跳转（consumePrefill）
 * 优先于还原。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('active 标签持久化（457 批）', () => {
  it('合并草稿落盘(300ms 防抖+pagehide 冲刷)+watch 同步(v3.0.1 可重入性)', () => {
    expect(v).toMatch(/const DRAFT_KEY = computed\(\(\) => `es_devtools_draft:\$\{store\.target \|\| 'host'\}`\);/);
    expect(v).toMatch(/watch\(tabs, persist, \{ deep: true \}\);/);
    expect(v).toMatch(/watch\(active, persist\);/);
    expect(v).toMatch(/window\.addEventListener\('pagehide', flushDraft\);/);
  });

  it('恢复链顺序：tabs 恢复 → active 钳位还原 → consumePrefill', () => {
    expect(v).toMatch(/if \(Number\.isInteger\(raw\.active\) && raw\.active >= 0 && raw\.active < tabs\.value\.length\) active\.value = raw\.active;/);
    expect(v).toMatch(/consumePrefill\(\);/);
  });
});
