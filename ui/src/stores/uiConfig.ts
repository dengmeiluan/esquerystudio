import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import { get } from '../api';
import {
  defaultUiConfig, normalizeUiConfig, enabledPacks as enabledPacksOf,
  firstRouteOfPack, isGroupEnabled, isPageEnabled, isRouteEnabled,
  packOfPage, packStateOfPage,
  type PackDef, type PackState, type PageDef, type ProductInfo, type UiConfig,
} from '../utils/uiConfig';

/** 平台运行时配置：品牌 + 功能包 + 停用页。
 *  失败（旧后端 / 无鉴权 / 网络抖动）一律回落「全开」，不让导航因配置端点故障而消失。 */
export const useUiConfigStore = defineStore('uiConfig', () => {
  const config = ref<UiConfig>(defaultUiConfig());
  const loaded = ref(false);
  const failed = ref(false);
  let inflight: Promise<void> | null = null;

  async function load(): Promise<void> {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        /* get() 默认 base=EP，path 必须是相对的——传 `${EP}/ui/config` 会拼成
           {ctx}/internal/es/index{ctx}/internal/es/index/ui/config（产线 404，配置永回落全开）。 */
        const raw = await get('/ui/config');
        config.value = normalizeUiConfig(raw);
        failed.value = false;
      } catch {
        failed.value = true;
      } finally {
        loaded.value = true;
        inflight = null;
      }
    })();
    return inflight;
  }

  const product = computed<ProductInfo>(() => config.value.product);
  const packs = computed<PackState[]>(() => config.value.packs);
  const activePacks = computed<PackState[]>(() => enabledPacksOf(config.value));

  function groupEnabled(groupId: string): boolean {
    return isGroupEnabled(config.value, groupId);
  }
  function pageEnabled(pageKey: string): boolean {
    return isPageEnabled(config.value, pageKey);
  }
  function routeEnabled(path: string): boolean {
    return isRouteEnabled(config.value, path);
  }
  function packOf(pageKey: string): PackDef | undefined {
    return packOfPage(pageKey);
  }
  function packStateOf(pageKey: string): PackState | undefined {
    return packStateOfPage(config.value, pageKey);
  }
  function firstRoute(packId: string): PageDef | undefined {
    return firstRouteOfPack(config.value, packId);
  }

  return {
    config, loaded, failed, product, packs, activePacks,
    load, groupEnabled, pageEnabled, routeEnabled, packOf, packStateOf, firstRoute,
  };
});
