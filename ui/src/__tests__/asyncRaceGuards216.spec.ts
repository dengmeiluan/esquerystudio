/**
 * 2.1.6 异步竞态批量收口：可连续改输入/连点的加载器必须有世代守卫。
 *
 * 原型（仓库内既有正确先例）：MappingView 以索引值比对、DiagView.loadHot 以节点
 * 身份比对、SnapshotsView 以 repo 比对。本批把「可重复触发但无守卫」的消费面补齐：
 * 旧包晚到不得覆盖新包的名单/预估/任务快照（否则界面显示的是旧输入的结果）。
 *
 * 守卫三支同口径：成功、失败、复位。过期支不得提前熄掉在途 spinner。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');
const ubq = read('views/UpdateByQueryView.vue');
const analyze = read('views/AnalyzeView.vue');
const taskTree = read('views/TaskTreeView.vue');
const tasks = read('views/TasksView.vue');
const security = read('views/SecurityView.vue');

describe('2.1.6 加载器世代守卫（源码锁）', () => {
  it('UpdateByQuery 预估：连点/改稿旧包作废', () => {
    expect(ubq).toMatch(/let estimateSeq = 0;/);
    expect(ubq).toMatch(/const seq = \+\+estimateSeq;[\s\S]{0,900}?if \(seq !== estimateSeq\) return;[\s\S]{0,600}?if \(seq === estimateSeq\) estimating\.value = false;/);
  });

  it('Analyze：切索引后旧索引的 analyzer 候选不得覆盖新索引', () => {
    expect(analyze).toMatch(/let analyzerSeq = 0;/);
    expect(analyze).toMatch(/if \(seq !== analyzerSeq \|\| idx !== index\.value\.trim\(\)\) return;/);
  });

  it('TaskTree/Tasks：自动刷新与手动刷新叠加时旧快照作废', () => {
    for (const src of [taskTree, tasks]) {
      expect(src).toMatch(/let loadSeq = 0;/);
      expect(src).toMatch(/if \(seq !== loadSeq\) return;/);
      expect(src).toMatch(/if \(seq === loadSeq\) loading\.value = false;/);
    }
  });

  it('Security 用户名单：写后刷新与手动刷新叠加时旧名单作废', () => {
    expect(security).toMatch(/let usersSeq = 0;/);
    expect(security).toMatch(/if \(seq !== usersSeq\) return;[\s\S]{0,200}?users\.value = list;/);
    expect(security).toMatch(/if \(seq === usersSeq\) usersLoading\.value = false;/);
  });

  it('顺序锁：读取与写入之间必须夹着 seq 判定（防止"读了就写"的守卫被绕过）', () => {
    expect(ubq).toMatch(/await api\.searchDsl\([\s\S]{0,220}?if \(seq !== estimateSeq\) return;[\s\S]{0,120}?estimateN\.value =/);
    expect(taskTree).toMatch(/await api\.clusterTasks\([\s\S]{0,160}?if \(seq !== loadSeq\) return;[\s\S]{0,80}?raw\.value = Array\.isArray/);
  });
});
