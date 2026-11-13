/**
 * 三百九十六批：useTreeDslSync 行为级单测——W1 条件树↔DSL 双向同步引擎。
 * 五契约：树写 dsl 防环（origin 标记清位跳过 watch）/手改 dsl 250ms 防抖回解/
 * 非法 JSON 冻结 stale=true 且 dsl 一字不动/合法 JSON 回解更新树解除冻结/
 * ${var} 占位符随树往返不降级（stripJsonComments 不 applyVars 契约）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { ref } from 'vue';
import { useTreeDslSync } from '../useTreeDslSync';

afterEach(() => { vi.useRealTimers(); });

describe('useTreeDslSync 双向同步（396 批）', () => {
  it('树写 dsl：序列化落参；防环（watch 见 origin 标记跳过）', async () => {
    vi.useFakeTimers();
    const dsl = ref('{"match_all":{}}');
    const s = useTreeDslSync(dsl);
    /* 叶子节点真实形态：type='leaf' + op/field/value/params/raw（queryAst 树契约） */
    s.onTreeUpdate({
      root: { id: 'n1', type: 'leaf', op: 'term', field: 'status', value: 'ACTIVE', params: {}, raw: null } as any,
      postFilter: null, collapse: null, knn: null, suggest: null, rescore: null, scriptFields: null, runtimeMappings: null, retriever: null,
      sort: null, source: null, aggs: null, highlight: null, searchParams: {}, extras: {},
    });
    expect(dsl.value).toContain('"term"');
    expect(dsl.value).toContain('ACTIVE');
    const after = dsl.value;
    await vi.advanceTimersByTimeAsync(300);
    expect(dsl.value, 'watch 被防环标记跳过，dsl 不被回解覆写').toBe(after);
    expect(s.stale.value).toBe(false);
  });

  it('手改 dsl：250ms 防抖后回解更新树', async () => {
    vi.useFakeTimers();
    const dsl = ref('{"match_all":{}}');
    const s = useTreeDslSync(dsl);
    dsl.value = '{"query":{"term":{"level":"warn"}},"size":50}';
    expect(s.tree.value.root, '防抖窗内树未动').toBeNull();
    await vi.advanceTimersByTimeAsync(300);
    expect(s.tree.value.root, '回解后树更新').not.toBeNull();
    expect(s.tree.value.size).toBe(50);
    expect(s.stale.value).toBe(false);
  });

  it('非法 JSON：stale 冻结且 dsl 一字不动；合法后解除', async () => {
    vi.useFakeTimers();
    const dsl = ref('{"query":{"term":{"a":1}}}');
    const s = useTreeDslSync(dsl);
    const broken = '{"query": 该处断了';
    dsl.value = broken;
    await vi.advanceTimersByTimeAsync(300);
    expect(s.stale.value).toBe(true);
    expect(dsl.value, '冻结不动用户原文（恢复现场靠它）').toBe(broken);
    dsl.value = '{"match_all":{}}';
    await vi.advanceTimersByTimeAsync(300);
    expect(s.stale.value, '合法输入解除冻结').toBe(false);
  });

  it('${var} 占位符随树往返（零降级）', async () => {
    vi.useFakeTimers();
    /* 初值必须与新值不同——同值赋值不触发 watch（Vue ref 同值短路） */
    const dsl = ref('{"match_all":{}}');
    const s = useTreeDslSync(dsl);
    dsl.value = '{"query":{"term":{"env":"${ENV_VAR}"}}}';
    await vi.advanceTimersByTimeAsync(300);
    expect(s.stale.value).toBe(false);
    expect(JSON.stringify(s.tree.value)).toContain('${ENV_VAR}');
  });
});
