/**
 * R130 第六十八批：RestView 收藏入口合并（收藏体系写侧闭环）。
 * 背景：favReplay 的通用 rest 分支（读侧）早已实现——写 RestView 草稿键并跳回 /rest；
       但 RestView 一直没有「收藏」动作（写侧），收藏夹空态「任何 REST 请求均可收藏」
       的声明对 /rest 不成立——与 64 批 IndexHub qry→实验室联动「读侧已有写侧缺」同构。
 * 锁定（RestView 内嵌 MonacoEditor，happy-dom 下挂载即炸——37 批先例：此类接线用源码
       静态守卫，行为由 store.addFavorite 的既有契约兜底）：
 * 1) RestView 写侧接线：addFavorite({ kind:'rest', payload:{ method, path, body } })，
 *    payload 形态与 DevToolsView saveFav 同构（回放分发依赖该形态）；
 * 2) 读侧闭环仍在：favReplay 通用 rest 分支写本页草稿键（draftStorageKey(restScope,...)）；
 * 3) 收藏夹读侧标签：replayTarget rest 无特殊 tag → 「REST 直连」（/rest，八十七批改名与页名一致）。
 * 自检：锚点文件存在 + 声明文案在场（防空跑假绿）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..');
const restSrc = readFileSync(join(SRC, 'views/RestView.vue'), 'utf-8');
const replaySrc = readFileSync(join(SRC, 'utils/favReplay.ts'), 'utf-8');
const favSrc = readFileSync(join(SRC, 'views/FavoritesView.vue'), 'utf-8');

describe('RestView 收藏写侧守卫（六十八批）', () => {
  it('RestView 接线 addFavorite，payload 形态与 DevToolsView 同构', () => {
    expect(restSrc.length, 'RestView.vue 应存在（自检防空跑）').toBeGreaterThan(1000);
    expect(restSrc).toMatch(/store\.addFavorite\(\{[\s\S]{0,200}kind:\s*'rest'/);
    expect(restSrc).toMatch(/payload:\s*\{\s*method:\s*method\.value,\s*path:\s*path\.value\.trim\(\),\s*body:\s*body\.value\s*\}/);
    expect(restSrc).toMatch(/@click="saveFav"/);
    expect(restSrc).toMatch(/:disabled="!path\.trim\(\)"/); // 空路径禁用，不产空收藏
  });

  it('读侧闭环仍在：favReplay 通用 rest 分支写 RestView 草稿并跳 /rest', () => {
    expect(replaySrc).toMatch(/draftStorageKey\(restScope,\s*'path'\)/);
    expect(replaySrc).toMatch(/draftStorageKey\(restScope,\s*'method'\)/);
    expect(replaySrc).toMatch(/router\.push\('\/rest'\)/);
  });

  it('收藏夹声明一致：空态文案提及 REST 请求（声明与写侧实现已对齐）', () => {
    expect(favSrc).toContain('REST 请求');
  });

  it('八十七批：指向页标签用注册名（REST 直连=/rest；Dev Tools=/devtools）', () => {
    expect(replaySrc).toContain("label: 'REST 直连'");
    expect(replaySrc).not.toContain("label: 'REST 控制台'");
    expect(favSrc).toMatch(/去 Dev Tools 多标签控制台/);
  });
});
