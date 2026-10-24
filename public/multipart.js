// Browser-only multipart uploader. Every request body stays at or below 90 MiB.
const MULTIPART_FALLBACK_PART_SIZE = 90 * 1024 * 1024;
const MULTIPART_CONCURRENCY = 3;
const MULTIPART_MAX_ATTEMPTS = 3;
let multipartUploadQueue = Promise.resolve();
let activeMultipartUpload = null;

function queueMultipartFile(file) {
    const queued = multipartUploadQueue.catch(() => {}).then(() => uploadMultipartFile(file));
    multipartUploadQueue = queued.catch(() => {});
    return queued;
}

function multipartHeaders(json = false) {
    const headers = {};
    if (json) headers['Content-Type'] = 'application/json';
    const password = document.getElementById('passwordInput')?.value;
    if (password) headers.Authorization = password;
    return headers;
}

async function multipartApi(path, method, body) {
    const response = await fetch(UPLOAD_URL + path, {
        method,
        headers: multipartHeaders(true),
        body: JSON.stringify(body),
    });
    const raw = await response.text();
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch {
        throw new Error('HTTP ' + response.status + ': ' + raw.slice(0, 160));
    }
    if (!response.ok) throw new Error(payload.error || 'HTTP ' + response.status);
    return payload;
}

function multipartUploadPart(file, sessionId, partSize, partNumber, job, onProgress) {
    return new Promise((resolve, reject) => {
        const start = (partNumber - 1) * partSize;
        const end = Math.min(file.size, start + partSize);
        const blob = file.slice(start, end);
        const xhr = new XMLHttpRequest();
        job.requests.add(xhr);
        xhr.open('PUT', UPLOAD_URL + '/api/multipart/part?sessionId=' +
            encodeURIComponent(sessionId) + '&partNumber=' + partNumber);
        const password = document.getElementById('passwordInput')?.value;
        if (password) xhr.setRequestHeader('Authorization', password);
        xhr.setRequestHeader('Content-Type', 'application/octet-stream');

        const finish = (error, result) => {
            job.requests.delete(xhr);
            if (error) reject(error);
            else resolve(result);
        };
        xhr.upload.addEventListener('progress', event => {
            if (event.lengthComputable) onProgress(event.loaded);
        });
        xhr.addEventListener('load', () => {
            if (xhr.status < 200 || xhr.status >= 300) {
                const error = new Error('Chunk ' + partNumber + ' failed (HTTP ' + xhr.status + ')');
                error.status = xhr.status;
                finish(error);
                return;
            }
            try {
                const part = JSON.parse(xhr.responseText);
                if (part.partNumber !== partNumber || typeof part.etag !== 'string') {
                    throw new Error('Invalid upload part response');
                }
                onProgress(blob.size);
                finish(null, part);
            } catch (error) {
                finish(error);
            }
        });
        xhr.addEventListener('error', () => {
            const error = new Error('Network error on chunk ' + partNumber);
            error.status = 0;
            finish(error);
        });
        xhr.addEventListener('abort', () => finish(new Error('Upload cancelled')));
        if (job.cancelled) {
            finish(new Error('Upload cancelled'));
            return;
        }
        xhr.send(blob);
    });
}

