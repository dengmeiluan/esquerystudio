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

package io.github.dengmeiluan.esquerystudio.console.client;

import io.github.dengmeiluan.esquerystudio.rest.EsRestClient;
import io.github.dengmeiluan.esquerystudio.rest.LowLevelEsRestClient;
import org.elasticsearch.client.RestHighLevelClient;

import java.util.function.Supplier;

/** Bridges the Boot 2.3 host's high-level client to the shared low-level REST contract. */
public final class EsRestClientAdapters {

    private EsRestClientAdapters() {
    }

    public static Supplier<EsRestClient> from(Supplier<RestHighLevelClient> client) {
        return () -> {
            RestHighLevelClient highLevel = client.get();
            return highLevel == null ? null : new LowLevelEsRestClient(highLevel.getLowLevelClient());
        };
    }
}
