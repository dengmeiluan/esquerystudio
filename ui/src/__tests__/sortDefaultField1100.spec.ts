import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import RootExtrasPane from '../components/builder/RootExtrasPane.vue';
import { parseTree, serializeTree, type QueryTree } from '../utils/queryAst';

/* 1100：加排序的默认字段遵循「可排序 + 时间优先」。
 * 旧实现取 fields[0]：text 字段不可排序（fielddata 报错），且常把字典序第一个 keyword
 * 当默认，与「按最新时间排」的心智相反。 */
describe('1100 排序默认字段', () => {
  const mount = (fields: string[], types: Record<string, string>) => {
    const t = parseTree({ query: { match_all: {} } });
    if (!t.ok) throw new Error('parse failed');
    const cur = ref<QueryTree>(t.tree);
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({
      render: () => h(RootExtrasPane, {
        tree: cur.value, fields, types, index: 'i',
        'onUpdate:tree': (v: QueryTree) => { cur.value = v; },
      }),
    }).mount(host);
    return { host, cur };
  };

  it('date 字段优先（即使字典序靠后的 keyword 更靠前）', async () => {
    const { host, cur } = mount(['bond_code', 'issuer_name', 'publish_date'], { bond_code: 'keyword', issuer_name: 'text', publish_date: 'date' });
    await nextTick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('排序'));
    chip!.click();
    await nextTick();
    (host.querySelector('.rx-sort-add') as HTMLElement).click();
    await nextTick();
    expect(cur.value.sort?.[0]?.field).toBe('publish_date');
    expect(serializeTree(cur.value).sort).toEqual([{ publish_date: 'desc' }]);
  });

  it('无 date 时不选 text（只落可排序类型）', async () => {
    const { host, cur } = mount(['a_text', 'z_code'], { a_text: 'text', z_code: 'keyword' });
    await nextTick();
    const chip = [...host.querySelectorAll<HTMLButtonElement>('.rx-chip')].find(c => c.textContent?.includes('排序'));
    chip!.click();
    await nextTick();
    (host.querySelector('.rx-sort-add') as HTMLElement).click();
    await nextTick();
    expect(cur.value.sort?.[0]?.field).toBe('z_code');
  });
});
