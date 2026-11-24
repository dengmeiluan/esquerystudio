/**
 * 一千三百三十六批：字段候选里的 object **容器**被选中后，DSL 落成永不命中的空字段。
 *
 * 真机（查询工作台 DSL 构建器，mock 索引含 `publisher: {properties:{org_name,org_code}}`）：
 *   字段下拉里有一项 `object publisher`；选中它之后：
 *     {"query":{"bool":{"must":[{"match":{"":""}}]}}}   ← 字段名被清空，永不命中，零报错
 *   字段输入框变成空串。
 *
 * 裁决分两层，别搞反：
 *   · **共享字段源保留容器**——`useIndexFields.walk` 的输出同时喂 lint 的 unknown-field
 *     判定、DSL 补全的键位上下文、dslAssist。把 `publisher` 从里面剔除，会让 lint 把
 *     合法路径判成 unknown（1336 第一版就是这么改的，一次打红 18 条既有契约，已回退）。
 *   · **选择器入口拦截**——容器本身不能当查询字段（要查它的子字段）。点在容器上时不写回，
 *     改成把输入切成「publisher.」前缀，让子字段立刻成为候选。
 *
 * 本 spec 挂真实 FieldSelect、点真实候选，断言：
 *  ① 点 object 容器不 emit update:modelValue / picked（不写坏 DSL）；
 *  ② 输入框切成「容器.」前缀，候选立刻收敛到该容器的子字段；
 *  ③ 点叶子字段行为不变（照常 emit 两条）。
 * 负控：删掉 pick 里的容器分支 → 第 1、2 条必红。
 */
import { describe, it, expect, afterEach } from 'vitest';
import { createApp, h, ref, nextTick, type App } from 'vue';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import FieldSelect from '../components/builder/FieldSelect.vue';

const FIELDS = ['publisher', 'publisher.org_name', 'publisher.org_code', 'title', 'title.keyword'];
const TYPES: Record<string, string> = {
  publisher: 'object',
  'publisher.org_name': 'keyword',
  'publisher.org_code': 'keyword',
  title: 'text',
  'title.keyword': 'keyword',
};

const apps: App[] = [];
afterEach(() => { while (apps.length) { const a = apps.pop()!; try { a.unmount(); } catch { /* ignore */ } } document.body.innerHTML = ''; });

async function settle(n = 6) { for (let i = 0; i < n; i++) { await nextTick(); await Promise.resolve(); } }

async function openWith() {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const model = ref('');
  const picked: string[] = [];
  const app = createApp({
    render: () => h(FieldSelect as any, {
      modelValue: model.value,
      fields: FIELDS,
      types: TYPES,
      'onUpdate:modelValue': (v: string) => { model.value = v; writes.push(v); },
      onPicked: (v: string) => picked.push(v),
    }),
  });
  const writes: string[] = [];
  app.mount(host); apps.push(app);
  await settle();
  const inp = host.querySelector('input.fs-inp') as HTMLInputElement;
  inp.dispatchEvent(new FocusEvent('focus', { bubbles: false }));
  inp.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  await settle();
  return { host, inp, model, writes, picked };
}

function itemByName(nm: string): HTMLElement | undefined {
  return [...document.querySelectorAll<HTMLElement>('.fs-pop .fs-item')]
    .find(el => el.querySelector('.fs-nm')?.textContent?.trim() === nm);
}
function visibleNames(): string[] {
  return [...document.querySelectorAll<HTMLElement>('.fs-pop .fs-item')]
    .map(el => el.querySelector('.fs-nm')?.textContent?.trim() || '').filter(Boolean);
}

describe('1336 字段选择器不得把 object 容器写进查询', () => {
  it('点 object 容器：不写回字段，改为展开子字段', async () => {
    const { writes } = await openWith();
    const el = itemByName('publisher');
    expect(el, '候选里必须能看见 publisher（共享源保留，选择器负责拦截）').toBeTruthy();
    el!.click();
    await settle();
    expect(writes, '容器不得写回字段（真机曾因此落成 {"match":{"":""}}）').toEqual([]);
    /* 输入框保持用户原值不动（把「publisher.」写进去会污染字段值） */
    const now = document.querySelector('input.fs-inp') as HTMLInputElement;
    expect(now?.value, '输入框不得被改写').toBe('');
  });

  it('展开后候选立刻收敛到该容器的子字段', async () => {
    await openWith();
    itemByName('publisher')!.click();
    await settle();
    expect(visibleNames(), '应只剩 publisher 的子字段').toEqual(['publisher.org_code', 'publisher.org_name']);
  });

  it('点叶子字段行为不变（照常写回 + picked）', async () => {
    const { writes, picked } = await openWith();
    itemByName('title.keyword')!.click();
    await settle();
    expect(writes[writes.length - 1]).toBe('title.keyword');
    expect(picked[picked.length - 1]).toBe('title.keyword');
  });

  it('源码里确有容器分支（防空转：测试绿但源码没改）', () => {
    const src = readFileSync(join(__dirname, '../components/builder/FieldSelect.vue'), 'utf-8');
    const i2 = src.indexOf('function pick(');
    expect(i2, 'pick 必须存在').toBeGreaterThan(-1);
    const body = src.slice(i2, src.indexOf('}' + String.fromCharCode(10) + '}', i2));
    expect(body, '必须有容器判定').toContain("h.type === 'object'");
    expect(body, '容器分支必须在写回之前 return').toContain('expandPath.value = h.path');
  });
});
