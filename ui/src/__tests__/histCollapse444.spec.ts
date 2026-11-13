/**
 * 四百四十四批：DevTools 历史面板折叠——20 条历史常驻占屏，辅助信息收起主工作区优先。
 * 标题行可点折叠（role=button+tabindex+Enter+aria-expanded，Chevron 方向随态），
 * 折叠态会话内保留（KeepAlive 切页回来不重置）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('历史面板折叠（444 批）', () => {
  it('标题行折叠交互：role+tabindex+Enter+aria-expanded+Chevron 方向', () => {
    expect(v).toMatch(/<div class="dt-hist-tt" role="button" tabindex="0" :aria-expanded="histOpen"/);
    /* 826 同步更新：Enter 通道后伴 Space 通道（spaceGuard826 双通道约定），属性紧邻容差 */
    expect(v).toMatch(/@click="histOpen = !histOpen" @keydown\.enter\.prevent="histOpen = !histOpen" @keydown\.space\.prevent="histOpen = !histOpen">/);
    expect(v).toMatch(/<ChevronDown :size="12" :style="\{ transform: histOpen \? '' : 'rotate\(-90deg\)' \}" \/>/);
    expect(v).toMatch(/<div v-show="histOpen" class="dt-hist-list">/);
  });

  it('折叠态状态变量在场', () => {
    /* 550 同步更新：会话内 ref(true) → usePref('dt.histOpen', true) 落盘（track2Wave550 批，
       默认仍 true=首次展开行为零变化；444 批「折叠态保留」语义升格为跨会话记忆） */
    expect(v).toMatch(/const histOpen = usePref\('dt\.histOpen', true\);/);
  });
});
