/**
 * 三百一十二批：DevTools 历史行三动作（点击填入/▶重跑/✕删除）+上限 50 落盘。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/DevToolsView.vue'), 'utf-8');

describe('DevTools 历史增强（312 批）', () => {
  it('重跑/删除按钮+delHist 落盘', () => {
    /* 第十批：历史行改用 QueryHistoryPanel 统一件（actions=play/fill/copy/del），手写钮退役。
       五百五十一批同步更新（击穿者：551 轨2 刀⑤——actions 窄集加 'fav' 一键转收藏）：
       白名单锚随字面迁为五动作形（锁意图=动作集齐备与 QHP 接线不丢，fav 消费
       store.addFavorite rest 形态既有体系，零新存储键；@play/@fill/@del 接线锚零触）。
       五百五十二批同步更新（击穿者：552 轨2 刀④——actions 窄集加 'curl' 一键复制 curl）：
       五动作形随字面迁为六动作形（面板行级仅 emit，命令组装归宿主 histCurl：
       copyCurl 既有 curl 手法逐字平移；@fav 接线锚零触）。
       五百六十一批同步更新（击穿者：561 B2 刀①——actions 窄集加 'newtab' 回放到新 Tab）：
       六动作形随字面迁为七动作形（面板行级仅 emit，mkTab+激活跳转归宿主 histNewTab；
       @play/@fill/@del 接线锚零触） */
    expect(v).toMatch(/:actions="\['play', 'fill', 'copy', 'fav', 'curl', 'newtab', 'del'\]"/);
    expect(v).toMatch(/@play="histPlay" @fill="loadHist" @del="histDel"/);
    expect(v).toMatch(/function histPlay\(h: any\) \{ loadHist\(h\); run\(\); \}/);
  });
});
