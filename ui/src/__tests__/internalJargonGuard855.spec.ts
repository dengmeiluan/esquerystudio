/* 产品域注释卫生看守（855 批·843 记账语汇清洗的续深轮）。
 *
 * 病灶家族：产品代码注释里的内部批史叙述残留——设计文档节锚（§8.1）、
 * 批号引用（549 立法 / 633-C1 判例 / 562 随迁）、轨号前缀（轨4 P1-1）、
 * 记账动词（收编 / 立法 / 判例 / 治理轮 / 退场 / 本批 / 本轮 / 上批）、
 * spec 锚词（spSweep545 / dqHistHead549）。这些注释写给内部审计看，
 * 对外部贡献者是噪声：读到的应该是约束本身，不是约束的立法史。
 * 843 批清洗了页面可见文案与批号硬黑话；855 批把注释域文体一并归正。
 *
 * ── 断言口径 ─────────────────────────────────────────────────
 * G 组：产品域（src/ 非 __tests__ 的 .ts/.vue 全文，含注释与字符串）
 *       六类禁形态恒零；豁免=spec 域文件名与头注批号叙述（843 记账锚立法）。
 * ⚠本文件的禁词表正则字面=禁词的「定义处」，任何全域词表替换脚本
 *   不得触碰本文件（855 实演：v3 词表 replace 把禁词表洗成空 alternation
 *   正则恒匹配一切=守卫假红全量行；843-C1 语境判定纪律的守卫域特例）。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const srcDir = join(__dirname, '..');

/* 禁形态：锚类（§ / 批号+记账名词 / 轨号 / spec 锚词）+ 铁黑话词表 */
const BANNED: Array<[string, RegExp]> = [
  ['设计文档节锚 §N', /§\d/],
  ['批号+立法/判例/随迁/记档', /\d{3}\s*(?:立法|判例|随迁|记档)/],
  ['批号-C 判例形态', /\d{3}-C\d+/],
  ['轨号/轮号前缀', /(?:轨|轮)\d+\s+[A-Z]?\d*P?\d*-?\d*[：:]/],
  ['spec 锚词', /(?:spSweep|dqHistHead|valHintTable|histNewTab|dqWave|kibanaWave|track2Wave|tableKernelWave|btSandbox)\d+/],
  ['记账黑话词', /(?:治理轮|本批|本轮|上批|前批|批史|审计项|收编|立法|判例|退场|翻案|随迁|记档|闭矿|落袋|执法|换装|暂缓|胞胎|解冻)/],
];

describe('internalJargonGuard855 · 产品域注释卫生', () => {
  it('G1 产品域六类禁形态恒零', () => {
    const files: string[] = [];
    const walk = (d: string) => {
      for (const f of readdirSync(d)) {
        const p = join(d, f);
        const st = statSync(p);
        if (st.isDirectory()) { if (f !== '__tests__') walk(p); }
        else if (/\.(ts|vue)$/.test(f)) files.push(p);
      }
    };
    walk(srcDir);
    expect(files.length, '产品域文件扫描数>0').toBeGreaterThan(0);
    const dirty: string[] = [];
    for (const p of files) {
      const text = readFileSync(p, 'utf8');
      const rel = p.replace(/\\/g, '/').split('/src/').pop() as string;
      text.split('\n').forEach((ln, i) => {
        for (const [label, re] of BANNED) {
          if (re.test(ln)) dirty.push(`${rel}:${i + 1} [${label}] ${ln.trim().slice(0, 80)}`);
        }
      });
    }
    expect(dirty, `产品域批史残留 ${dirty.length} 处：\n${dirty.slice(0, 40).join('\n')}`).toEqual([]);
  });
});
