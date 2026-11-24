/**
 * 三百零七批：IlmView 空态 EmptyState 合并+三视图骨架 margin 归容器 gap（G2-C7 口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, p), 'utf-8');
const ilm = read('../views/IlmView.vue');
const tt = read('../views/TaskTreeView.vue');
const snap = read('../views/SnapshotsView.vue');

describe('Ilm 空态+骨架清尾（307 批）', () => {
  it('Ilm 两处空态 EmptyState 化，裸 .empty 清零', () => {
    expect(ilm).toMatch(/<EmptyState v-else-if="policies\.length" :icon="ShieldQuestion"/);
    expect(ilm).toMatch(/<EmptyState v-else-if="!loadErr" :icon="ShieldQuestion"/);
    expect(ilm).not.toMatch(/class="empty"/);
    expect(ilm).toContain("import EmptyState from '../components/EmptyState.vue';");
  });
  it('骨架内联 margin 清零，容器 gap 承载', () => {
    for (const s of [ilm, tt, snap]) {
      expect(s).not.toMatch(/SkeletonBox[^>]*margin-bottom/);
    }
    /* 五百二十七批：snap/ilm 骨架容器 gap 字面量合并 --sp token（间距语义不变，锚同步更新）；
       五百四十六批：tt 骨架 gap:10px 同口径收 var(--sp-2h)（档表等值，锚同步更新双形态防回潮） */
    expect(tt).toMatch(/loading && !nodes\.length" class="tt-empty" style="display:flex;flex-direction:column;gap:(?:10px|var\(--sp-2h\))"/);
    /* 五百二十七批：snap/ilm 骨架容器 gap 字面量合并 --sp token（间距语义不变，锚同步更新） */
    expect(snap).toMatch(/gap:(?:8px|var\(--sp-2\))"/);
    expect(ilm).toMatch(/gap:(?:8px|var\(--sp-2\))"/);
  });
});
