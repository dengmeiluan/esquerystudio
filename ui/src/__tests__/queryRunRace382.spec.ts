/**
 * 三百八十二批：useQueryRun 连查竞态根治——begin() 此前直接覆盖旧 AbortController：
 * 旧请求在网络上继续跑且响应照常返回，慢于新请求返回时旧结果覆盖新结果
 * （改参快查/双击查询的经典竞态，DevTools/Lucene/沙盒/Rest/SqlConsole 五视图共用）。
 * 修：begin() 首行 abort 旧控制器——旧 fetch 以 AbortError reject，视图 catch 丢弃。
 * finish() 置 abortCtl=null 不受影响（null?.abort() 是 no-op）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const s = readFileSync(join(__dirname, '../composables/useQueryRun.ts'), 'utf-8');

describe('useQueryRun 竞态根治（382 批）', () => {
  it('begin() 先 abort 旧控制器再新建', () => {
    const beginBody = s.slice(s.indexOf('function begin()'), s.indexOf('function cancel()'));
    expect(beginBody).toMatch(/abortCtl\?\.abort\(\);/);
    const abortIdx = beginBody.indexOf('abortCtl?.abort();');
    const newIdx = beginBody.indexOf('abortCtl = new AbortController();');
    expect(abortIdx).toBeGreaterThan(-1);
    expect(abortIdx).toBeLessThan(newIdx);
  });

  it('消费面守卫：signal 透传的五视图仍在场（根治覆盖全消费方）', () => {
    for (const v of ['DevToolsView.vue', 'LuceneQueryView.vue', 'SearchSandboxView.vue', 'RestView.vue', 'SqlConsoleView.vue']) {
      const src = readFileSync(join(__dirname, '../views', v), 'utf-8');
      expect(src, v).toMatch(/qr\.begin\(\)/);
    }
  });
});
