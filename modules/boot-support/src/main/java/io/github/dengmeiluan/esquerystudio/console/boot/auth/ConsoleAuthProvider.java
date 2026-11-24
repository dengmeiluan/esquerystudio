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

package io.github.dengmeiluan.esquerystudio.console.boot.auth;

import java.util.Optional;

/**
 * Host-owned identity SPI. A Boot 2.7 / 3.5 / 4.2 host registers a bean to supply the
 * current principal (e.g. from Spring Security or its own session). The unified core
 * never parses servlet sessions or business roles itself.
 */
public interface ConsoleAuthProvider {

    Optional<ConsolePrincipal> currentPrincipal();
}
