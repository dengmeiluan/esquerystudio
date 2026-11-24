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

import org.apache.http.ParseException;
import org.apache.http.util.EntityUtils;
import org.elasticsearch.client.Cancellable;
import org.elasticsearch.client.Request;
import org.elasticsearch.client.Response;
import org.elasticsearch.client.ResponseException;
import org.elasticsearch.client.ResponseListener;
import org.elasticsearch.client.RestClient;

import java.io.IOException;
import java.util.function.Consumer;

/** Low-level client implementation that preserves Elasticsearch error bodies. */
public final class LowLevelEsRestClient implements EsAsyncRestClient {

    private final RestClient client;

    public LowLevelEsRestClient(RestClient client) {
        this.client = client;
    }

    @Override
    public EsRestResponse perform(String method, String path, String body) throws IOException {
        Request request = request(method, path, body);
        try {
            Response response = client.performRequest(request);
            return new EsRestResponse(response.getStatusLine().getStatusCode(), read(response));
        } catch (ResponseException e) {
            Response response = e.getResponse();
            return new EsRestResponse(response.getStatusLine().getStatusCode(), read(response));
        }
    }

    @Override
    public EsRestCancellable performAsync(String method, String path, String body,
                                          Consumer<EsRestResponse> onSuccess,
                                          Consumer<IOException> onFailure) {
        Cancellable cancellable = client.performRequestAsync(request(method, path, body), new ResponseListener() {
            @Override
            public void onSuccess(Response response) {
                deliver(response, onSuccess, onFailure);
            }

            @Override
            public void onFailure(Exception exception) {
                if (exception instanceof ResponseException) {
                    deliver(((ResponseException) exception).getResponse(), onSuccess, onFailure);
                    return;
                }
                onFailure.accept(exception instanceof IOException
                        ? (IOException) exception
                        : new IOException(exception));
            }
        });
        return new EsRestCancellable() {
            @Override
            public void cancel() {
                cancellable.cancel();
            }
        };
    }

    private static void deliver(Response response, Consumer<EsRestResponse> onSuccess,
                                Consumer<IOException> onFailure) {
        try {
            onSuccess.accept(new EsRestResponse(response.getStatusLine().getStatusCode(), read(response)));
        } catch (IOException e) {
            onFailure.accept(e);
        }
    }

    private static Request request(String method, String path, String body) {
        Request request = new Request(method, path);
        if (body != null && !body.isEmpty()) {
            request.setJsonEntity(body);
        }
        return request;
    }

    private static String read(Response response) throws IOException {
        /* HEAD / 204 responses carry no entity; preserve the status without failing on null. */
        if (response == null || response.getEntity() == null) {
            return "";
        }
        try {
            return EntityUtils.toString(response.getEntity());
        } catch (ParseException e) {
            throw new IOException("unparseable Elasticsearch response", e);
        }
    }
}
