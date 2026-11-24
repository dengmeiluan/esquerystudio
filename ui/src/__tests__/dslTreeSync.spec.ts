/* 同步引擎契约（设计文档 §4）：树→DSL 即写；DSL→树 250ms debounce 回解；
   防环（树写的不回推）；解析失败冻结不丢旧树；${var} 占位符往返不丢。 */
import { describe, it, expect } from 'vitest';
import { ref } from 'vue';
import { useTreeDslSync } from '../composables/useTreeDslSync';
import { serializeTree } from '../utils/queryAst';

const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

describe('useTreeDslSync', () => {
  it('树改动 → 序列化写回 dsl', () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree, onTreeUpdate, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    onTreeUpdate({ ...tree.value, size: 5 });
    expect(JSON.parse(dsl.value)).toEqual({ query: { match_all: {} }, size: 5 });
  });

  it('dsl 手改 → debounce 后回解进树', async () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree } = useTreeDslSync(dsl);
    dsl.value = '{"query":{"term":{"a":1}}}';
    await wait(300);
    expect(tree.value.root).toMatchObject({ type: 'leaf', op: 'term', field: 'a' });
  });

  it('树写的 dsl 不回推（防环）', async () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree, onTreeUpdate, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    const t2 = { ...tree.value, size: 7 };
    onTreeUpdate(t2);
    await wait(300);
    expect(tree.value).toBe(t2);   // shallowRef：未被回推覆盖
  });

  it('非法 dsl → stale=true 且树冻结；修正后自动恢复', async () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree, stale, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    const frozen = tree.value;
    dsl.value = '{"query": {';
    await wait(300);
    expect(stale.value).toBe(true);
    expect(tree.value).toBe(frozen);
    dsl.value = '{"query":{"term":{"x":2}}}';
    await wait(300);
    expect(stale.value).toBe(false);
    expect(tree.value.root).toMatchObject({ op: 'term', field: 'x' });
  });

  it('${var} 占位符在字符串值里往返不丢（回解不代变量）', () => {
    const dsl = ref('{"query":{"range":{"d":{"gte":"${from}"}}}}');
    const { tree, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    expect(serializeTree(tree.value)).toEqual({ query: { range: { d: { gte: '${from}' } } } });
  });

  it('注释剥离后正常回解', () => {
    const dsl = ref('{\n// 注释\n"query":{"match_all":{}}}');
    const { tree, stale, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    expect(stale.value).toBe(false);
    expect(tree.value.root).toMatchObject({ op: 'match_all' });
  });

  it('stale 期间编辑树 → 写出合法 dsl 并解除冻结', async () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree, stale, onTreeUpdate, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    dsl.value = '{"query": {';
    await wait(300);
    expect(stale.value).toBe(true);
    onTreeUpdate({ ...tree.value, size: 3 });
    expect(stale.value).toBe(false);
    expect(JSON.parse(dsl.value).size).toBe(3);
  });

  it('手改后排定的回解被树写取消（pending timer 清除）', async () => {
    const dsl = ref('{"query":{"match_all":{}}}');
    const { tree, onTreeUpdate, resyncNow } = useTreeDslSync(dsl);
    resyncNow();
    dsl.value = '{"query":{"term":{"a":1}}}';   // 手改排定 debounce
    await wait(50);
    const t2 = { ...tree.value, size: 9 };
    onTreeUpdate(t2);                            // 250ms 内树写
    await wait(300);
    expect(tree.value).toBe(t2);                 // 未被 pending 回解覆盖
  });
});
