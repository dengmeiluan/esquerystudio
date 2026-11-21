/**
 * 别名原子切换「从」侧弹层化（源码锁）：原生 select（列 panelRows）→ usePopupList 弹层，
 * 与「到」侧 IndexPicker 对称的输入+候选形态。
 * 契约：
 * 1) 候选语义=已绑该别名的索引（panelRows 限定源）——IndexPicker 读全集群清单无候选限定能力，
 *    故用 usePopupList 骨架就地组面板（同 role=combobox/listbox 无障碍形态）；
 * 2) label 带索引名，WRITE 标记同旧 option 文案（（WRITE）后缀不丢）；
 * 3) 输入过滤+rank（精确>前缀>包含，大小写不敏感，IndexPicker 同口径）；
 * 4) 点选/Enter 回填 swFrom（doSwitch 确认链零改动），过滤词清空。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../views/AliasesView.vue'), 'utf-8');

describe('AliasesView 原子切换「从」侧弹层', () => {
  it('原生 select 退役，换 usePopupList 弹层（与「到」侧 IndexPicker 对称在场）', () => {
    expect(src).not.toMatch(/<select v-model="swFrom"/);
    expect(src).toMatch(/import \{ usePopupList \} from '\.\.\/composables\/usePopupList';/);
    expect(src).toMatch(/usePopupList<\{ index: string; isWrite: boolean \}>\(\{ items: \(\) => sfItems\.value, onChoose: chooseSf \}\)/);
    expect(src).toContain('<IndexPicker v-model="swTo" placeholder="my-index-v2" />');
  });

  it('候选限定已绑该别名的索引（panelRows 源）+ 输入过滤 rank', () => {
    expect(src).toMatch(/const list = panelRows\.value\.map\(r => \(\{ index: r\.index, isWrite: r\.isWriteIndex === true \}\)\);/);
    expect(src).toMatch(/const rank = \(n: string\) => n\.toLowerCase\(\) === k \? 0 : n\.toLowerCase\(\)\.startsWith\(k\) \? 1 : 2;/);
    expect(src).toMatch(/\.sort\(\(a, b\) => rank\(a\.index\) - rank\(b\.index\) \|\| a\.index\.localeCompare\(b\.index\)\)/);
  });

  it('label 带索引名 + WRITE 标记同旧 option 文案；回填 swFrom 并清过滤词', () => {
    expect(src).toContain('{{ o.index }}{{ o.isWrite ? \'（WRITE）\' : \'\' }}');
    expect(src).toContain('function chooseSf(o: { index: string; isWrite: boolean }) { swFrom.value = o.index;');
    expect(src).toMatch(/:value="sfKw \|\| swFrom"/);
    expect(src).toContain('placeholder="选择已绑索引"');
  });

  it('弹层 aria 形态与骨架接线（combobox/listbox，Teleport 双模式）', () => {
    expect(src).toMatch(/role="combobox"/);
    expect(src).toMatch(/:aria-controls="sfListId"/);
    expect(src).toMatch(/<div v-else class="alv-pop-list" ref="sfListEl" :id="sfListId" role="listbox">/);
    expect(src).toMatch(/<Teleport :to="teleportTo" :disabled="inplace">/);
  });
});
