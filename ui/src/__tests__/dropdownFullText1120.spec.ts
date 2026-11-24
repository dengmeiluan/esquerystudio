/**
 * 下拉可视内容保障（一一二〇批）：长标识（索引名/字段名/连接名）在下拉菜单里
 * 必须读得全。两层锁面：
 *  · theme.css 规则锁——菜单宽度按内容自适应（max-content + 出屏上限）、
 *    超上限选项换行（break-all）不截断；规则被误删/重构丢失即红。
 *  · 选择器锚点锁——全局 CSS 打在 naive-ui 内部 class 上，库升级改名时 CSS
 *    会静默失效；从已安装版本的组件源码文本验证锚点 class 仍由库产出。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createApp, h, nextTick } from 'vue';
import { NSelect } from 'naive-ui';

const SRC = join(__dirname, '..');
const ROOT = join(__dirname, '../..');
const theme = readFileSync(join(SRC, 'theme.css'), 'utf-8');

describe('下拉可视内容：菜单宽度自适应 + 超长选项换行（theme.css 规则锁）', () => {
  it('follower 与 popover body 两层内联钳制被解除（!important 赢内联）', () => {
    expect(theme).toMatch(/\.v-binder-follower:has\(\.n-base-select-menu\)\s*\{\s*width:\s*auto !important/);
    expect(theme).toMatch(/\.v-binder-follower:has\(\.n-base-select-menu\)\s*\.n-popover-shared\s*\{[^}]*max-width:\s*min\(92vw,\s*720px\) !important/);
  });

  it('NSelect 菜单宽度 max-content + 触发器保底（min-width:100%）且有出屏上限', () => {
    expect(theme).toMatch(/\.n-base-select-menu\s*\{[^}]*width:\s*max-content[^}]*min-width:\s*100%[^}]*max-width:\s*min\(92vw,\s*720px\)/);
  });

  it('NSelect 选项内容换行不截断（normal + break-all）', () => {
    expect(theme).toMatch(/\.n-base-select-menu \.n-base-select-option__content\s*\{[^}]*white-space:\s*normal[^}]*word-break:\s*break-all/);
  });

  it('NDropdown 菜单与标签同款保障', () => {
    expect(theme).toMatch(/\.n-dropdown-menu\s*\{[^}]*max-width:\s*min\(92vw,\s*560px\)/);
    expect(theme).toMatch(/\.n-dropdown-option-body__label\s*\{[^}]*white-space:\s*normal[^}]*word-break:\s*break-all/);
  });
});

describe('选择器锚点锁（naive-ui 升级改名时全局 CSS 静默失效，锚点必须仍由库产出）', () => {
  const pkg = readFileSync(join(ROOT, 'node_modules/naive-ui/package.json'), 'utf-8');
  const optionSrc = readFileSync(join(ROOT, 'node_modules/naive-ui/es/_internal/select-menu/src/SelectOption.mjs'), 'utf-8');
  const menuCssr = readFileSync(join(ROOT, 'node_modules/naive-ui/es/_internal/select-menu/src/styles/index.cssr.mjs'), 'utf-8');
  const popoverBody = readFileSync(join(ROOT, 'node_modules/naive-ui/es/popover/src/PopoverBody.mjs'), 'utf-8');
  const follower = readFileSync(join(ROOT, 'node_modules/vueuc/es/binder/src/Follower.js'), 'utf-8');
  const selectSrc = readFileSync(join(ROOT, 'node_modules/naive-ui/es/select/src/Select.mjs'), 'utf-8');

  it('当前安装版本产出 .n-base-select-option__content（换行规则的落点）', () => {
    expect(optionSrc).toContain('-base-select-option__content');
  });

  it('库默认 nowrap+ellipsis 截断仍在（覆盖它的理由成立，防规则失去必要性）', () => {
    expect(menuCssr).toMatch(/white-space:\s*nowrap[\s\S]*?text-overflow:\s*ellipsis/);
  });

  it('宽度钳制机理仍在：select 菜单传 width/minWidth target（解除层的存在理由）', () => {
    expect(selectSrc, 'NSelect 传 width:consistentMenuWidth→target').toMatch(/width:\s*this\.consistentMenuWidth \? 'target'/);
    expect(selectSrc, 'NSelect 恒传 minWidth:"target"').toContain('minWidth: "target"');
    expect(follower, 'follower 把 width:target 落成内联 px 宽').toMatch(/width === 'target'[\s\S]{0,80}style\.width = `\$\{targetRect\.width\}px`/);
    expect(popoverBody, 'popover body 把 minWidth 属性落成 maxWidth 样式（库的反直觉落点）').toMatch(/if \(minWidth\) \{\s*style\.push\(\{\s*maxWidth:\s*formatLength\(minWidth\)/);
  });

  it('记录当前 naive-ui 版本（锚点断言红时先核对是否升级所致）', () => {
    expect(pkg).toMatch(/"version":\s*"2\.43\.2"/);
  });
});

describe('NSelect 长选项挂载冒烟（happy-dom 下渲染长标识不炸）', () => {
  it('挂载并渲染长选项', async () => {
    const longLabel = 'bond_index_v2_20261119_153045_reindexed_from_v1_with_mapping_change';
    const app = createApp({ render: () => h(NSelect, { value: null, options: [{ label: longLabel, value: longLabel }] }) });
    const host = document.createElement('div');
    document.body.appendChild(host);
    app.mount(host);
    for (let i = 0; i < 8; i++) { await nextTick(); await Promise.resolve(); }
    expect(host.querySelector('.n-base-selection'), '触发器在场').toBeTruthy();
    expect(host.innerHTML.length).toBeGreaterThan(0);
    app.unmount();
    host.remove();
  });
});