async function uploadMultipartFile(file) {
    const job = { cancelled: false, requests: new Set() };
    activeMultipartUpload = job;
    const cancelButton = document.getElementById('cancelMultipartUpload');
    if (cancelButton) {
        cancelButton.style.display = 'inline-block';
        cancelButton.disabled = false;
        cancelButton.onclick = () => {
            job.cancelled = true;
            cancelButton.disabled = true;
            for (const xhr of job.requests) xhr.abort();
        };
    }

    const partSize = serverConfig?.multipartPartSize || MULTIPART_FALLBACK_PART_SIZE;
    const partCount = Math.ceil(file.size / partSize);
    const useExpiration = document.getElementById('useExpiration')?.checked;
    const expirationAttribute = document.getElementById('setExpirationBtn')?.getAttribute('data-expiration-seconds');
    const expirationSeconds = useExpiration ? Number(expirationAttribute || 3600) : null;
    const shortUrl = Boolean(document.getElementById('useShortUrl')?.checked);
    let sessionId;
    let completed = false;

    showStatus(localized('Preparing multipart upload...', '正在準備分段上傳...', '正在準備分段上傳...'), 'uploading');
    showProgress();
    try {
        const init = await multipartApi('/api/multipart/init', 'POST', {
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            expirationSeconds,
            shortUrl,
        });
        sessionId = init.sessionId;
        if (init.partSize !== partSize || init.partCount !== partCount) {
            throw new Error('Server multipart settings changed. Refresh the page and retry.');
        }
        if (job.cancelled) throw new Error('Upload cancelled');

        let nextPartNumber = 1;
        let completedBytes = 0;
        let completedParts = 0;
        const inFlight = new Map();
        const parts = new Array(partCount);
        const renderProgress = () => {
            let transferred = completedBytes;
            for (const bytes of inFlight.values()) transferred += bytes;
            updateProgress(Math.min(99, 100 * transferred / file.size));
        };

        const uploadWorker = async () => {
            while (!job.cancelled) {
                const partNumber = nextPartNumber++;
                if (partNumber > partCount) return;
                const expected = Math.min(partSize, file.size - (partNumber - 1) * partSize);
                let lastError;
                for (let attempt = 1; attempt <= MULTIPART_MAX_ATTEMPTS; attempt++) {
                    if (job.cancelled) throw new Error('Upload cancelled');
                    try {
                        const part = await multipartUploadPart(
                            file, sessionId, partSize, partNumber, job,
                            bytes => {
                                inFlight.set(partNumber, Math.min(expected, bytes));
                                renderProgress();
                            },
                        );
                        parts[partNumber - 1] = part;
                        completedBytes += expected;
                        completedParts++;
                        inFlight.delete(partNumber);
                        renderProgress();
                        showStatus(localized(
                            'Uploading ' + file.name + ': ' + completedParts + '/' + partCount + ' chunks',
                            '上傳 ' + file.name + '：' + completedParts + '/' + partCount + ' 個分段',
                            '上傳 ' + file.name + '：' + completedParts + '/' + partCount + ' 個分段'
                        ), 'uploading');
                        lastError = null;
                        break;
                    } catch (error) {
                        lastError = error;
                        inFlight.delete(partNumber);
                        renderProgress();
                        if (job.cancelled || (error.status >= 400 && error.status !== 429 && error.status < 500)) {
                            throw error;
                        }
                        if (attempt < MULTIPART_MAX_ATTEMPTS) {
                            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, attempt - 1)));
                        }
                    }
                }
                if (lastError) throw lastError;
            }
            throw new Error('Upload cancelled');
        };

        const workers = Array.from(
            { length: Math.min(MULTIPART_CONCURRENCY, partCount) },
            () => uploadWorker(),
        );
        try {
            await Promise.all(workers);
        } catch (error) {
            job.cancelled = true;
            for (const xhr of job.requests) xhr.abort();
            await Promise.allSettled(workers);
            throw error;
        }
        if (job.cancelled) throw new Error('Upload cancelled');
        if (cancelButton) cancelButton.disabled = true;
        showStatus(localized('Finalizing file in R2...', '正在 R2 合併檔案...', '正在 R2 合併檔案...'), 'uploading');
        const result = await multipartApi('/api/multipart/complete', 'POST', {
            sessionId, parts,
        });
        completed = true;
        updateProgress(100);
        showStatus(localized(
            'Successfully uploaded ' + file.name + '!',
            file.name + ' 上傳成功！',
            file.name + ' 上傳成功！'
        ), 'success');
        const usePassword = Boolean(document.getElementById('usePassword')?.checked);
        addFileToList(file.name, result.url, usePassword);
        uploadedFiles.push({ name: file.name, url: result.url, passwordProtected: usePassword });
    } catch (error) {
        const cancelled = job.cancelled;
        showStatus(cancelled
            ? localized('Upload cancelled.', '已取消上傳。', '已取消上傳。')
            : localized('Upload failed: ', '上傳失敗：', '上傳失敗：') + error.message,
        cancelled ? 'error' : 'error');
        if (sessionId && !completed) {
            try {
                await multipartApi('/api/multipart/abort', 'DELETE', { sessionId });
            } catch (abortError) {
                console.warn('Failed to abort multipart upload:', abortError);
            }
        }
    } finally {
        for (const xhr of job.requests) xhr.abort();
        if (cancelButton) {
            cancelButton.style.display = 'none';
            cancelButton.onclick = null;
        }
        activeMultipartUpload = null;
        hideProgress();
    }
}
