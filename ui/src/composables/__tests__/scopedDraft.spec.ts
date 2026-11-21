import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, defineComponent, h, nextTick } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHashHistory } from 'vue-router';
import {
  useScopedDraft,
  useScopedDraftState,
  draftStorageKey,
  type DraftScope,
} from '../useScopedDraft';

/* 草稿治理轮：useScopedDraft/useScopedDraftState 机制契约锁。
   视图只声明 scope + field，存储/隔离/掩埋/清稿全在本组合式——
   这里锁死八条契约，防后续视图回退到手写 storage 逻辑时机制侧失守。 */

const HOST_SCOPE: DraftScope = { route: 'rest' };

/** 快捷造 scope：默认 host，可覆写各维度 getter */
function scope(over: Partial<DraftScope> = {}): DraftScope {
  return { route: 'rest', ...over };
}

beforeEach(() => {
  sessionStorage.clear();
});

describe('draftStorageKey 维度隔离', () => {
  it('同 route+field，不同 target/index/mode → 不同 key', () => {
    const base = draftStorageKey(scope(), 'body');
    const byTarget = draftStorageKey(scope({ target: () => 'conn-a' }), 'body');
    const byIndex = draftStorageKey(scope({ index: () => 'logs-*' }), 'body');
    const byMode = draftStorageKey(scope({ mode: () => 'edit' }), 'body');
    expect(new Set([base, byTarget, byIndex, byMode]).size).toBe(4);
    /* 键形态契约：前缀:route:target:index:mode:field，缺省归一 host/-/- */
    expect(base).toBe('esquerystudio.draft2:rest:host:-:-:body');
    expect(byTarget).toBe('esquerystudio.draft2:rest:conn-a:-:-:body');
    expect(byIndex).toBe('esquerystudio.draft2:rest:host:logs-*:-:body');
    expect(byMode).toBe('esquerystudio.draft2:rest:host:-:edit:body');
  });

  it('getter 空串/空白按缺省归一（host / -）', () => {
    expect(draftStorageKey(scope({ target: () => '  ', index: () => '' }), 'f'))
      .toBe('esquerystudio.draft2:rest:host:-:-:f');
  });
});

