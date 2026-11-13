import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(__dirname, '..');

describe('browser mode hides host-only desired-state entry', () => {
  it('AdhocRebuildView disables the host static page in browser mode', () => {
    const src = readFileSync(join(root, 'views/AdhocRebuildView.vue'), 'utf8');
    expect(src).toContain('const canDesiredState = computed(() => !isBrowserMode');
    expect(src).toContain("浏览器模式没有宿主期望配置静态页");
    expect(src).toContain('if (isBrowserMode) return;');
  });
});
