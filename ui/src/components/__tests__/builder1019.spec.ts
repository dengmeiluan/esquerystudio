/* 1019 批组件契约：terms lookup 远程词项一等编辑位（ClauseNode 挂接）——
   ① lookup 形态（值对象键 ⊆ {index,id,path} 且值全字符串）→ 三具名输入 + 语义提示句
   ② 编辑写回（空串删键半成品）；整树序列化往返
   ③ 普通数组 terms 维持 chips；未知键/非字符串值/空值对象判定边界 → 退化路径核对 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, type App } from 'vue';
import ClauseNode from '../builder/ClauseNode.vue';
import { serQueryNode, type LeafNode } from '../../utils/queryAst';

const mk = (value: unknown): LeafNode => ({
  id: 't1', type: 'leaf', op: 'terms', field: 'user', value, params: {}, raw: null,
});

const apps: App[] = [];
function mount(node: LeafNode) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const cur = ref(node);
  const app = createApp({
    render: () => h(ClauseNode, {
      node: cur.value, fields: ['user'], types: { user: 'keyword' },
      'onUpdate:node': (n: LeafNode) => { cur.value = n; },
    }),
  });
  apps.push(app);
  app.mount(host);
  return { host, cur };
}
const tick = () => new Promise(r => setTimeout(r));

beforeEach(() => { document.body.innerHTML = ''; });

describe('1019 terms lookup 编辑位', () => {
  it('lookup 形态渲染三具名输入（值就位）', () => {
    const { host } = mount(mk({ index: 'users', id: '2', path: 'followers' }));
    const ins = [...host.querySelectorAll<HTMLInputElement>('.cn-tl-in')];
    expect(ins.length).toBe(3);
    expect(ins.map(i => i.value)).toEqual(['users', '2', 'followers']);
  });

  it('编辑写回：改 id、空串删键（半成品）；整树序列化往返', async () => {
    const { host, cur } = mount(mk({ index: 'users', id: '2', path: 'followers' }));
    const idIn = host.querySelectorAll<HTMLInputElement>('.cn-tl-in')[1];
    idIn.value = '42';
    idIn.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cur.value.value).toEqual({ index: 'users', id: '42', path: 'followers' });
    expect(serQueryNode(cur.value)).toEqual({
      terms: { user: { index: 'users', id: '42', path: 'followers' } },
    });
    idIn.value = '';
    idIn.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cur.value.value).toEqual({ index: 'users', path: 'followers' });
  });

  it('空对象 {} 也可直接输入（无需先加键）', async () => {
    const { host, cur } = mount(mk({}));
    const first = host.querySelector<HTMLInputElement>('.cn-tl-in')!;
    first.value = 'users';
    first.dispatchEvent(new Event('input', { bubbles: true }));
    await tick();
    expect(cur.value.value).toEqual({ index: 'users' });
  });
});

describe('1019 terms 形态分派边界', () => {
  it('数组 terms 维持 chips（不进 lookup 位）；未知键/非字符串值退化键值表', () => {
    const { host: h1 } = mount(mk(['a', 'b']));
    expect(h1.querySelector('.cn-tl'), '数组不进 lookup').toBeNull();
    expect(h1.querySelectorAll('.cn-chip').length).toBe(2);
    const { host: h2 } = mount(mk({ index: 'i', bogus: 1 }));
    expect(h2.querySelector('.cn-tl'), '未知键退化').toBeNull();
    expect(h2.querySelector('.gp'), '通用键值表兜底').not.toBeNull();
    const { host: h3 } = mount(mk({ index: 42 }));
    expect(h3.querySelector('.cn-tl'), '非字符串值退化').toBeNull();
  });
});
