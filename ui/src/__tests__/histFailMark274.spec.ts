/**
 * 二百七十四批：查询历史失败标记——失败也记史（旧历史+跨模式 store 双路 ok:false），
 * 面板红点提示+重试入口语义；重试成功翻转红点。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const dq = read('../views/DslQueryView.vue');
const store = read('../stores/queryHistory.ts');
const panel = read('../components/QueryHistoryPanel.vue');

describe('查询历史失败标记（274 批）', () => {
  it('store push 支持失败标记并随最近一次执行刷新', () => {
    /* 1122：push 追加错误摘要参数（末尾可选，旧调用零破坏） */
    expect(store).toMatch(/function push\(mode: string, query: string, index\?: string, took\?: number, ok = true, params\?: string, opts\?: Record<string, unknown>, error\?: string\)/);
    expect(store).toMatch(/it\.ok = ok;/);
    expect(store).toMatch(/it\.error = err;/);
    expect(store).toMatch(/ok\?: boolean;/);
  });
  it('DslQueryView：失败双路标记+成功翻转红点+histRows 透传', () => {
    expect(dq).toMatch(/h0\.ok = false; writeStoredRaw\(localStorage, HIST_KEY/);
    expect(dq).toMatch(/h0\?\.ok === false\) \{ h0\.ok = true;/);
    /* 1439 迁移：记账版从「当前稿」改成「发送快照」——await 期间改稿时，记当前稿会让
       回放得到另一组结果；idx 仍是执行时快照（世代守卫同语义） */
    expect(dq).toMatch(/push\('dsl', dslSnapshot, idx, -1, false\)/);
    expect(dq).toMatch(/ts: h\.ts, ok: h\.ok \}/);
  });
  it('面板失败红点渲染', () => {
    expect(panel).toMatch(/v-if="it\.ok === false" class="qhp-fail"/);
    expect(panel).toContain('上次执行失败——回放可重试');
    expect(panel).toMatch(/\.qhp-fail \{/);
  });
});