describe('useScopedDraft 文本草稿', () => {
  it('挂载时恢复：预置 key → text=存储值且 restored=true；无预置 → 默认值且 restored=false', () => {
    const key = draftStorageKey(scope(), 'body');
    sessionStorage.setItem(key, '{"query":{"match_all":{}}}');
    const a = useScopedDraft('body', scope(), '');
    expect(a.text.value).toBe('{"query":{"match_all":{}}}');
    expect(a.restored.value).toBe(true);

    /* a 在场不清稿；b 必须验证「无预置」分支 → 先移除预置键 */
    sessionStorage.removeItem(key);
    const b = useScopedDraft('body', scope(), '');
    expect(b.text.value).toBe('');
    expect(b.restored.value).toBe(false);
  });

  it('目标 A 的草稿对目标 B 不可见（同 route/field 互不串稿）', () => {
    const keyA = draftStorageKey(scope({ target: () => 'conn-a' }), 'body');
    sessionStorage.setItem(keyA, 'A 的稿');
    const inB = useScopedDraft('body', scope({ target: () => 'conn-b' }), '');
    expect(inB.text.value).toBe('');
    expect(inB.restored.value).toBe(false);
    expect(inB.clear).toBeTypeOf('function');
  });

  it('clear()：清空 text + 移除存储键 + restored 归 false', () => {
    const key = draftStorageKey(scope(), 'body');
    sessionStorage.setItem(key, '旧稿');
    const d = useScopedDraft('body', scope(), '');
    d.clear();
    expect(d.text.value).toBe('');
    expect(d.restored.value).toBe(false);
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('挂载后只写不读：异步改 sessionStorage 不会覆盖用户现场', () => {
    const d = useScopedDraft('body', scope(), '');
    d.text.value = '用户刚粘贴的内容';
    /* 模拟挂载后其它代码（watcher 回填/热重载残留）直接写 storage */
    sessionStorage.setItem(draftStorageKey(scope(), 'body'), '异步回填的旧值');
    expect(d.text.value).toBe('用户刚粘贴的内容');
  });

  it('掩埋凭据样键值：password / api-key 的值不落盘', async () => {
    const d = useScopedDraft('body', scope(), '');
    d.text.value = '{"host":"es1","password":"abc123","X-Api-Key": "k"}';
    await nextTick();
    const stored = sessionStorage.getItem(draftStorageKey(scope(), 'body')) || '';
    expect(stored).toContain('***');
    expect(stored).not.toContain('abc123');
    expect(stored).not.toMatch(/"k"/);
  });

  it('改回默认值即清稿（不留陈稿）', async () => {
    const key = draftStorageKey(scope(), 'body');
    const d = useScopedDraft('body', scope(), '');
    d.text.value = '写了点东西';
    await nextTick();
    expect(sessionStorage.getItem(key)).not.toBeNull();
    d.text.value = '';
    await nextTick();
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});

describe('useScopedDraftState 对象草稿', () => {
  it('深修改持久化；回到与默认等价的对象即清稿', async () => {
    const key = draftStorageKey(scope(), 'form');
    const d = useScopedDraftState('form', scope(), { indexName: '', strategy: 'AUTO' });
    d.state.value.indexName = 'bond_index';
    await nextTick();
    expect(JSON.parse(sessionStorage.getItem(key) || '{}')).toEqual({ indexName: 'bond_index', strategy: 'AUTO' });
    d.state.value.indexName = '';
    await nextTick();
    expect(sessionStorage.getItem(key)).toBeNull();
  });

  it('坏 JSON / 非 object 值回落默认，restored=false', () => {
    const key = draftStorageKey(scope(), 'form');
    sessionStorage.setItem(key, '{坏了');
    const a = useScopedDraftState('form', scope(), { x: 1 });
    expect(a.state.value).toEqual({ x: 1 });
    expect(a.restored.value).toBe(false);

    sessionStorage.setItem(key, '123');
    const b = useScopedDraftState('form', scope(), { x: 1 });
    expect(b.state.value).toEqual({ x: 1 });
    expect(b.restored.value).toBe(false);
  });

  it('恢复非默认对象 → state 取存储值且 restored=true；clear() 复位默认并清键', async () => {
    const key = draftStorageKey(scope(), 'form');
    sessionStorage.setItem(key, JSON.stringify({ indexName: 'a', strategy: 'AUTO' }));
    const d = useScopedDraftState('form', scope(), { indexName: '', strategy: 'AUTO' });
    expect(d.state.value.indexName).toBe('a');
    expect(d.restored.value).toBe(true);
    d.clear();
    await nextTick();
    expect(d.state.value).toEqual({ indexName: '', strategy: 'AUTO' });
    expect(sessionStorage.getItem(key)).toBeNull();
  });
});

describe('跨「重挂载」持久化（真实组件卸载→重挂）', () => {
  /* 挂载使用方组件：草稿 watcher 绑定组件作用域，卸载即停——
     这是「切路由回来现场还在」的真实成因链，纯函数照不到 */
  async function mountUser() {
    const captured: { text?: ReturnType<typeof useScopedDraft>['text'] } = {};
    const Comp = defineComponent({
      setup() {
        const draft = useScopedDraft('body', scope(), '');
        captured.text = draft.text;
        return () => h('div');
      },
    });
    const router = createRouter({
      history: createWebHashHistory(),
      routes: [{ path: '/:p(.*)*', component: Comp }],
    });
    const host = document.createElement('div');
    document.body.appendChild(host);
    const app = createApp(Comp);
    app.use(createPinia());
    app.use(router);
    await router.isReady();
    app.mount(host);
    return { app, host, text: captured.text! };
  }

  it('写入 → 卸载 → 重挂 → 草稿复原', async () => {
    const first = await mountUser();
    first.text!.value = 'NDJSON 手稿';
    await nextTick();
    first.app.unmount();
    first.host.remove();

    const second = await mountUser();
    expect(second.text!.value).toBe('NDJSON 手稿');
    second.app.unmount();
    second.host.remove();
  });
});
