# Media Gestures for classic Revenge

Version 0.1.13 — device-test build.
Target: Revenge `1b1d297-main` (1.11.6), Discord Android 347.12 (347012).
The plugin API was checked against the exact Revenge source commit `1b1d297416594087769987908e5fc09af36b7e6e`. The Discord application itself is not available in this workspace, so native component interception, touch delivery, and gallery permission behavior require device testing. The user confirmed image/video gestures and native downloading work with version 0.1.12; version 0.1.13 changes the control sequence.

## Behavior

- Hold **two fingers** on one attachment for **450 ms** to show its URL. There is no copy button or clipboard access.
- Lift either finger after the URL appears. Keep the remaining finger still on that tile to read indefinitely.
- Put a second finger back on the same tile to download once. Holding two fingers continuously never downloads automatically.
- Lift both fingers to close the URL. A third finger, moving more than 12 logical pixels, leaving the tile, or replacing the anchor cancels. Lifting before the URL appears also cancels.
- Batch messages are handled per rendered image/video, using that element's own source URI. No message-wide hitbox, invisible padding, nearest-tile selection, or first-attachment fallback is used. Screen bounds are remeasured during every touch update because scrolling does not necessarily trigger layout events.
- Native image taps and one-finger holds are left to Discord. Existing gallery/video pinch gestures use the same fingers and may conflict; verify those on your device.

## Supported media and constraints

Direct Discord CDN image attachments (PNG/JPEG/GIF/WebP/AVIF) and video attachment thumbnails (MP4/MOV/WebM) are recognized. External embeds, avatars, stickers, ambiguous source arrays, and views whose layout dimensions cannot be safely preserved are skipped. Video thumbnails whose URL points to the original video will download the video, not the thumbnail conversion. Video support discovers class, function, memo and forward-ref Video/VideoComponent exports, accepts src.videoURI/sourceURI and separate width/height props, and prefers the original video over the poster. Detection is reported in plugin settings. Nested wrappers share a context so only the outer media tile handles gestures.

Image/video sources must use `cdn.discordapp.com/attachments/...` or `media.discordapp.net/attachments/...`. Only thumbnail conversion query parameters are removed; attachment signature/expiry parameters are preserved. Expired links produce an error; the plugin does not guess a replacement URL.

Downloads first use Discord’s `MediaManager.downloadMediaAsset`, saving through Discord to Downloads or the gallery without JavaScript fetch/base64 copies. A returned promise is awaited; false results and rejection report failure. A bridge returning no promise reports an unconfirmed handoff instead of claiming success. If that API is absent, the plugin falls back to a native file manager plus CameraRoll: fetch the original, write a temporary cache file, save its local URI, then remove the cache. Only this fallback has the **32 MB** limit. At most **two simultaneous tracked requests** are allowed; unconfirmed native handoffs are managed by Discord. Android's gallery/storage permission prompt may appear. There is no analytics, account token lookup, or background polling.

## Publish on GitHub Pages

1. Create a **public** repository named `revenge-plugins` on your GitHub account. A free GitHub account needs a public repo for Pages.
2. Extract `media-gestures-ready-to-upload.zip`. Upload its contents to the repository. Keep the `docs/media-gestures/` structure intact.
3. Commit the upload to `main`.
4. Repository **Settings → Pages → Build and deployment → Deploy from a branch**. Select branch **main** and folder **/docs**, then Save.
5. Wait for GitHub's Pages deployment to finish. Check that this URL shows JSON in your browser:
   `https://YOUR-USERNAME.github.io/revenge-plugins/media-gestures/manifest.json`
6. On your phone: **Discord Settings → Revenge → Plugins → Install a plugin**. Paste the **folder** URL, without `manifest.json`:
   `https://YOUR-USERNAME.github.io/revenge-plugins/media-gestures/`
7. Enable the plugin and reload Discord once so it attaches to existing media.

Installable files are published from this repository. The installation folder URL is https://xJetmaker.github.io/revenge-plugins/media-gestures/.

## First phone test

Start with an ordinary uploaded image, then a batch of two images with visibly different filenames, then a video thumbnail.

