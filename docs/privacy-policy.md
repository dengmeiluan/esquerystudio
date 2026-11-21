# ESQueryStudio Chrome Extension — Privacy Policy

**Effective date:** 2026-11-06

ESQueryStudio is a developer tool that connects your browser directly to an Elasticsearch
cluster that you choose. This policy explains what the Chrome extension stores and what it
does not.

## Summary

- **We do not collect, receive, sell, or share your data.** There is no developer-operated
  server, analytics service, advertising SDK, or telemetry endpoint.
- **All data stays in your browser.** Connection profiles, credentials, query drafts,
  history, favorites, monitor samples, and audit records are stored in this extension's
  local browser storage (`localStorage`, `chrome.storage.local`, and IndexedDB).
- **Network requests go only to the Elasticsearch endpoint you configure.** The extension
  does not contact any other host.

## Chrome Web Store Limited Use

The extension's use of information received from Chrome APIs adheres to the Chrome Web Store
User Data Policy, including the Limited Use requirements. Information is used only to provide
the features described in this policy; it is not sold, transferred, or used for advertising.

## Data the extension handles

The extension processes the following data locally on your device:

| Data | Why it is needed | Where it is stored |
|---|---|---|
| Elasticsearch endpoint URL | Connect to the cluster you select | Local extension storage |
| Username, password, or API key you enter | Authenticate to that cluster | Local extension storage |
| Query text, SQL, Lucene, DSL, drafts | Query editing, history, favorites | Local extension storage |
| Monitor samples and alert state | Local cluster monitor history | Local IndexedDB / extension storage |
| Operation audit entries | Show your local action log | Local IndexedDB |
| Connection profiles and active selection | Multi-cluster switcher | Local extension storage |

The extension does not read pages you browse, does not inject content scripts, and does not
collect browsing history, keystrokes, cookies, or form data.

## Network activity

Every network request is sent to the Elasticsearch base URL that you enter in the connection
screen. The extension has no backend of its own. If you never configure a cluster, the
extension sends no requests. When a request is sent, it goes directly from your browser to
your cluster; the developer never receives a copy.

Elasticsearch clusters are operated by you or your organization. Their own privacy and
security practices apply to data stored in those clusters.

## Permissions

| Permission | Purpose |
|---|---|
| `storage` | Save connection profiles, drafts, history, favorites, and local settings. |
| `contextMenus` | Offer right-click actions that prefill a query from selected text. |
| `alarms` | Run the local monitor sampler while Chrome is running. |
| Optional host access for `http://*/*` and `https://*/*` | Chrome asks for access to the exact origin the user enters when they press **Connect**. The grant is optional, persists for that saved profile, and is used only for requests to that Elasticsearch endpoint. |

## Data retention and deletion

Extension data remains on your device until you delete it. You can:

- remove individual profiles, history entries, or favorites inside the extension;
- clear the extension's storage from `chrome://extensions` → ESQueryStudio → **Remove**;
- clear site/extension data through Chrome's privacy settings.

Uninstalling the extension removes its local storage from your browser profile. Data already
written to your Elasticsearch cluster is governed by that cluster's retention settings.

## Children

The extension is a developer tool and is not directed to children under 13.

## Changes

If this policy changes, the updated version will be published at this URL with a new
effective date.

## Contact

Questions or requests: open an issue at
<https://github.com/dengmeiluan/esquerystudio/issues>.

Source code: <https://github.com/dengmeiluan/esquerystudio>
