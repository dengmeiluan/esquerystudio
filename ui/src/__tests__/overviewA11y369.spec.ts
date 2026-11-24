/**
 * 三百六十九批：Overview 五处下钻卡键盘可达——拓扑条/存储 Top10/文档数 Top10/
 * 健康分布/最近作业此前纯 @click 绑定（div 无 role/tabindex），键盘用户不可达；
 * 393 行注释自称「焦点环走全局 :focus-visible」实为空头支票（元素不可聚焦永不触发）。
 * 修：role="button"+tabindex="0"+@keydown.enter+aria-label（356 批 LiveDashboard 告警条同口径）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/OverviewView.vue'), 'utf-8');

describe('Overview 下钻卡键盘可达（369 批）', () => {
  it('五处下钻卡齐备 role+tabindex+Enter+aria-label', () => {
    const cards = [
      /* 五百五十四批同步更新：ov-topo .card 壳退役（class 字面摘 card，role/tabindex/Enter 契约零触） */
      /<div class="ov-topo" role="button" tabindex="0" aria-label="进入完整分布式拓扑视图" @click="router\.push\('\/topology'\)" @keydown\.enter\.prevent="router\.push\('\/topology'\)"/,
      /* 1439g：四行改统一 onOvKey（Enter/Space 主操作 + 菜单键），role/tabindex 契约不变 */
      /<div v-for="idx in topBySize"[^>]*role="button" tabindex="0" :aria-label="'查看索引 ' \+ idx\.index" @click="goIndex\(idx\.index\)" @contextmenu\.prevent="openOvMenu\(\$event, 'idx', idx\)" @keydown="onOvKey\(\$event, 'idx', idx\)"/,
      /<div v-for="idx in topByDocs"[^>]*role="button" tabindex="0" :aria-label="'查看索引 ' \+ idx\.index" @click="goIndex\(idx\.index\)" @contextmenu\.prevent="openOvMenu\(\$event, 'idx', idx\)" @keydown="onOvKey\(\$event, 'idx', idx\)"/,
      /<div v-for="h in healthDist"[^>]*role="button" tabindex="0" :aria-label="'查看 ' \+ h\.name \+ ' 索引清单'" @click="goHealth\(h\.name\)" @contextmenu\.prevent="openOvMenu\(\$event, 'health', h\)" @keydown="onOvKey\(\$event, 'health', h\)"/,
      /<div v-for="\(j, i\) in recentJobs"[^>]*role="button" tabindex="0" aria-label="前往托管重建" @click="goJob\(j\)" @contextmenu\.prevent="openOvMenu\(\$event, 'job', j\)" @keydown="onOvKey\(\$event, 'job', j\)"/,
    ];
    for (const re of cards) expect(v).toMatch(re);
    expect(v).toMatch(/if \(e\.key === 'Enter' \|\| e\.key === ' '\)/);
  });

  it('可点击无 role 残留清零（v-for 下钻元素不再有裸 @click）', () => {
    expect(v).not.toMatch(/<(div|span)[^>]*class="ov-(bar-row|h-item|job)[^"]*"(?![^>]*role=)[^>]*@click/);
  });
});
