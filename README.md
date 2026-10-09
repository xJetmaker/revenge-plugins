# Media Gestures for classic Revenge

Version 0.1.0 — first device-test build.
Target: Revenge `1b1d297-main` (1.11.6), Discord Android 347.12 (347012).
The plugin API was checked against the exact Revenge source commit `1b1d297416594087769987908e5fc09af36b7e6e`. The Discord application itself is not available in this workspace, so native component interception, touch delivery, and gallery permission behavior are NOT yet verified on a real phone.

## Behavior

- Hold **two fingers** on one attachment for **450 ms**: a temporary, noninteractive URL tooltip appears on that media. Lift a finger to hide it. There is no copy button or clipboard access.
- Hold **three fingers** on one attachment for **700 ms**: download that attachment once to the gallery, in the Revenge album when supported.
- Add a third finger during a two-finger hold to switch to the download gesture. Returning to two fingers after a download does not trigger another action.
- All fingers must be inside the same physical media tile. Fingers on neighbouring tiles, more than three fingers, replacing a finger, scrolling, or moving more than 12 logical pixels cancel the gesture. Lift all fingers before trying again.
- Batch messages are handled per rendered image/video, using that element's own source URI. No message-wide hitbox, invisible padding, nearest-tile selection, or first-attachment fallback is used. Screen bounds are remeasured during every touch update because scrolling does not necessarily trigger layout events.
- Native image taps and one-finger holds are left to Discord. Existing gallery/video pinch gestures use the same fingers and may conflict; verify those on your device.

## Supported media and constraints

Direct Discord CDN image attachments (PNG/JPEG/GIF/WebP/AVIF) and video attachment thumbnails (MP4/MOV/WebM) are recognized. External embeds, avatars, stickers, ambiguous source arrays, and views whose layout dimensions cannot be safely preserved are skipped. Video thumbnails whose URL points to the original video will download the video, not the thumbnail conversion. Inline video support also tries a forward-ref Video component, but whether this hook is present depends on the Discord bundle; it is reported in plugin settings.

Image/video sources must use `cdn.discordapp.com/attachments/...` or `media.discordapp.net/attachments/...`. Only thumbnail conversion query parameters are removed; attachment signature/expiry parameters are preserved. Expired links produce an error; the plugin does not guess a replacement URL.

Downloads require Revenge's native file manager plus a working CameraRoll/gallery module. Missing capabilities are reported rather than opening a browser or claiming success. A download fetches the original media, writes a temporary cache file, then saves the local URI to the gallery. The temporary cache file is removed afterward. The first build supports files up to **32 MB** and at most **two concurrent downloads** to limit memory pressure. Android's gallery/storage permission prompt may appear. There is no analytics, account token lookup, or background polling.

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

- Open the plugin's settings and check Image hook, File manager, Gallery saving, and Inline video hook.
- Hold two fingers on the second image. The URL must belong to that second attachment. Release and confirm it disappears.
- Scroll and repeat, then touch across two neighbouring tiles. The cross-tile gesture must do nothing.
- Hold three fingers on one small test image. Confirm exactly one file appears in the gallery.
- Try a video thumbnail. Check that it saves the video rather than a frame.
- Check normal single taps/long presses, disable the plugin, and check them again.

If the tooltip never appears, first verify all fingers fit inside one tile and reload once. Send the settings status and any Revenge error text; do not send your account token. A successful simulated test does not establish device compatibility.

## Build and validation

No dependencies need installing. With Node.js:

```powershell
node build.cjs
node --test tests/*.test.cjs
```

The build emits `docs/media-gestures/index.js` (an expression evaluated by classic Revenge's Vendetta-compatible plugin loader) and `manifest.json` with its SHA-256 hash. Tests cover batch identity, signed URLs, gesture upgrades, exact bounds, movement/termination, native gallery call arguments, original media saving, and cleanup.

For updates, rebuild and upload both generated files. Use Revenge's plugin update action, then reload Discord.

The exact checked loader caches installed JavaScript and catches update-fetch failures before starting the cached code. Removing hosting will still prevent new installs and updates. Test a full app restart with updates disabled before relying on deleting or privatizing the repository.
