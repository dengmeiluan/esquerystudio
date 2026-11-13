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

package io.github.dengmeiluan.esquerystudio.console.adhoc;

import io.github.dengmeiluan.esquerystudio.console.core.EsIndexAdmin;
import org.junit.Test;

import java.lang.reflect.Method;

import static org.junit.Assert.assertTrue;

/** 目标名建议不能自己撞上已存在的索引/别名——向导拿到的建议名必须立即可用。 */
public class AdhocSuggestDestTest {

    private static AdhocRebuildService service(EsIndexAdmin admin) {
        return new AdhocRebuildService(admin, null, 60_000L, null, 60_000L, new InMemoryAdhocJobStore());
    }

    private static String suggest(AdhocRebuildService service) throws Exception {
        Method method = AdhocRebuildService.class.getDeclaredMethod("suggestDest", String.class);
        method.setAccessible(true);
        return (String) method.invoke(service, "idx");
    }

    private static EsIndexAdmin admin(boolean indexHit, boolean aliasHit) {
        return new EsIndexAdmin(null) {
            @Override
            public boolean indexExists(String index) {
                return indexHit && index.matches("idx_adhoc_\\d{14}");
            }

            @Override
            public boolean aliasExists(String alias) {
                return aliasHit && alias.matches("idx_adhoc_\\d{14}");
            }
        };
    }

    @Test
    public void skipsExistingIndexWithSequenceSuffix() throws Exception {
        String name = suggest(service(admin(true, false)));
        assertTrue("已存在时顺延到 _2: " + name, name.matches("idx_adhoc_\\d{14}_2"));
    }

    @Test
    public void skipsExistingAliasWithSequenceSuffix() throws Exception {
        String name = suggest(service(admin(false, true)));
        assertTrue("别名占用时同样顺延: " + name, name.matches("idx_adhoc_\\d{14}_2"));
    }

    @Test
    public void keepsBaseNameWhenFree() throws Exception {
        String name = suggest(service(admin(false, false)));
        assertTrue("无冲突保持时间戳名: " + name, name.matches("idx_adhoc_\\d{14}"));
    }
}
