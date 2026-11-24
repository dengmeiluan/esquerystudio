/**
 * 五百六十五批·W4【轨4 扁平化扫荡】件③：SearchSandbox hits 面 _id/_index 裸 mark
 * 改用 MarkText 统一件。
 *
 * 背景：558b 批 hits 结果面查找在视图内手写 splitMark v-for + 裸 <mark> 渲染
 * （_index/_id 两处）。MarkText.vue 即同款 splitMark 纯函数的组件封装
 * （props {text,kw}，mt-mark 全站统一命中底色，textContent 与原文一致、无 v-html
 * 注入面）——全站 20+ 视图已改用，本页是最后漏网。改用后视图模板零 splitMark
 * 消费，孤儿 import 同步更新；.ss-hit-head mark 私有样式与 mt-mark 逐字同值
 * （warn 底/tx-on-strong 色/2px 圆角/0 1px 内衬），视觉由组件单源承接，死规则退役
 * （视觉从「本页私有 mark 样式」变「mt-mark 全站统一命中底色」，属有意统一）。
 *
 * 同步更新备案：hintWave558b E 段「_id/_index splitMark 切分高亮」三行源码锁随改用
 * 改锚 MarkText 形态（原断言语义=查找高亮在场，不因单源收口而失效）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h } from 'vue';
import MarkText from '../components/MarkText.vue';

const SRC = join(__dirname, '..');
const ss = readFileSync(join(SRC, 'views/SearchSandboxView.vue'), 'utf-8');

describe('五百六十五批③：hits 面 _id/_index 改用 MarkText（splitMark 手写渲染退役）', () => {
  it('源码锁：视图不再手写 splitMark 模板渲染（裸 <mark> 段退役、孤儿 import 同步更新）', () => {
    expect(ss, '模板 splitMark 消费退役').not.toContain('splitMark(String(h.');
    expect(ss, '裸 <mark v-if> 渲染段退役').not.toContain('<mark v-if=');
    expect(ss, 'splitMark import 孤儿同步更新').not.toContain("import { splitMark } from '../composables/useGridSearch';");
  });

  it('MarkText 已挂载：_index/_id 两处 <MarkText :text :kw>（hitsMarkKw 口径不变）', () => {
    expect(ss).toContain(`<MarkText :text="String(h._index ?? '')" :kw="hitsMarkKw" />`);
    expect(ss).toContain(`<MarkText :text="String(h._id ?? '')" :kw="hitsMarkKw" />`);
  });

  it('挂载：给定 text/kw 出 mt-mark 结构，textContent 与原文一致（无注入面契约）', () => {
    const host = document.createElement('div');
    const app = createApp({ render: () => h(MarkText, { text: 'logs-2026.09.22', kw: '09' }) });
    app.mount(host);
    try {
      const marks = host.querySelectorAll('mark.mt-mark');
      expect(marks.length).toBe(1);
      expect(marks[0].textContent).toBe('09');
      expect(host.textContent).toBe('logs-2026.09.22');
    } finally { app.unmount(); }
  });

  it('挂载：kw 空串=单段平文零扰动（无 mark 元素）', () => {
    const host = document.createElement('div');
    const app = createApp({ render: () => h(MarkText, { text: 'plain-text', kw: '' }) });
    app.mount(host);
    try {
      expect(host.querySelectorAll('mark').length).toBe(0);
      expect(host.textContent).toBe('plain-text');
    } finally { app.unmount(); }
  });
});
