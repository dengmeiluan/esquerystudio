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
import org.junit.Test;
import org.springframework.beans.factory.support.DefaultListableBeanFactory;

import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Map;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

/**
 * 运行时 UI 配置：功能包选择、宿主品牌、单页排除与「配置拼错不静默清空导航」。
 */
public class ConsoleUiConfigServiceTest {

    private final ConsolePageCatalog catalog = ConsolePageCatalog.load();

    @Test
    public void 默认全开_11包页面数正确() {
        ConsoleUiConfigService service = service(new PlatformUiProperties(), null);
        Map<String, Object> view = service.view();
        assertEquals("ESQueryStudio", product(view).get("name"));
        assertEquals("generic", product(view).get("integrationId"));
        assertEquals(11, packs(view).size());
        for (Map<String, Object> pack : packs(view)) {
            assertTrue("默认应全开: " + pack.get("id"), (Boolean) pack.get("enabled"));
        }
        assertEquals(5, pageCount(view, "platform"));
        assertEquals(3, pageCount(view, "search"));
        assertEquals(8, pageCount(view, "lifecycle"));
        assertEquals(9, pageCount(view, "observe"));
        assertEquals(1, pageCount(view, "security"));
        assertTrue(((List<?>) view.get("disabledPages")).isEmpty());
    }

    @Test
    public void 显式包列表_只开所选并保持契约顺序() {
        PlatformUiProperties props = new PlatformUiProperties();
        props.getFeatures().setPacks(Arrays.asList("search", "platform"));
        Map<String, Object> view = service(props, null).view();
        assertTrue(enabled(view, "platform"));
        assertTrue(enabled(view, "search"));
        assertFalse(enabled(view, "index"));
        assertEquals("platform", packs(view).get(0).get("id"));
    }

    @Test
    public void 宿主默认包_仅在平台配置为空时生效() {
        PlatformUiProperties empty = new PlatformUiProperties();
        Map<String, Object> fromHost = service(empty, integration("acme", "Acme",
                Collections.singletonList("observe"))).view();
        assertTrue(enabled(fromHost, "observe"));
        assertFalse(enabled(fromHost, "platform"));

        PlatformUiProperties explicit = new PlatformUiProperties();
        explicit.getFeatures().setPacks(Collections.singletonList("devtools"));
        Map<String, Object> fromConfig = service(explicit,
                integration("acme", "Acme", Collections.singletonList("observe"))).view();
        assertTrue("显式配置优先于宿主默认", enabled(fromConfig, "devtools"));
        assertFalse(enabled(fromConfig, "observe"));
    }

    @Test
    public void 宿主品牌_填充集成身份但不覆盖产品名() {
        PlatformUiProperties props = new PlatformUiProperties();
        Map<String, Object> view = service(props,
                integration("acme", "Acme", Collections.emptyList())).view();
        Map<String, Object> product = product(view);
        assertEquals("ESQueryStudio", product.get("name"));
        assertEquals("acme", product.get("integrationId"));
        assertEquals("Acme", product.get("integrationName"));
    }

    @Test
    public void 显式品牌配置_覆盖宿主() {
        PlatformUiProperties props = new PlatformUiProperties();
        props.getBranding().setProductName("Acme Search");
        props.getBranding().setIntegrationName("Acme Ops");
        Map<String, Object> product = product(service(props,
                integration("acme", "Acme", Collections.emptyList())).view());
        assertEquals("Acme Search", product.get("name"));
        assertEquals("Acme Ops", product.get("integrationName"));
    }

    @Test
    public void 排除页_只接受契约内key_未知忽略() {
        PlatformUiProperties props = new PlatformUiProperties();
        props.getFeatures().setExcludePages(Arrays.asList("security", "no-such-page"));
        Map<String, Object> view = service(props, null).view();
        @SuppressWarnings("unchecked")
        List<String> disabled = (List<String>) view.get("disabledPages");
        assertEquals(Collections.singletonList("security"), disabled);
    }

    @Test
    public void 显式包全部未知_启动失败而非静默清空导航() {
        PlatformUiProperties props = new PlatformUiProperties();
        props.getFeatures().setPacks(Arrays.asList("nope", "missing"));
        try {
            service(props, null).view();
            fail("全部未知包必须抛 IllegalStateException");
        } catch (IllegalStateException expected) {
            assertTrue(expected.getMessage().contains("未命中任何功能包"));
        }
    }

    private ConsoleUiConfigService service(PlatformUiProperties props, ConsoleHostIntegration integration) {
        DefaultListableBeanFactory factory = new DefaultListableBeanFactory();
        if (integration != null) {
            factory.registerSingleton("hostIntegration", integration);
        }
        return new ConsoleUiConfigService(catalog, props,
                factory.getBeanProvider(ConsoleHostIntegration.class));
    }

    private static ConsoleHostIntegration integration(String id, String name, List<String> packs) {
        return new ConsoleHostIntegration() {
            @Override
            public String id() { return id; }

            @Override
            public String displayName() { return name; }

            @Override
            public List<String> preferredPacks() { return packs; }
        };
    }

    @SuppressWarnings("unchecked")
    private static Map<String, Object> product(Map<String, Object> view) {
        return (Map<String, Object>) view.get("product");
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> packs(Map<String, Object> view) {
        return (List<Map<String, Object>>) view.get("packs");
    }

    private static boolean enabled(Map<String, Object> view, String packId) {
        for (Map<String, Object> pack : packs(view)) {
            if (packId.equals(pack.get("id"))) {
                return (Boolean) pack.get("enabled");
            }
        }
        throw new AssertionError("missing pack: " + packId);
    }

    private static int pageCount(Map<String, Object> view, String packId) {
        for (Map<String, Object> pack : packs(view)) {
            if (packId.equals(pack.get("id"))) {
                return (Integer) pack.get("pageCount");
            }
        }
        throw new AssertionError("missing pack: " + packId);
    }
}
