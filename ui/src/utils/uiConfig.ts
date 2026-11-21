/* 平台运行时 UI 配置：功能包（pack）选择、品牌与单页排除。
 *
 * 页面契约仍是分组/页面的唯一事实源；本模块只在其上做「部署选择」：
 * - packs 为空 = 全部启用（开源默认）；
 * - 显式列表 = 只暴露所选包；
 * - disabledPages 在包之上再隐藏单页。
 * 权限判定不在这里：页面级授权仍由 router.pageAllowed 与后端页面门负责。 */

import pagesContract from '@contract';

export interface PackDef {
  id: string;
  name: string;
  description: string;
  groups: string[];
}

export interface PageDef {
  key: string;
  name: string;
  group: string;
  route: string;
  icon: string;
  hotkey: string;
  minVer?: string | null;
}

export interface ProductInfo {
  name: string;
  tagline: string;
  integrationId: string;
  integrationName: string;
  docsUrl: string;
  metadata: Record<string, string>;
}

export interface PackState extends PackDef {
  enabled: boolean;
  pageCount: number;
}

export interface UiConfig {
  product: ProductInfo;
  packs: PackState[];
  disabledPages: string[];
}

const contract = pagesContract as unknown as {
  groups: { id: string; name: string; sort: number }[];
  packs?: { id: string; name: string; description?: string; groups: string[] }[];
  pages: PageDef[];
};

export const DEFAULT_PRODUCT: ProductInfo = {
  name: 'ESQueryStudio',
  tagline: '为 Spring Boot 而生的 Elasticsearch 查询工作台',
  integrationId: 'generic',
  integrationName: '',
  docsUrl: '',
  metadata: {},
};

export const PAGES: readonly PageDef[] = contract.pages;
export const GROUPS: readonly { id: string; name: string; sort: number }[] = contract.groups;

/* 旧契约没有 packs 时合成单包 all：与后端 ConsolePageCatalog 同一兼容语义。 */
export const PACKS: readonly PackDef[] = contract.packs?.length
  ? contract.packs.map(p => ({
      id: p.id,
      name: p.name,
      description: p.description || '',
      groups: [...p.groups],
    }))
  : [{ id: 'all', name: '全部功能', description: '', groups: contract.groups.map(g => g.id) }];

export const PAGE_BY_KEY: ReadonlyMap<string, PageDef> = new Map(PAGES.map(p => [p.key, p]));
export const GROUP_TO_PACK: ReadonlyMap<string, PackDef> = new Map(
  PACKS.flatMap(pack => pack.groups.map(group => [group, pack] as const)),
);

export function normalizeRoute(path: string): string {
  const p = String(path || '').split('?')[0].split('#')[0];
  const trimmed = p.length > 1 ? p.replace(/\/+$/, '') : p;
  return trimmed.toLowerCase();
}

export const PAGE_BY_ROUTE: ReadonlyMap<string, PageDef> = new Map(
  PAGES.map(p => [normalizeRoute(p.route), p]),
);

export function pageCountOfPack(pack: PackDef): number {
  return PAGES.filter(p => pack.groups.includes(p.group)).length;
}

export function defaultUiConfig(): UiConfig {
  return {
    product: { ...DEFAULT_PRODUCT },
    packs: PACKS.map(pack => ({ ...pack, enabled: true, pageCount: pageCountOfPack(pack) })),
    disabledPages: [],
  };
}

function asString(v: unknown, fallback: string): string {
  return typeof v === 'string' ? v : fallback;
}

function asStringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

/** 把后端响应规整为前端契约形状；任何缺失/坏形都回落到安全默认，不让整站白屏。 */
export function normalizeUiConfig(raw: unknown): UiConfig {
  const base = defaultUiConfig();
  if (!raw || typeof raw !== 'object') return base;
  const obj = raw as Record<string, any>;
  const rawProduct = obj.product && typeof obj.product === 'object' ? obj.product : {};
  const product: ProductInfo = {
    name: asString(rawProduct.name, DEFAULT_PRODUCT.name),
    tagline: asString(rawProduct.tagline, DEFAULT_PRODUCT.tagline),
    integrationId: asString(rawProduct.integrationId, DEFAULT_PRODUCT.integrationId),
    integrationName: asString(rawProduct.integrationName, ''),
    docsUrl: asString(rawProduct.docsUrl, ''),
    metadata: rawProduct.metadata && typeof rawProduct.metadata === 'object' && !Array.isArray(rawProduct.metadata)
      ? { ...rawProduct.metadata } : {},
  };

  /* 空数组视为「后端未给出选择」而不是「全关」：命令行/旧构建不会返回空包集，
     真正的全关会让整个产品没有入口，不是可用的部署形态。 */
  const rawPacks = Array.isArray(obj.packs) && obj.packs.length ? obj.packs : null;
  const known = new Set(PAGES.map(p => p.key));
  const disabledPages = asStringList(obj.disabledPages).filter(k => known.has(k));

  /* 后端始终回全量 pack 列表；若只回了子集，未出现的包按「未启用」处理（配置是权威选择）。
     若响应没有 packs（旧后端/404 兜底），保持全开。 */
  const packs = PACKS.map(def => {
    const state = rawPacks?.find((p: any) => p && p.id === def.id);
    return {
      ...def,
      enabled: rawPacks ? state?.enabled === true : true,
      pageCount: pageCountOfPack(def),
    };
  });

  return { product, packs, disabledPages };
}

export function isGroupEnabled(config: UiConfig, groupId: string): boolean {
  const pack = GROUP_TO_PACK.get(groupId);
  if (!pack) return true;
  const state = config.packs.find(p => p.id === pack.id);
  return !state || state.enabled;
}

export function isPageEnabled(config: UiConfig, pageKey: string): boolean {
  const page = PAGE_BY_KEY.get(pageKey);
  if (!page) return true;
  if (config.disabledPages.includes(pageKey)) return false;
  return isGroupEnabled(config, page.group);
}

export function isRouteEnabled(config: UiConfig, path: string): boolean {
  const page = PAGE_BY_ROUTE.get(normalizeRoute(path));
  if (!page) return true;
  return isPageEnabled(config, page.key);
}

export function packOfPage(pageKey: string): PackDef | undefined {
  const page = PAGE_BY_KEY.get(pageKey);
  return page ? GROUP_TO_PACK.get(page.group) : undefined;
}

export function packStateOfPage(config: UiConfig, pageKey: string): PackState | undefined {
  const pack = packOfPage(pageKey);
  return pack ? config.packs.find(p => p.id === pack.id) : undefined;
}

/** 功能包内第一个启用页面；用于「停用页」与欢迎页的安全跳转。 */
export function firstRouteOfPack(config: UiConfig, packId: string): PageDef | undefined {
  const pack = config.packs.find(p => p.id === packId && p.enabled);
  if (!pack) return undefined;
  return PAGES.find(p => pack.groups.includes(p.group) && !config.disabledPages.includes(p.key));
}

export function enabledPacks(config: UiConfig): PackState[] {
  return config.packs.filter(p => p.enabled);
}
