/**
 * 2.1.6 写动作执行体防重批量收口。
 *
 * 标准（既有 195 批 formAuditSweep ⑤ 的延伸）：按钮 disabled 只护住钮面，
 * Enter / 深链 / 右键 / 程序化入口同汇入执行体，必须在函数体首部有第二道门。
 * 本批覆盖双击会真实产生第二份副作用或噪声的动作：建索引、ILM/模板/分析配置保存、
 * 文档提交、字段添加、同义词下发、连接保存、Setup 应用、SQL/PIT/取消任务等。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (p: string) => readFileSync(join(__dirname, '..', p), 'utf-8');

const CASES: [string, string, RegExp][] = [
  ['views/DslQueryView.vue', 'saveNewDoc', /if \(newDocSaving\.value\) return;/],
  ['views/IlmView.vue', 'savePolicy', /if \(policyBusy\.value\) return;/],
  ['views/IndexSettingsView.vue', 'save', /if \(saving\.value\) return;/],
  ['views/ConfigValidatorView.vue', 'doCreate', /if \(creating\.value\) return;/],
  ['views/DiffEditorView.vue', 'doPush', /if \(pushing\.value\) return;/],
  ['views/MappingDesignerView.vue', 'doAdd', /if \(busy\.value\) return;/],
  ['views/SearchTemplatesView.vue', 'save', /if \(busy\.value\) return;/],
  ['views/SearchTemplatesView.vue', 'del', /if \(busy\.value\) return;/],
  ['views/SynonymsManagerView.vue', 'doSave', /if \(busy\.value\) return;/],
  ['components/ClusterSwitcher.vue', 'saveConn', /if \(saving\.value\) return;/],
  ['components/SetupWizard.vue', 'doApply', /if \(applying\.value\) return;/],
  ['views/AnalysisSettingsView.vue', 'doSave', /if \(busy\.value\) return;/],
  ['views/TaskTreeView.vue', 'cancelOne', /if \(cancellingOne\.value\.has\(id\)\) return;/],
  ['views/TaskTreeView.vue', 'bulkCancel', /if \(busy\.value\) return;/],
  ['views/TasksView.vue', 'cancelOne', /if \(cancelling\.value\.has\(t\.taskId\)\) return;/],
  ['views/SqlConsoleView.vue', 'doRun', /if \(busy\.value\) return;/],
  ['views/PitScrollView.vue', 'doOpen', /if \(busy\.value\) return;/],
  ['views/PitScrollView.vue', 'doClose', /if \(busy\.value\) return;/],
];

describe('2.1.6 写动作执行体防重（源码锁）', () => {
  for (const [file, fn, guard] of CASES) {
    it(`${file} :: ${fn} 首部有三态在途门`, () => {
      const src = read(file);
      const at = src.indexOf('async function ' + fn + '(');
      expect(at, `${fn} 在场`).toBeGreaterThan(-1);
      const body = src.slice(at, at + 900);
      expect(body, `${fn} 缺在途门`).toMatch(guard);
      /* 门必须在第一次 await 之前：确认窗内的连点也要挡住 */
      const guardAt = body.search(guard);
      const firstAwait = body.indexOf('await');
      expect(guardAt, `${fn} 的门须先于任何 await`).toBeLessThan(firstAwait < 0 ? Number.MAX_SAFE_INTEGER : firstAwait);
    });
  }
});
