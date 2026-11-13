import { describe, it, expect } from 'vitest';
import { createApp, h, nextTick, ref } from 'vue';
import GenericParams from '../components/builder/GenericParams.vue';
import { WRAP_PARAMS } from '../utils/queryAstOps';

/* 1094：inner_hits（nested / has_child / has_parent）结构化编辑。
 * 这三个包装查询在产线常需要返回命中的子文档；此前只能手写/整段 JSON 粘贴。
 * 现以 json schema 提供文本位：合法 JSON 写树且保留数字/布尔，非法中间态只标红不写。 */
describe('1094 inner_hits / json 参数', () => {
  it('nested/has_child/has_parent 注册 inner_hits=json', () => {
    for (const op of ['nested', 'has_child', 'has_parent']) {
      const p = (WRAP_PARAMS[op] || []).find(x => x.key === 'inner_hits');
      expect(p, op + ' 必须有 inner_hits').toBeTruthy();
      expect(p!.kind).toBe('json');
    }
  });

  const mount = (value: Record<string, unknown>) => {
    const cur = ref(value);
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({
      render: () => h(GenericParams, {
        value: cur.value,
        schema: [{ key: 'inner_hits', kind: 'json' }],
        onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; },
      }),
    }).mount(host);
    return { host, cur };
  };

  it('已有对象渲染为 JSON 文本位；合法编辑保留数字类型', async () => {
    const { host, cur } = mount({ inner_hits: { size: 3 } });
    await nextTick();
    const ta = host.querySelector<HTMLTextAreaElement>('textarea.gp-json')!;
    expect(ta, 'json schema 必须用文本位').toBeTruthy();
    expect(ta.value).toContain('"size": 3');
    ta.value = '{"size": 5, "name": "hits"}';
    ta.dispatchEvent(new Event('input'));
    await nextTick();
    expect(cur.value.inner_hits).toEqual({ size: 5, name: 'hits' });
    expect(ta.classList.contains('bad')).toBe(false);
  });

  it('非法 JSON 只标红，不覆盖已写入树的值', async () => {
    const { host, cur } = mount({ inner_hits: { size: 3 } });
    await nextTick();
    const ta = host.querySelector<HTMLTextAreaElement>('textarea.gp-json')!;
    ta.value = '{"size":';
    ta.dispatchEvent(new Event('input'));
    await nextTick();
    expect(cur.value.inner_hits).toEqual({ size: 3 });
    expect(ta.classList.contains('bad')).toBe(true);
  });

  it('新增 inner_hits 给空对象并由文本位承接', async () => {
    const { host, cur } = mount({});
    await nextTick();
    const inp = host.querySelector<HTMLInputElement>('.gp-add input')!;
    inp.value = 'inner_hits';
    inp.dispatchEvent(new Event('input'));
    (host.querySelector('.gp-add button') as HTMLButtonElement).click();
    await nextTick();
    expect(cur.value.inner_hits).toEqual({});
    expect(host.querySelector('textarea.gp-json')).toBeTruthy();
  });
});

/* 1169：terms_set.minimum_should_match_script 的结构化快捷行。
 * 产线里 terms_set 的脚本几乎必改 source（painless 表达式），此前只能整段手写 JSON。
 * source 是**字符串**，不能被数字输入框降级成 NaN/0。 */
describe('1169 terms_set 脚本快捷行', () => {
  const mount = (value: Record<string, unknown>) => {
    const cur = ref(value);
    const host = document.createElement('div');
    document.body.appendChild(host);
    createApp({
      render: () => h(GenericParams, {
        value: cur.value,
        schema: [{ key: 'minimum_should_match_script', kind: 'json' }],
        onUpdate: (v: Record<string, unknown> | unknown[]) => { cur.value = v as Record<string, unknown>; },
      }),
    }).mount(host);
    return { host, cur };
  };

  it('对象形态出快捷行，source 用文本输入（不是数字框）且带现值', async () => {
    const { host } = mount({ minimum_should_match_script: { source: 'Math.min(params.num_terms, 2)', params: {} } });
    await nextTick();
    const row = host.querySelector('.gp-jq')!;
    expect(row, '对象形态必须出快捷行').toBeTruthy();
    const src = row.querySelector<HTMLInputElement>('.gp-jq-src')!;
    expect(src, 'source 走专用文本位').toBeTruthy();
    expect(src.type).toBe('text');
    expect(src.value).toContain('Math.min');
    /* 该行内不得出现数字输入（source 是字符串参数） */
    expect(row.querySelectorAll('input[type=number]').length).toBe(0);
  });

  it('改 source 写回字符串；清空即删键（不留空串脏值）', async () => {
    const { host, cur } = mount({ minimum_should_match_script: { source: 'old', params: { n: 1 } } });
    await nextTick();
    const src = host.querySelector<HTMLInputElement>('.gp-jq-src')!;
    src.value = 'params.n > 1 ? 2 : 1';
    src.dispatchEvent(new Event('change'));
    await nextTick();
    expect((cur.value.minimum_should_match_script as any).source).toBe('params.n > 1 ? 2 : 1');
    expect((cur.value.minimum_should_match_script as any).params).toEqual({ n: 1 });

    src.value = '';
    src.dispatchEvent(new Event('change'));
    await nextTick();
    expect('source' in (cur.value.minimum_should_match_script as any)).toBe(false);
  });

  it('标量/数组形态不出快捷行（回落 JSON 单通道，避免误改）', async () => {
    const { host } = mount({ minimum_should_match_script: 'raw-string' });
    await nextTick();
    expect(host.querySelector('.gp-jq')).toBeNull();
  });
});
