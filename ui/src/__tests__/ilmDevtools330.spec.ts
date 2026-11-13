/**
 * 三百三十批：Ilm explain「在 DevTools 打开」（GET /<idx>/_ilm/explain 带参预填+run:true，Watcher 范式）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/IlmView.vue'), 'utf-8');

describe('Ilm explain 带参跳转（330 批）', () => {
  it('按钮+函数+会话契约', () => {
    expect(v).toContain('<TerminalSquare :size="11" /> Dev Tools');
    expect(v).toMatch(/function explainToDevtools\(\)/);
    expect(v).toMatch(/path: '\/' \+ encodeURIComponent\(explainIndex\.value\) \+ '\/_ilm\/explain', run: true/);
    expect(v).toContain("writeStoredRaw(sessionStorage, 'esquerystudio.devtools.open'");
  });
});
