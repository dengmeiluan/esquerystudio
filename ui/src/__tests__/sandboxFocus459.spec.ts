/**
 * 四百五十九批：Sandbox 结果区聚焦放大——hits/aggs/explain/profile/raw 五视图
 * 整卡（含 seg 切换、骨架、错误面板、空态）包 FocusableSurface，大 profile/raw
 * JSON 全屏浏览。深链联动（335 送入沙盒）不受影响（仅加包裹层）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/SearchSandboxView.vue'), 'utf-8');

describe('Sandbox 结果区聚焦（459 批）', () => {
  it('FocusableSurface 接线：pane-id/状态/import/开闭平衡', () => {
    expect(v).toMatch(/<FocusableSurface pane-id="sandbox\.result" title="结果区" :enabled="focusPaneId === 'sandbox\.result'"/);
    expect(v).toContain("import FocusableSurface from '../components/FocusableSurface.vue';");
    expect(v).toMatch(/const focusPaneId = ref<string \| null>\(null\);/);
    const open = (v.match(/<FocusableSurface\b/g) ?? []).length;
    const close = (v.match(/<\/FocusableSurface>/g) ?? []).length;
    expect(open).toBe(close);
  });

  it('五视图切换（seg）在聚焦面内保持可用', () => {
    const segIdx = v.indexOf('class="seg"');
    const fsOpen = v.indexOf('<FocusableSurface');
    const fsClose = v.indexOf('</FocusableSurface>');
    expect(segIdx).toBeGreaterThan(fsOpen);
    expect(segIdx).toBeLessThan(fsClose);
  });
});
