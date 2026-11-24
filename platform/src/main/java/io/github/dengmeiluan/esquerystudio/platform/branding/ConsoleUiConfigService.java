/*
 * Copyright 2026 Meiluan Deng
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

package io.github.dengmeiluan.esquerystudio.platform.branding;

import io.github.dengmeiluan.esquerystudio.platform.integration.ConsoleHostIntegration;
import io.github.dengmeiluan.esquerystudio.platform.pages.ConsolePageCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 运行时 UI 配置：把「页面契约 + 平台配置 + 宿主适配器」收敛成前端唯一读取面。
 *
 * <p>契约是功能包的唯一事实源；配置只做选择，不允许凭空创造包/页面。未知包名
 * WARN 后忽略；若显式配置的包全部未知则启动失败——静默清空整个导航比配置拼错更难排查。</p>
 *
 * @author aicoding
 */
public class ConsoleUiConfigService {

    private static final Logger LOG = LoggerFactory.getLogger(ConsoleUiConfigService.class);

    private final ConsolePageCatalog catalog;
    private final PlatformUiProperties properties;
    private final ObjectProvider<ConsoleHostIntegration> integrationProvider;

    public ConsoleUiConfigService(ConsolePageCatalog catalog, PlatformUiProperties properties,
                                  ObjectProvider<ConsoleHostIntegration> integrationProvider) {
        this.catalog = catalog;
        this.properties = properties;
        this.integrationProvider = integrationProvider;
    }

    /** 前端 {@code GET /internal/es/index/ui/config} 的完整响应体。 */
    public Map<String, Object> view() {
        ConsoleHostIntegration integration = integrationProvider.getIfAvailable();
        Set<String> enabledPackIds = resolveEnabledPacks(integration);
        Set<String> disabledPages = resolveDisabledPages();

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("product", productView(integration));
        List<Map<String, Object>> packViews = new ArrayList<>();
        for (ConsolePageCatalog.Pack pack : catalog.getPacks()) {
            Map<String, Object> pv = new LinkedHashMap<>();
            pv.put("id", pack.getId());
            pv.put("name", pack.getName());
            pv.put("description", pack.getDescription());
            pv.put("groups", pack.getGroups());
            pv.put("enabled", enabledPackIds.contains(pack.getId()));
            pv.put("pageCount", pageCountOf(pack));
            packViews.add(pv);
        }
        out.put("packs", packViews);
        out.put("disabledPages", new ArrayList<>(disabledPages));
        return out;
    }

    private Map<String, Object> productView(ConsoleHostIntegration integration) {
        PlatformUiProperties.Branding branding = properties.getBranding();
        String productName = firstNonBlank(branding.getProductName(), "ESQueryStudio");
        String tagline = firstNonBlank(branding.getTagline(), "为 Spring Boot 而生的 Elasticsearch 查询工作台");
        String integrationId = branding.getIntegrationId();
        if ((integrationId == null || integrationId.trim().isEmpty() || "generic".equals(integrationId))
                && integration != null) {
            integrationId = integration.id();
        }
        String integrationName = firstNonBlank(branding.getIntegrationName(),
                integration == null ? "" : integration.displayName());
        if (tagline == null && integration != null) {
            tagline = firstNonBlank(integration.tagline(), "为 Spring Boot 而生的 Elasticsearch 查询工作台");
        }
        Map<String, Object> product = new LinkedHashMap<>();
        product.put("name", productName);
        product.put("tagline", tagline);
        product.put("integrationId", firstNonBlank(integrationId, "generic"));
        product.put("integrationName", integrationName == null ? "" : integrationName);
        product.put("docsUrl", branding.getDocsUrl() == null ? "" : branding.getDocsUrl());
        product.put("metadata", integration == null
                ? Collections.<String, String>emptyMap() : integration.metadata());
        return product;
    }

    private Set<String> resolveEnabledPacks(ConsoleHostIntegration integration) {
        List<String> requested = clean(properties.getFeatures().getPacks());
        if (requested.isEmpty() && integration != null) {
            requested = clean(integration.preferredPacks());
        }
        Set<String> known = new LinkedHashSet<>();
        for (ConsolePageCatalog.Pack pack : catalog.getPacks()) {
            known.add(pack.getId());
        }
        if (requested.isEmpty()) {
            return known;
        }
        Set<String> enabled = new LinkedHashSet<>();
        List<String> unknown = new ArrayList<>();
        for (String id : requested) {
            if (known.contains(id)) {
                enabled.add(id);
            } else {
                unknown.add(id);
            }
        }
        if (!unknown.isEmpty()) {
            LOG.warn("[esquerystudio-ui] 忽略未知功能包: {}（契约可用: {}）", unknown, known);
        }
        if (enabled.isEmpty()) {
            throw new IllegalStateException("esquerystudio.console.features.packs 未命中任何功能包: "
                    + requested + "（可用: " + known + "）");
        }
        return enabled;
    }

    private Set<String> resolveDisabledPages() {
        List<String> requested = clean(properties.getFeatures().getExcludePages());
        if (requested.isEmpty()) {
            return Collections.emptySet();
        }
        Set<String> known = new HashSet<>();
        for (ConsolePageCatalog.Page page : catalog.getPages()) {
            known.add(page.getKey());
        }
        Set<String> disabled = new LinkedHashSet<>();
        List<String> unknown = new ArrayList<>();
        for (String key : requested) {
            if (known.contains(key)) {
                disabled.add(key);
            } else {
                unknown.add(key);
            }
        }
        if (!unknown.isEmpty()) {
            LOG.warn("[esquerystudio-ui] 忽略未知页面 key（exclude-pages）: {}", unknown);
        }
        return disabled;
    }

    private int pageCountOf(ConsolePageCatalog.Pack pack) {
        int n = 0;
        for (ConsolePageCatalog.Page page : catalog.getPages()) {
            if (pack.getGroups().contains(page.getGroup())) {
                n++;
            }
        }
        return n;
    }

    private static List<String> clean(List<String> values) {
        if (values == null) {
            return Collections.emptyList();
        }
        List<String> out = new ArrayList<>();
        for (String v : values) {
            if (v != null && !v.trim().isEmpty()) {
                out.add(v.trim());
            }
        }
        return out;
    }

    private static String firstNonBlank(String first, String fallback) {
        return first != null && !first.trim().isEmpty() ? first.trim() : fallback;
    }
}
