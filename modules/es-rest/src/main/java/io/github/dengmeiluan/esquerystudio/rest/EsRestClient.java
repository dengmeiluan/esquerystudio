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

package io.github.dengmeiluan.esquerystudio.rest;

import java.io.IOException;

/**
 * The one ES I/O contract shared by all Boot baselines. Callers pass the HTTP
 * method/path/body; version-specific request shapes stay in the caller (the
 * existing version-aware layer), never in the transport.
 */
public interface EsRestClient {

    EsRestResponse perform(String method, String path, String body) throws IOException;
}
