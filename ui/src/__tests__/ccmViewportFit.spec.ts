/**
 * 二百二十二批：CellContextMenu 视口碰撞自适应接线守卫（用户实报修复）。
 * 锁定：pos 态驱动定位（不再直接吃 x/y props）、nextTick 实测调 fitPopupPos、
 * watch 两坐标 immediate、max-height 限高内滚 CSS。源码锁。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const src = readFileSync(join(__dirname, '../components/CellContextMenu.vue'), 'utf-8');

describe('CellContextMenu 视口碰撞自适应（二百二十二批）', () => {
  it('定位改 pos 态驱动 + nextTick 实测调 fitPopupPos', () => {
    expect(src).toContain("import { fitPopupPos } from '../utils/popFit';");
    expect(src).toContain(':style="{ left: pos.x + \'px\', top: pos.y + \'px\' }"');
    expect(src).toContain('pos.value = fitPopupPos(props.x, props.y, el.offsetWidth, el.offsetHeight, innerWidth, innerHeight);');
    /* 1142：immediate 版换成 onMounted 首帧落位（immediate 回调早于下方 sub 声明会 TDZ） */
    expect(src).toContain('onMounted(() => { void adjust(); });');
    expect(src).toMatch(/watch\(\(\) => \[props\.x, props\.y\], \(\) => \{ sub\.value = null; void adjust\(\); \}\)/);
  });
  it('先落点再调整（防复用旧位置闪帧）+ 菜单超长按视口限高内滚', () => {
    expect(src).toContain('pos.value = { x: props.x, y: props.y };');
    expect(src).toContain('max-height: calc(100vh - 16px); overflow-y: auto;');
  });
});
