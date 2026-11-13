/**
 * 四百一十九批：刷新钮 busy 反馈与防重入统一——RefreshCw 图标在加载时旋转
 * （spinning）+按钮禁用。ConfigDrift 刷新钮缺旋转、AdhocRebuild 刷新任务列表钮
 * 连点无守卫无反馈（loadJobs 无 loading 态）。对齐 AliasesView 既有范式
 * （:class="{ spinning: loading }"）+ finally 复位。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const cd = readFileSync(join(__dirname, '../views/ConfigDriftView.vue'), 'utf-8');
const ad = readFileSync(join(__dirname, '../views/AdhocRebuildView.vue'), 'utf-8');

describe('刷新钮 busy 反馈统一（419 批）', () => {
  it('ConfigDrift 刷新钮：loadingKeys 时图标旋转', () => {
    expect(cd).toMatch(/<RefreshCw :size="12" :class="\{ spinning: loadingKeys \}" \/> 刷新/);
  });

  it('AdhocRebuild 刷新钮：jobsLoading 禁用+旋转+finally 复位（连点守卫）', () => {
    expect(ad).toMatch(/:disabled="jobsLoading" @click="loadJobs" title="刷新任务列表"><RefreshCw :size="12" :class="\{ spinning: jobsLoading \}" \/>/);
    expect(ad).toMatch(/const jobsLoading = ref\(false\);/);
    const body = ad.slice(ad.indexOf('const jobsLoading = ref(false);'), ad.indexOf('const jobsLoading = ref(false);') + 500);
    expect(body).toContain('if (jobsLoading.value) return;');
    expect(body).toContain("finally { jobsLoading.value = false; }");
  });

  it('范式锚：AliasesView 既有 spinning 用法保留（口径出处）', () => {
    const al = readFileSync(join(__dirname, '../views/AliasesView.vue'), 'utf-8');
    expect(al).toContain(':class="{ spinning: loading }"');
  });
});
