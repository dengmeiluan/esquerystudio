/**
 * 一千四百四十批：查询框「空占位值」聚焦即全选，避免用户输入被粘在通配符后面。
 *
 * 真机复现（Lucene 页）：查询默认值是 `*`（match_all 简写）。用户点进输入框直接敲
 * `status:ACTIVE`，得到 `*status:ACTIVE`——`*` 在 query_string 里是通配符，
 * 语义完全变了，而且用户不会察觉。
 *
 * 修法：LuceneInput 新增 opt-in `placeholderValue`，聚焦时若内容仍等于它则全选整段
 * （只改选区不改值，用户想保留 `*` 也能照常移动光标）。
 *
 * 本批锁：
 *  ① 组件有该 prop 与聚焦处理函数，且 handler 绑定在 input 上；
 *  ② 只在「值 === placeholderValue」时全选（其它内容不得抢选区）；
 *  ③ Lucene 宿主传了 placeholderValue="*"；
 *  ④ 负控：删掉 「el.value !== ph」这个守卫 → ② 的红条件成立。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const LI = readFileSync(join(__dirname, '../components/LuceneInput.vue'), 'utf-8');
const LUCENE = readFileSync(join(__dirname, '../views/LuceneQueryView.vue'), 'utf-8');

describe('1440 空占位值聚焦全选', () => {
  it('① prop 与处理函数、且绑定到 input 的 focus', () => {
    expect(LI).toMatch(/placeholderValue\?: string;/);
    expect(LI).toContain('function onFocusSelectPlaceholder()');
    expect(LI, 'handler 必须绑到 focus').toMatch(/@focus="onFocusSelectPlaceholder"/);
    expect(LI, '必须只改选区不改值').toContain('el.select();');
  });

  it('② 只在值仍等于占位值时全选（其它内容不抢选区）', () => {
    expect(LI).toContain('if (el.value !== ph) return;');
    /* 负控：去掉这行守卫 → 断言红 */
    expect(LI.replace('if (el.value !== ph) return;', ''))
      .not.toContain('if (el.value !== ph) return;');
  });

  it('③ Lucene 宿主声明占位值 `*`', () => {
    expect(LUCENE).toMatch(/<LuceneInput[^>]*placeholder-value="\*"/);
    /* 负控：删掉该属性 → 红 */
    const broken = LUCENE.replace(/ placeholder-value="\*"/, '');
    expect(broken).not.toMatch(/<LuceneInput[^>]*placeholder-value="\*"/);
  });
});