- Open the plugin's settings and check Image hook, Discord downloader, menu guards, and Inline video hook. File manager/Gallery saving describe the fallback only.
- Hold two fingers on the second image. The URL must belong to that second attachment. Release and confirm it disappears.
- Scroll and repeat, then touch across two neighbouring tiles. The cross-tile gesture must do nothing.
- Hold two fingers until the URL appears, lift one finger and read, then return it to the tile. Confirm exactly one file appears in Downloads or the gallery.
- Try a video thumbnail. Check that it saves the video rather than a frame.
- Check normal single taps/long presses, disable the plugin, and check them again.

If the tooltip never appears, first verify all fingers fit inside one tile and reload once. Send the settings status and any Revenge error text; do not send your account token. A successful simulated test does not establish device compatibility.

## Build and validation

No dependencies need installing. With Node.js:

```powershell
node build.cjs
node --test tests/*.test.cjs
```

The build emits `docs/media-gestures/index.js` (an expression evaluated by classic Revenge's Vendetta-compatible plugin loader) and `manifest.json` with its SHA-256 hash. Tests cover batch identity, signed URLs, two-stage hold timing, exact bounds, movement/termination, native gallery call arguments, original media saving, and cleanup.

For updates, rebuild and upload both generated files. Use Revenge's plugin update action, then reload Discord.

The exact checked loader caches installed JavaScript and catches update-fetch failures before starting the cached code. Removing hosting will still prevent new installs and updates. Test a full app restart with updates disabled before relying on deleting or privatizing the repository.

0.1.1: supports memo-wrapped forward-ref Image components, prevents toast failures from disabling the plugin, and displays startup exceptions in an alert (including evaluation-time failures). If enabling still fails, send the alert text so the exact native component issue can be identified.

Version 0.1.2 supports function-based React Native Image components through React and JSX element factories, preserving the original Image identity and refs. Refetch the plugin, reload Discord, then enable it to test on your phone.

Version 0.1.3 guards Discord onLongPress callbacks during multi-finger media gestures, including callbacks retaining the initial one-finger event. Suppression stays latched through finger lifting and clears after release; ordinary one-finger long presses remain available. Refetch and reload Discord to attach guards to existing media and parent pressables.

Version 0.1.4 handles responder start/end events so a third finger can upgrade an already-owned two-finger gesture. The media overlay reports hold, cancellation and download status; download errors also open an alert, and the last result is visible in plugin settings. Native module discovery tries each bridge independently. Gallery saving still requires the supported native camera-roll API on the device.

Version 0.1.5 guards the Discord action-sheet openLazy entry point during a validated multi-finger media hold, including menu opens that provide no touch event. It also guards existing React Native Pressability instances when discoverable. The guards restore on disable; single-finger holds and touches split across media tiles do not activate the action-sheet guard. Plugin settings report which guards were detected.

Version 0.1.6 replaces three-finger downloads with a 1.5-second two-finger hold (URL at 450 ms). It prefers Discord’s MediaManager native downloader; CameraRoll is now a fallback. Calling conventions were checked against [FileContentPreview](https://github.com/fres621/vendetta-plugins/blob/master/plugins/FileContentPreview/src/ui/FCButtons.tsx) and [Stealmoji](https://github.com/aliernfrog/vd-plugins/blob/main/plugins/Stealmoji/ui/components/StealButtons.tsx).

Version 0.1.7 expands real video component support and original URL/dimension handling. Video component interception still needs confirmation on the target phone.

Version 0.1.8 recognizes full-screen video renderers from their own source/videoURI props rather than requiring a matching export name. Absolute-fill layouts are supported. Responder capture checks media bounds instead of requiring identical native touch targets, and responder grant blocks competing Android native responders. Video tiles seen in settings lists up to six component names, wrapping results and prop names, with no attachment URLs or message content.

Version 0.1.9 hooks MediaViewerItemPresenter.renderMedia, using each callback’s actual tile source and fill style inside Discord’s internally sized animated child. This covers the no-style presenter reported on the target phone, including cached JSX factories, without a window-wide gesture surface.

Version 0.1.10 separates gesture layout/source metadata from the player’s props in the full-screen renderMedia callback. Empty player styles and poster-only player sources no longer override usable callback metadata. Settings distinguish hook attachment, callback calls, wrapped children and delivered touch events.

Version 0.1.11 adds a video-only React Native Gesture Handler Manual gesture/Detector listener. This addresses wrapped video children receiving zero React touch events on the target phone. Native touch coordinates are checked against the measured media box, two fingers activate the hold, and lifting/moving/termination cancels it. Images retain their existing input path. Settings report native video gesture API availability. Native touch handling still requires target-device confirmation.

Version 0.1.12 replaces manual JS state-manager calls with native LongPress recognition configured for exactly two pointers and zero activation delay. URL/download timing remains in the validated per-tile controller (450/1500 ms). Single-pointer input cannot activate this recognizer. Settings preserve the hold/cancellation reason and report the maximum pointer count and native recognition state. Native behavior still needs confirmation on the phone.

Version 0.1.13 keeps the URL visible after one finger lifts and downloads on a second finger returning to the same tile. It removes the automatic 1.5-second download timer. Either original finger can anchor the URL, menus stay suppressed during reading, and each continuous gesture downloads at most once. The working native video recognizer stays active while one finger remains down.

## No Delete Confirmation

Install URL: https://xjetmaker.github.io/revenge-plugins/no-delete-confirmation/

Version 0.1.1 targets classic Revenge 1.11.6 / Discord Android 347.12. Enable it, open the menu on a message you are allowed to delete, and choose Delete. The plugin invokes the exact original confirmation callback immediately instead of opening the prompt. It does not make its own HTTP request or simulate a UI button. Other alerts retain their normal confirmation. This includes moderation deletion of other people’s messages when Discord permits it. Disabling restores the original alert function.

Matching requires the localized delete-message title and a message preview. Discord’s original callback continues to enforce deletion permissions. It supports classic Messages.DELETE_MESSAGE and the target build’s intl.t.MWMcg7 title descriptor. Unknown alert shapes pass through normally. Native pending/failed-message deletion paths already skip the prompt and are unchanged. Callback failures are reported without retrying the deletion.

The alert structure was checked against [Discord’s mobile message action sheet source](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/native/long_press/LongPressMessageActionSheetUtils.tsx); the classic module/title path was cross-checked with [QuickDelete’s published bundle](https://github.com/vd-plugins/proxy/blob/main/actuallythesun.github.io/vendetta-plugins/QuickDelete/index.js). The generated bundle has automated runtime coverage; the new plugin still needs its first phone test.

## Exact Unread

Install URL: https://xjetmaker.github.io/revenge-plugins/exact-unread/

Version 0.1.0 targets classic Revenge 1.11.6 / Discord 347.12. While the current channel has an estimated unread count, it retrieves missing history through Discord’s authenticated HTTP wrapper and counts distinct message IDs after the tracked acknowledgement marker. It changes getUnreadCount/isEstimated only after pagination reaches the read boundary or the end of history. Discord’s localized banner then displays the real count without a plus. No message content is persisted, no token is accessed, and other channels are not scanned.

New, deleted and bulk-deleted message events update the verified ID set without re-fetching it. Events during pagination are reconciled before publishing a count. Channel/acknowledgement changes, reconnects, backgrounding and disable invalidate the session; stale completions never change the UI. Network/rate-limit failures, missing boundaries and the 100-page limit leave Discord’s original count intact. An already in-flight native request may finish after cancellation, but no subsequent page is fetched. Exact counts require a phone test; simulated checks do not establish compatibility.

References: [ReadStateStore](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/stores/ReadStateStore.tsx), [ChatBanner](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/native/ChatBanner.tsx).

## Fast Delete

Install URL: https://xjetmaker.github.io/revenge-plugins/fast-delete/

Version 0.1.0 replaces the existing native swipe-to-reply callback with Discord’s direct deleteMessage action for eligible messages, including messages with media. Your own sent messages can be deleted; other authors require a current PermissionStore.can(MANAGE_MESSAGES, channel) result. The callback also verifies the currently selected channel, excludes pending/failed sends and thread-starter placeholders, and rechecks the message at swipe time. Other messages retain Reply. Non-swipe reply callbacks and ordinary taps, long holds, double-tap reactions, and Media Gestures are unchanged. No Delete Confirmation is optional.

Requests are deduplicated and failures are reported without retrying. Disabling restores factories and makes previously wrapped callbacks ordinary. The plugin uses native message event props without adding a chat-wide invisible gesture layer. The native swipe animation may still show Discord’s reply arrow; only its action is replaced. Phone compatibility needs a first-device test.

Reference: [MessagesRenderer native callbacks](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/native/MessagesRenderer.tsx), [MessagesHandlers](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/native/MessagesHandlers.tsx).

### Exact Unread / Fast Delete 0.1.1

Exact Unread prefers the actual HTTPUtils.HTTP export (request-object API, including its `del` method) and uses URL-string calls for the legacy REST wrapper. Missing responses produce a descriptive error and retain Discord’s count instead of throwing on undefined.status.

Fast Delete intercepts the native `longPressMessageHandleReply` / `replyToMessage` action for `message_swipe`, plus PendingReplyActionCreators.createPendingReply for builds caching the reply function. The fallback dismisses the keyboard opened by that swipe. It retains the per-message factory hook as a fallback, preserves context-menu Reply, and reports native hook availability and received swipe events in settings. Both plugins still need confirmation on the target phone after refetching and restarting.

### Exact Unread 0.1.2

HTTP discovery now identifies HTTPUtils through HTTP/getAPIBaseURL/setRequestPatch, then falls back to a get/post/del export or the legacy URL wrapper. History requests handle both the returned promise and HTTPUtils’ optional completion callback. Void or undefined promise returns wait for the callback; they never cause a second request. Cancellation cleans pending completion timers and ignores late callbacks. Requests without any response time out and keep Discord’s estimate intact. Fast Delete remains at its confirmed-working 0.1.1.

### Exact Unread 0.1.3

Reproduced the exact reported error: a synchronous `throw undefined` was mistakenly passed to a completion function whose falsey-error branch resolved an empty response. Success and rejection now use separate functions, so falsey throws are always rejected. The transport prefers HTTPUtils’ exported get function, uses its documented URL-string form with pagination in the URL, and tries the object form only after a synchronous argument-shape error. HTTP failures and rate limits do not trigger signature retries. Callback/promise completion remains deduplicated and cancellation-aware. Settings report the actual request form and response source without attachment URLs, credentials, or message content. The manifest uses a versioned entry file to avoid reusing a stale cached index.js. Fast Delete is unchanged.

### Exact Unread 0.1.4

The device received a complete response callback but lost the value at the following native await. This is consistent with reported Hermes async/await value-loss behavior, though the phone’s exact engine version is not available here. The mobile counting pipeline now uses direct response callbacks and a synchronous pagination accumulator, with no async functions, await statements, or userland Promise construction. It validates and counts each response in the callback that receives it, schedules the next page only after validation, and publishes after completion. The Promise convenience adapter is used only by CLI/core tests.

Validated the built plugin through Revenge-style eval in the official Hermes v0.13.0 CLI, with native callback fields and a native promise returned by HTTP: count 43, stage complete. This is engine compatibility evidence, not a test of the exact installed Android build. Node regressions also cover unavailable Promise construction and a thenable delivering undefined before a later valid callback. Settings show the stage and bounded error stack if another failure remains. Build EU-014-CALLBACK uses a versioned entry file. Fast Delete is unchanged.

Related primary runtime report: [Expo/Hermes await value-loss issue](https://github.com/expo/expo/issues/45592).

The version 0.1.4 bundle also passes a second official Hermes CLI scenario: callback-only pagination produces 150, live create updates to 151, delete to 150, bulk delete to 148, and unloading restores the native count and clears every timer. Userland Promise construction is disabled in this scenario and the HTTP thenable deliberately produces undefined. To reproduce, run `node tests/generate-hermes-smoke.cjs <output.js>`, then `hermes -enable-eval -Xes6-promise -Xmicrotask-queue <output.js>` with the official Hermes CLI. The unused Promise convenience adapter is excluded from the mobile bundle.


## Posting Shortcuts

Install URL: https://xjetmaker.github.io/revenge-plugins/posting-shortcuts/

Version 0.1.0 targets classic Revenge 1.11.6 / Discord Android 347.12. Open its plugin settings or run the local `/postingshortcuts` command. Choose Add shortcut, select the currently open server channel (or paste a channel link/ID), give it a name and save a text template. Each card shows its server/channel, complete template, last confirmed template-send time and current availability. One deliberate Send template tap sends that template to that destination using Discord's native message action. A recent identical template in the same channel requires an explicit repeat confirmation. Mentions do not ping. Text templates support up to 2,000 characters; there are up to 50 shortcuts per account, with six cards per page and search.

Shortcuts and confirmed history are stored locally, separately for each account. The saved history time changes only after a matching server message event, correlated by native nonce, account, channel and content. Optimistic sends and void/promise completion are not treated as success. A pending intent is persisted before sending, so repeated taps and restarts cannot silently resend it. Missing confirmation or a native error leaves the attempt locked for review: open the channel, inspect it and explicitly clear the lock if appropriate. Clearing a lock never sends anything.

The send action checks the current account, app state, connection, channel type, permissions and slowmode again immediately before invoking Discord. Cooldown checks prefer the native store; when its state is unknown, read-only history checks inspect at most 300 recent messages. Failure, a rate limit or unverifiable history leaves availability unknown/blocked. Countdown expiry only changes availability; it does not send. Another device or a server change can affect eligibility after a check, so Discord remains authoritative. There is no broadcast button, schedule, automatic repeat, retry queue or authentication-token handling. Availability requests are serial and limited to the visible cards; timers run only while the dashboard is focused and the app is active.

This plugin does not make modified-client use approved by Discord or guarantee protection from account restrictions. Follow channel rules and avoid unsolicited repetitive posting. First test with one permitted channel and a harmless template on your phone. Automated tests use simulated native APIs; the official Hermes CLI check validates bundle evaluation, dashboard editing, one native-action invocation, confirmed history and cleanup, but does not establish compatibility with the phone's exact build.

Implementation references: local classic Revenge source at revision `1b1d297` (plugin storage, local commands and custom page navigation), and [Discord mobile MessageActionCreators](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/messages/MessageActionCreators.tsx), [SlowmodeStore](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/stores/SlowmodeStore.tsx) and [GatewayConnectionStore](https://github.com/Wumpus-Central/discord-mobile-datamining/blob/main/discord_app/modules/gateway/GatewayConnectionStore.tsx). Reproduce the engine check with `node tests/generate-posting-hermes.cjs <output.js>` followed by `hermes -enable-eval -Xes6-promise -Xmicrotask-queue <output.js>`.


### Posting Shortcuts 0.1.1

Fixes shortcut actions selecting the last card instead of the tapped card under Hermes eval. The issue was reproduced against the 0.1.0 release in the official Hermes CLI: tapping Edit on Shortcut 1 opened Shortcut 2. Captured `for...of` bindings were shared by the card callbacks in this runtime; card construction now uses a function invocation with its own item parameter. The same fix covers Edit, Open, Send and Remove. Existing shortcuts and templates are preserved. Multiple-card Node and Hermes regressions verify opening each editor, saving only the selected template, navigating/sending to each correct channel and removing only the selected card. Refetch the plugin and reload Discord to receive the versioned 0.1.1 bundle.


### Posting Shortcuts 0.1.2

Adds Change all templates to the dashboard. Enter a message and choose Apply to all shortcuts to replace the template in every shortcut for the current account, including those hidden by search or pagination. The update is a single local storage write; names, channel IDs, shortcut IDs, other accounts and confirmed send history are preserved. Cancel makes no changes. Templates retain the 1–2,000 character limit; account changes or pending send attempts block the operation. This action only updates saved templates and sends no messages. Refetch and reload Discord for the versioned 0.1.2 bundle.
