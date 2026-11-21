/* 范式同 emptyState.spec.ts：createApp 手工 mount，无 @vue/test-utils。 */
import { describe, it, expect, beforeEach } from 'vitest';
import { createApp, h, ref, computed } from 'vue';
import { RUNTIME_FIELD_CTX } from '../builder/runtimeFieldContext';
import FieldSelect from '../builder/FieldSelect.vue';

function mount(fields: string[], types: Record<string, string> = {}, model = '', rt?: { names: string[]; edits: string[] }) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const val = ref(model);
  const app = createApp({
    render: () => h(FieldSelect, {
      modelValue: val.value, fields, types,
      'onUpdate:modelValue': (v: string) => { val.value = v; },
    }),
  });
  if (rt) {
    app.provide(RUNTIME_FIELD_CTX, {
      noScript: computed(() => new Set(rt.names)),
      edit: (n: string) => rt.edits.push(n),
    });
  }
  app.mount(host);
  return { host, val };
}

beforeEach(() => { localStorage.clear(); document.body.innerHTML = ''; });

describe('FieldSelect', () => {
  /* 弹层已 teleport 到 body（防 .dq-tree overflow 裁剪）——候选项断言一律查 document.body */
  it('渲染字段列表并带类型徽标', async () => {
    const { host } = mount(['title', 'count'], { title: 'text', count: 'long' });
    host.querySelector('input')!.focus();
    /* 弹层换代后 v-if 渲染（原 v-show 常驻）：开层要等一帧宏任务再断言 */
    await new Promise(r => setTimeout(r));
    const text = document.body.textContent || '';
    expect(text).toContain('title');
    expect(text).toContain('text');
    expect(text).toContain('long');
  });
  it('输入关键字过滤', async () => {
    const { host } = mount(['title', 'count']);
    const inp = host.querySelector('input')!;
    inp.focus();
    inp.value = 'cou';
    inp.dispatchEvent(new Event('input'));
    await new Promise(r => setTimeout(r));
    expect(document.body.textContent).toContain('count');
    expect(document.body.textContent).not.toContain('title');
  });
  it('1069 续：运行时字段缺 script 时出徽标，点击交给宿主编辑；已知 mapping 字段/无上下文不出', async () => {
    const rt = { names: ['title_len'], edits: [] as string[] };
    const { host } = mount(['title', 'title_len'], { title: 'text', title_len: 'long' }, 'title_len', rt);
    const chip = host.querySelector('.fs-nos') as HTMLButtonElement;
    expect(chip, '缺 script 运行时字段应出徽标').not.toBeNull();
    expect(chip.textContent).toContain('无 script');
    expect(chip.getAttribute('title')).toContain('不会产出值');
    chip.click();
    expect(rt.edits).toEqual(['title_len']);

    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    const known = mount(['title', 'title_len'], { title: 'text', title_len: 'long' }, 'title', rt);
    expect(known.host.querySelector('.fs-nos')).toBeNull();

    while (document.body.firstChild) document.body.removeChild(document.body.firstChild);
    const noCtx = mount(['title_len'], { title_len: 'long' }, 'title_len');
    expect(noCtx.host.querySelector('.fs-nos'), '其它页无上下文零提示').toBeNull();
  });

  it('选中字段 emit update:modelValue 并记最近使用', async () => {
    const { host, val } = mount(['title', 'count']);
    const inp = host.querySelector('input')!;
    inp.focus();
    await new Promise(r => setTimeout(r));
    /* 换代后候选按 rank+字母序（count 在前），点选「title」那项而非首项 */
    const target = Array.from(document.body.querySelectorAll<HTMLElement>('.fs-item'))
      .find(el => el.textContent?.includes('title'));
    target!.click();
    expect(val.value).toBe('title');
    expect(JSON.parse(localStorage.getItem('esquerystudio_qb_field_recent') || '[]')).toContain('title');
  });
});
