/**
 * 三百二十批：Xmigrate 错误样本复制（全量，诚实口径）。
 * 五百二十九批 W-C：作业表换壳 QRT rows 型——展开详情降维 TableExpandRow（JsonTree），
 * 错误样本的「全量复制」入口上移行尾 #row-actions 注入位（aria-label 带全量诚实计数），
 * 通知文案与 copyErrSamples 函数原样保全；旧「还有 N 条」截断提示随详情降维退役
 * （JsonTree 展示全部样本，行尾钮复制全量——诚实口径不变）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const v = readFileSync(join(__dirname, '../views/XmigrateView.vue'), 'utf-8');

describe('Xmigrate 错误复制（320 批，529 入口随壳上移行尾）', () => {
  it('复制钮（有样本才出，aria-label 诚实计数）+函数+通知文案', () => {
    expect(v).toMatch(/v-if="rowJob\(row\)\?\.errorSamples\?\.length"/);
    expect(v).toMatch(/:aria-label="'复制全部 ' \+ rowJob\(row\)\?\.errorSamples\.length \+ ' 条错误样本'"/);
    expect(v).toMatch(/function copyErrSamples\(j: any\)/);
    expect(v).toMatch(/已复制 \$\{j\.errorSamples\.length\} 条错误样本/);
  });
});
