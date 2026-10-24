# BashUpload-R2

English | [中文](README-zh.md)

Simple file upload service based on Cloudflare Workers and Cloudflare R2 object storage for the command line and browser.

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DullJZ/bashupload-r2)

Directly Use: [bashupload.app](https://bashupload.app)

Thanks to [bashupload.com](https://bashupload.com) and its author [@mrcrypster](https://github.com/mrcrypster) for the inspiration.

## Quick Start

```sh
# Upload file with normal URL
curl bashupload.app -T file.txt

# Upload text content (saved as .txt file)
curl bashupload.app -d "Your long text content here"

# Upload with short URL
curl bashupload.app/short -T file.txt

# Upload with custom expiration time (86400 seconds = 24 hours, allows multiple downloads)
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt
```

Use `alias` in bash to set quick upload

```sh
alias bashupload='curl bashupload.app -T'
alias bashuploadtext='curl bashupload.app -d'
alias bashuploadshort='curl bashupload.app/short -T'
alias bashuploadexpire='curl -H "X-Expiration-Seconds: 3600" bashupload.app -T'
bashupload file.txt              # Returns normal URL
bashuploadtext "your text here"  # Upload text content
bashuploadshort file.txt         # Returns short URL
bashuploadexpire file.txt        # Returns URL with 1 hour expiration
```

To make the alias persistent, add it to your shell configuration file.

```sh
echo "alias bashupload='curl bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadtext='curl bashupload.app -d'" >> ~/.bashrc
echo "alias bashuploadshort='curl bashupload.app/short -T'" >> ~/.bashrc
echo "alias bashuploadexpire='curl -H \"X-Expiration-Seconds: 3600\" bashupload.app -T'" >> ~/.bashrc
source ~/.bashrc
```

## Browser Upload

The web interface supports **English**, **Simplified Chinese (zh-CN)** and **Traditional Chinese (zh-TW)**. It automatically detects the browser language, and a language selector lets you override it. Your choice is remembered in the browser.


- Drag & drop files or click to select files
- Set custom expiration time for files
- Direct download links
- No registration required

## Features

- Simple command-line interface
- Quick text sharing
- Browser-based drag & drop upload
- No registration required
- Direct download links
- Privacy-focused: Files are automatically deleted after download
- Secure file storage with one-time download
- Custom expiration time support: Set file expiration to allow multiple downloads within specified time
- Supports files up to 5GB in size (self-hosting can adjust this limit)
- Support password setting for self-hosting

**Privacy Notice:** By default, files can be downloaded repeatedly during their server-configured retention period (1 hour unless changed with `DEFAULT_EXPIRATION_SECONDS`), after which they expire and are removed by scheduled cleanup. An optional one-time mode deletes after the first download.

## Self-Hosting to Cloudflare

Click the "Deploy to Cloudflare" button above to modify the configuration.

`MAX_UPLOAD_SIZE` is in bytes (default is 5GB), and `MAX_AGE` is in seconds (default is 1 hour). You can adjust these values as needed.

`MAX_AGE_FOR_MULTIDOWNLOAD` is the maximum expiration time allowed for multiple downloads in seconds (default is 86400, which is 24 hours). Users can set custom expiration times up to this limit.

`SHORT_URL_SERVICE` is the short URL service API endpoint (default is `https://suosuo.de/short`), you can change it to your own short URL service if needed. Only support [MyUrls](https://github.com/CareyWang/MyUrls).

`PASSWORD` environment variable is the password that must be provided for upload and download. If password protection is not needed, it can be left blank.

The final step of deployment may show a deployment failure error because the default configuration uses `bashupload.app` as the domain. In fact, the project has already been deployed successfully. You just need to bind your own domain in the Worker project settings.


### Large files in the browser (90 MiB multipart chunks)

The browser automatically switches to Cloudflare R2 multipart upload when a file is **larger than 90 MiB (94,371,840 bytes)**. It splits the file with `File.slice()`, uploads up to three parts concurrently, retries failed parts up to three times, and offers a **Cancel upload** button. R2 assembles the uploaded parts into **one object**, at the same normal download URL; one-time downloads, custom expiry and optional short URLs are preserved.

Each request remains below Cloudflare's 100 MB Free/Pro request body limit. The **whole-file limit** still comes from `MAX_UPLOAD_SIZE` (default **5 GiB**). Increase it in your Worker configuration if you need bigger files, taking R2 storage costs and your public service's abuse exposure into account. No special client-side library or additional service is required.

Multipart API endpoints (same-origin, and the existing `PASSWORD` if configured):

- `POST /api/multipart/init`
- `PUT /api/multipart/part?sessionId=...&partNumber=...`
- `POST /api/multipart/complete`
- `DELETE /api/multipart/abort`

The server stores an opaque, unguessable session in R2 and validates each part's exact byte count before forwarding it as a stream. A successful completion deletes the session. Abandoned sessions are cleaned up by the existing cron after **24 hours** (when `NO_CLEANUP` is disabled); R2 independently expires incomplete multipart uploads after seven days. Refreshing the page currently restarts the upload rather than resuming it. For best results, keep the page open while uploading.

### Default retention for uploaded files

Set `DEFAULT_EXPIRATION_SECONDS` in your Worker environment (or `wrangler.toml`) to control the default lifetime of **new** uploaded files. Default: `3600` (1 hour), with **multiple downloads allowed until expiration**. The setting must be between `0` and `MAX_AGE_FOR_MULTIDOWNLOAD`.

| Value | Behavior |
| --- | --- |
| `3600` | 1 hour, repeat downloads (default) |
| `86400` | 24 hours, repeat downloads (when `MAX_AGE_FOR_MULTIDOWNLOAD >= 86400`) |
| `0` | Legacy default: one-time download (deleted after first access) |

The browser's **One-time download** checkbox overrides the default. Selecting **Override default expiration time** sets a custom retention period. When both are unchecked, the upload uses `DEFAULT_EXPIRATION_SECONDS` as configured on the Worker. CLI uploads without any retention header also follow the default:

```sh
curl https://upload.treexhd.me -T file.txt
# Request an explicit one-time download:
curl -H "X-One-Time-Download: true" https://upload.treexhd.me -T file.txt
# Override the default retention (example: 2 hours):
curl -H "X-Expiration-Seconds: 7200" https://upload.treexhd.me -T file.txt
```

This applies to regular file PUT uploads, POST text uploads and browser-based R2 multipart uploads. `MAX_AGE` is still the scheduled cleanup fallback for objects without expiration metadata; the default retention value takes precedence for new reusable uploads. Changing the environment variable will **not retroactively update objects already stored in R2**. Deploy the updated Worker after changing it.

## Advanced Features

### Custom Expiration Time

You can set a custom expiration time for uploaded files by using the `X-Expiration-Seconds` header. This allows the file to be downloaded multiple times until it expires, after which it will be automatically deleted.

Example:
```sh
# Set 1-hour expiration (file can be downloaded multiple times for 1 hour)
curl -H "X-Expiration-Seconds: 3600" bashupload.app -T file.txt

# Set 24-hour expiration
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# Set 7-day expiration
curl -H "X-Expiration-Seconds: 604800" bashupload.app -T file.txt
```

**Important Notes:**
- Without an explicit expiration time, the server uses `DEFAULT_EXPIRATION_SECONDS` (default 1 hour, multiple downloads). Select one-time mode explicitly when needed.
- With expiration time, files can be downloaded multiple times until expiration
- The maximum allowed expiration time is controlled by `MAX_AGE_FOR_MULTIDOWNLOAD` (default: 24 hours)
- Browser upload also supports setting expiration times through the UI

### Quick Text Sharing

You can quickly share long text snippets, code, logs, or any text content without creating a file first. Simply use `curl -d` to upload text directly, and it will be saved as a `.txt` file.

Example:
```sh
# Share a quick text snippet
curl bashupload.app -d "Here's the error message I'm getting..."

# Share code snippet
curl bashupload.app -d "$(cat script.sh)"

# Share command output
curl bashupload.app -d "$(ls -la)"

# Share with expiration time for multiple views
curl -H "X-Expiration-Seconds: 3600" bashupload.app -d "Meeting notes for today..."

# Combine with short URL for easier sharing
curl bashupload.app/short -d "Your text content here"
```

### Password Protection

To enable password protection, set the `PASSWORD` environment variable in your Cloudflare Worker settings. When PASSWORD is set, both uploads and downloads will require the password to be provided in the Authorization header.

Example with curl:
```sh
# Upload with password
curl -H "Authorization: yourpassword" bashupload.app -T file.txt

# Download with password
curl -H "Authorization: yourpassword" https://bashupload.app/yourfile.txt -o downloaded.txt
```

Setting aliases with password:
```sh
echo "alias bashupload='curl -H \"Authorization: yourpassword\" bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadshort='curl -H \"Authorization: yourpassword\" bashupload.app/short -T'" >> ~/.bashrc
source ~/.bashrc
```