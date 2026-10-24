const UPLOAD_URL = window.location.origin;
let uploadedFiles = [];
let currentLang = 'en';
let serverConfig = null;
let currentUploadMode = 'file'; // 'file' or 'text'

// English / Simplified Chinese / Traditional Chinese (Taiwan)
function localized(en, zh, zhTW) {
    return currentLang === 'zh-TW' ? zhTW : currentLang === 'zh' ? zh : en;
}

function getLocalizedText(element) {
    return element.getAttribute('data-' + currentLang) || element.getAttribute('data-en') || '';
}

function formatExpiration(value, unit) {
    const units = {
        seconds: ['seconds', '秒', '秒'], minutes: ['minutes', '分钟', '分鐘'],
        hours: ['hours', '小时', '小時'], days: ['days', '天', '天']
    };
    const forms = units[unit] || [unit, unit, unit];
    return currentLang === 'en' ? `${value} ${forms[0]}`
        : `${value}${localized(forms[0], forms[1], forms[2])}`;
}

// 格式化字节数为可读字符串
function formatBytes(bytes) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + sizes[i];
}

// Fetch server configuration
async function fetchServerConfig() {
    try {
        const response = await fetch(`${UPLOAD_URL}/api/config`);
        if (response.ok) {
            serverConfig = await response.json();
            updateMaxExpirationDisplay();
            updateMaxFileSizeDisplay();
            applyPasswordRequirement();
        }
    } catch (error) {
        console.error('Failed to fetch server configuration:', error);
    }
}

// Update maximum expiration time display
function updateMaxExpirationDisplay() {
    if (!serverConfig || !serverConfig.maxAgeForMultiDownload) return;
    
    const maxExpirationSeconds = serverConfig.maxAgeForMultiDownload;
    let value = maxExpirationSeconds;
    let unit = 'seconds';
    let unitZh = '秒';
    let unitZhTW = '秒';
    
    if (maxExpirationSeconds % 86400 === 0) {
        value = maxExpirationSeconds / 86400;
        unit = 'days';
        unitZh = '天';
    } else if (maxExpirationSeconds % 3600 === 0) {
        value = maxExpirationSeconds / 3600;
        unit = 'hours';
        unitZh = '小时';
        unitZhTW = '小時';
    } else if (maxExpirationSeconds % 60 === 0) {
        value = maxExpirationSeconds / 60;
        unit = 'minutes';
        unitZh = '分钟';
        unitZhTW = '分鐘';
    }
    
    const maxExpirationInfo = document.getElementById('maxExpirationInfo');
    if (maxExpirationInfo) {
        const langText = maxExpirationInfo.querySelector('.lang-text');
        if (langText) {
            const maxTextEn = `💡 Maximum allowed: ${value} ${unit}`;
            const maxTextZh = `💡 最大允许值: ${value}${unitZh}`;
            const maxTextTw = `💡 允許的最長期限：${value}${unitZhTW}`;
            
            langText.setAttribute('data-en', maxTextEn);
            langText.setAttribute('data-zh', maxTextZh);
            langText.setAttribute('data-zh-tw', maxTextTw);
            langText.textContent = localized(maxTextEn, maxTextZh, maxTextTw);
        }
    }
}

// Update maximum file size display
function updateMaxFileSizeDisplay() {
    if (!serverConfig || !serverConfig.maxUploadSize) return;
    
    const maxSizeBytes = serverConfig.maxUploadSize;
    const maxSizeText = formatBytes(maxSizeBytes);
    
    // Update upload area max size display
    const maxFileSizeInfo = document.getElementById('maxFileSizeInfo');
    if (maxFileSizeInfo) {
        const langText = maxFileSizeInfo.querySelector('.lang-text');
        if (langText) {
            const maxTextEn = `Max: ${maxSizeText}`;
            const maxTextZh = `最大: ${maxSizeText}`;
            const maxTextTw = `最大：${maxSizeText}`;
            
            langText.setAttribute('data-en', maxTextEn);
            langText.setAttribute('data-zh', maxTextZh);
            langText.setAttribute('data-zh-tw', maxTextTw);
            langText.textContent = localized(maxTextEn, maxTextZh, maxTextTw);
        }
    }
    
    // Update features section max file size display
    const maxFileSizeFeature = document.getElementById('maxFileSizeFeature');
    if (maxFileSizeFeature) {
        const featureTextEn = `Supports files up to ${maxSizeText} in size`;
        const featureTextZh = `支持最大 ${maxSizeText} 的文件`;
        const featureTextTw = `支援最大 ${maxSizeText} 的檔案`;
        
        maxFileSizeFeature.setAttribute('data-en', featureTextEn);
        maxFileSizeFeature.setAttribute('data-zh', featureTextZh);
        maxFileSizeFeature.setAttribute('data-zh-tw', featureTextTw);
        maxFileSizeFeature.textContent = localized(featureTextEn, featureTextZh, featureTextTw);
    }
}

function applyPasswordRequirement() {
    const usePasswordCheckbox = document.getElementById('usePassword');
    const passwordContainer = document.getElementById('passwordContainer');
    const passwordInput = document.getElementById('passwordInput');
    const passwordNotice = document.getElementById('passwordNotice');
    const passwordLabel = usePasswordCheckbox?.closest('.checkbox-label');
    const passwordLabelTexts = passwordLabel ? passwordLabel.querySelectorAll('.lang-text') : null;
    const passwordNoticeText = passwordNotice ? passwordNotice.querySelector('.lang-text') : null;

    if (!usePasswordCheckbox || !passwordContainer || !passwordInput) {
        return;
    }

    const isRequired = Boolean(serverConfig && serverConfig.needPassword);

    // Cache default translations for later restoration
    if (passwordNoticeText) {
        if (!passwordNoticeText.dataset.enDefault) {
            passwordNoticeText.dataset.enDefault = passwordNoticeText.getAttribute('data-en') || '';
        }
        if (!passwordNoticeText.dataset.zhDefault) {
            passwordNoticeText.dataset.zhDefault = passwordNoticeText.getAttribute('data-zh') || '';
        }
        if (!passwordNoticeText.dataset.zhTwDefault) {
            passwordNoticeText.dataset.zhTwDefault = passwordNoticeText.getAttribute('data-zh-tw') || '';
        }
    }
    if (passwordLabelTexts && passwordLabelTexts.length > 0) {
        const labelMainText = passwordLabelTexts[0];
        if (labelMainText && !labelMainText.dataset.enDefault) {
            labelMainText.dataset.enDefault = labelMainText.getAttribute('data-en') || '';
        }
        if (labelMainText && !labelMainText.dataset.zhDefault) {
            labelMainText.dataset.zhDefault = labelMainText.getAttribute('data-zh') || '';
        }
        if (labelMainText && !labelMainText.dataset.zhTwDefault) {
            labelMainText.dataset.zhTwDefault = labelMainText.getAttribute('data-zh-tw') || '';
        }
        if (passwordLabelTexts.length > 1) {
            const tooltipText = passwordLabelTexts[1];
            if (tooltipText && !tooltipText.dataset.enDefault) {
                tooltipText.dataset.enDefault = tooltipText.getAttribute('data-en') || '';
            }
            if (tooltipText && !tooltipText.dataset.zhDefault) {
                tooltipText.dataset.zhDefault = tooltipText.getAttribute('data-zh') || '';
            }
            if (tooltipText && !tooltipText.dataset.zhTwDefault) {
                tooltipText.dataset.zhTwDefault = tooltipText.getAttribute('data-zh-tw') || '';
            }
        }
    }

    if (isRequired) {
        usePasswordCheckbox.checked = true;
        usePasswordCheckbox.disabled = true;
        if (passwordLabel) {
            passwordLabel.classList.add('disabled');
        }
        passwordContainer.style.display = 'block';
        passwordInput.setAttribute('aria-required', 'true');
        updatePasswordPlaceholder();

        if (passwordNoticeText) {
            passwordNoticeText.setAttribute('data-en', '⚠️ Password required: The server enforces uploads to include the configured password');
            passwordNoticeText.setAttribute('data-zh', '⚠️ 必须输入密码：服务器要求上传时提供配置的密码');
            passwordNoticeText.setAttribute('data-zh-tw', '⚠️ 必須輸入密碼：伺服器要求上傳時提供設定的密碼');
            passwordNoticeText.textContent = getLocalizedText(passwordNoticeText);
        }

        if (passwordLabelTexts && passwordLabelTexts.length > 0) {
            const labelMainText = passwordLabelTexts[0];
            labelMainText.setAttribute('data-en', 'Server password required');
            labelMainText.setAttribute('data-zh', '服务器要求必须输入密码');
            labelMainText.setAttribute('data-zh-tw', '伺服器要求輸入密碼');
            labelMainText.textContent = getLocalizedText(labelMainText);

            if (passwordLabelTexts.length > 1) {
                const tooltipText = passwordLabelTexts[1];
                tooltipText.setAttribute('data-en', 'Every upload must include the configured server password');
                tooltipText.setAttribute('data-zh', '每次上传都必须填写服务器配置的密码');
            tooltipText.setAttribute('data-zh-tw', '每次上傳都必須填寫伺服器設定的密碼');
                tooltipText.textContent = getLocalizedText(tooltipText);
            }
        }
    } else {
        usePasswordCheckbox.disabled = false;
        if (passwordLabel) {
            passwordLabel.classList.remove('disabled');
        }

        if (passwordNoticeText) {
            const enDefault = passwordNoticeText.dataset.enDefault || passwordNoticeText.getAttribute('data-en') || '';
            const zhDefault = passwordNoticeText.dataset.zhDefault || passwordNoticeText.getAttribute('data-zh') || '';
            const twDefault = passwordNoticeText.dataset.zhTwDefault || passwordNoticeText.getAttribute('data-zh-tw') || '';
            passwordNoticeText.setAttribute('data-en', enDefault);
            passwordNoticeText.setAttribute('data-zh', zhDefault);
            passwordNoticeText.setAttribute('data-zh-tw', twDefault);
            passwordNoticeText.textContent = localized(enDefault, zhDefault, twDefault);
        }

        if (passwordLabelTexts && passwordLabelTexts.length > 0) {
            const labelMainText = passwordLabelTexts[0];
            const enDefault = labelMainText.dataset.enDefault || labelMainText.getAttribute('data-en') || '';
            const zhDefault = labelMainText.dataset.zhDefault || labelMainText.getAttribute('data-zh') || '';
            const twDefault = labelMainText.dataset.zhTwDefault || labelMainText.getAttribute('data-zh-tw') || '';
            labelMainText.setAttribute('data-en', enDefault);
            labelMainText.setAttribute('data-zh', zhDefault);
            labelMainText.setAttribute('data-zh-tw', twDefault);
            labelMainText.textContent = localized(enDefault, zhDefault, twDefault);

            if (passwordLabelTexts.length > 1) {
                const tooltipText = passwordLabelTexts[1];
                const tooltipEnDefault = tooltipText.dataset.enDefault || tooltipText.getAttribute('data-en') || '';
                const tooltipZhDefault = tooltipText.dataset.zhDefault || tooltipText.getAttribute('data-zh') || '';
            const tooltipTwDefault = tooltipText.dataset.zhTwDefault || tooltipText.getAttribute('data-zh-tw') || '';
                tooltipText.setAttribute('data-en', tooltipEnDefault);
                tooltipText.setAttribute('data-zh', tooltipZhDefault);
            tooltipText.setAttribute('data-zh-tw', tooltipTwDefault);
                tooltipText.textContent = localized(tooltipEnDefault, tooltipZhDefault, tooltipTwDefault);
            }
        }

        // Keep password container visibility aligned with current checkbox state
        passwordInput.removeAttribute('aria-required');

        if (usePasswordCheckbox.checked) {
            passwordContainer.style.display = 'block';
            updatePasswordPlaceholder();
        } else {
            passwordContainer.style.display = 'none';
            passwordInput.value = '';
            passwordInput.style.borderColor = '#ddd';
            passwordInput.style.boxShadow = 'none';
        }
    }
}

// Language detection and switching
function detectLanguage() {
    const stored = localStorage.getItem('bashupload-language');
    if (['en', 'zh', 'zh-TW'].includes(stored)) return stored;
    const browserLang = (navigator.language || navigator.userLanguage || 'en').toLowerCase();
    if (/^zh[-_](tw|hk|mo|hant)(?:$|[-_])/.test(browserLang)) return 'zh-TW';
    return browserLang.startsWith('zh') ? 'zh' : 'en';
}

function switchLanguage(lang) {
    if (!['en', 'zh', 'zh-TW'].includes(lang)) lang = 'en';
    currentLang = lang;
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
    document.title = localized('BashUpload - One-Time File Sharing', 'BashUpload - 一次性文件分享服务', 'BashUpload - 一次性檔案分享服務');
    localStorage.setItem('bashupload-language', lang);
    const languageSelect = document.getElementById('languageSelect');
    if (languageSelect) languageSelect.value = lang;
    // Update all elements with lang-text class
    document.querySelectorAll('.lang-text').forEach(element => {
        const text = element.getAttribute('data-' + lang);
        if (text) {
            element.textContent = text;
        }
    });
    // Update code blocks
    document.querySelectorAll('.lang-code').forEach(element => {
        const text = element.getAttribute('data-' + lang);
        if (text) {
            element.textContent = text;
        }
    });
    // Update password placeholder if password container is visible
    const passwordContainer = document.getElementById('passwordContainer');
    if (passwordContainer.style.display !== 'none') {
        updatePasswordPlaceholder();
    }
    // Update max expiration display after language switch
    updateMaxExpirationDisplay();
    // Update max file size display after language switch
    updateMaxFileSizeDisplay();
    // Update text input placeholder after language switch
    updateTextInputPlaceholder();
    // Update expiration placeholder after language switch
    updateExpirationPlaceholder();
}

// Switch upload mode between file and text
function switchUploadMode(mode) {
    currentUploadMode = mode;
    const fileContainer = document.getElementById('uploadContainer');
    const textContainer = document.getElementById('textUploadContainer');
    const fileModeBtn = document.getElementById('fileModeBtn');
    const textModeBtn = document.getElementById('textModeBtn');

    if (mode === 'file') {
        fileContainer.style.display = 'block';
        textContainer.style.display = 'none';
        fileModeBtn.classList.add('active');
        textModeBtn.classList.remove('active');
    } else {
        fileContainer.style.display = 'none';
        textContainer.style.display = 'block';
        fileModeBtn.classList.remove('active');
        textModeBtn.classList.add('active');
    }
}

// Handle text upload
function handleTextUpload() {
    const textInput = document.getElementById('textInput');
    const text = textInput.value.trim();

    if (!text) {
        const errorMsg = localized('Please enter text content to share', '请输入要分享的文本内容', '請輸入要分享的文字內容');
        showStatus(errorMsg, 'error');
        return;
    }

    // Check if password protection is enabled but no password provided
    const usePassword = document.getElementById('usePassword')?.checked;
    const requirePassword = Boolean(serverConfig?.needPassword);
    const passwordInput = document.getElementById('passwordInput');
    if ((requirePassword || usePassword) && (!passwordInput || !passwordInput.value.trim())) {
        const errorMsg = localized('Please enter a password to enable password protection.', '请输入密码以启用密码保护。', '請輸入密碼以啟用密碼保護。');
        showStatus(errorMsg, 'error');
        return;
    }

    uploadText(text);
}

// Upload text content
async function uploadText(text, maxRetries = 3) {
    const uploadingMsg = localized('Uploading text...', '正在上传文本...', '正在上傳文字...');
    showStatus(uploadingMsg, 'uploading');
    showProgress();

    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await uploadTextWithProgress(text, (progress) => {
                updateProgress(progress);
            });

            if (response.status === 200) {
                const responseUrl = response.responseText.trim();
                if (responseUrl.startsWith('http')) {
                    hideProgress();
                    // 根据是否设置了有效期显示不同的成功消息
                    const useExpiration = document.getElementById('useExpiration')?.checked;
                    let successMsg;
                    if (useExpiration) {
                        const setExpirationBtn = document.getElementById('setExpirationBtn');
                        const expirationSeconds = setExpirationBtn.getAttribute('data-expiration-seconds');

                        if (expirationSeconds) {
                            const seconds = parseInt(expirationSeconds);
                            let value = seconds;
                            let unit = 'seconds';

                            if (seconds % 86400 === 0) {
                                value = seconds / 86400;
                                unit = 'days';
                            } else if (seconds % 3600 === 0) {
                                value = seconds / 3600;
                                unit = 'hours';
                            } else if (seconds % 60 === 0) {
                                value = seconds / 60;
                                unit = 'minutes';
                            }

                            let expirationString = formatExpiration(value, unit);

                            successMsg = localized(`Text uploaded successfully! (Expiration: ${expirationString})`, `文本上传成功！(有效期: ${expirationString})`, `文字上傳成功！（有效期限：${expirationString}）`);
                        } else {
                            successMsg = localized(`Text uploaded successfully! (Default expiration: 1 hour)`, `文本上传成功！(默认有效期: 1小时)`, `文字上傳成功！（預設有效期限：1 小時）`);
                        }
                    } else {
                        successMsg = localized(`Text uploaded successfully! (One-time download)`, `文本上传成功！(一次性下载)`, `文字上傳成功！（僅能下載一次）`);
                    }
                    showStatus(successMsg, 'success');
                    // 提取纯URL（去除警告信息）
                    const cleanUrl = responseUrl.split('\n')[0];
                    const usePassword = document.getElementById('usePassword')?.checked;
                    addFileToList('text.txt', cleanUrl, usePassword);
                    uploadedFiles.push({ name: 'text.txt', url: cleanUrl, passwordProtected: usePassword });

                    // Clear text input after successful upload
                    document.getElementById('textInput').value = '';
                    return;
                } else {
                    const errorMsg = localized('Upload completed but received unexpected response', '上传完成但收到意外响应', '上傳完成，但收到非預期的回應');
                    throw new Error(errorMsg);
                }
            } else if (response.status === 401) {
                hideProgress();
                const passwordErrorMsg = localized('Password error, please check that the password you entered matches the PASSWORD environment variable configured on the server', '密码错误，请检查您输入的密码是否与服务器配置的PASSWORD环境变量相同', '密碼錯誤，請確認輸入的密碼與伺服器設定的 PASSWORD 環境變數相同');
                showStatus(passwordErrorMsg, 'error');
                return;
            } else {
                throw new Error(`Server returned status ${response.status}`);
            }
        } catch (error) {
            lastError = error;
            console.log(`Upload failed (attempt ${attempt}/${maxRetries}):`, error);

            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Retrying in ${delay/1000} seconds...`);
                const retryMsg = localized(`Upload failed, retrying in ${delay/1000} seconds...`, `上传失败，${delay/1000} 秒后重试...`, `上傳失敗，${delay/1000} 秒後重試...`);
                showStatus(retryMsg, 'uploading');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }

    hideProgress();
    const failedMsg = localized(`Failed to upload text after ${maxRetries} attempts. Error: ${lastError.message}`, `上传文本失败，已重试 ${maxRetries} 次。错误：${lastError.message}`, `上傳文字失敗，已重試 ${maxRetries} 次。錯誤：${lastError.message}`);
    showStatus(failedMsg, 'error');
}

// Upload text with progress tracking
function uploadTextWithProgress(text, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();

        // Upload progress
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                onProgress(percentComplete);
            }
        });

        // Upload complete
        xhr.addEventListener('load', function() {
            resolve({
                status: xhr.status,
                responseText: xhr.responseText
            });
        });

        // Upload error
        xhr.addEventListener('error', function() {
            reject(new Error('Network error occurred'));
        });

        // Check if short URL option is selected
        const useShortUrl = document.getElementById('useShortUrl')?.checked;
        const uploadPath = useShortUrl ? `${UPLOAD_URL}/short` : `${UPLOAD_URL}/`;

        // Check if password protection is enabled
        const usePassword = document.getElementById('usePassword')?.checked;
        const passwordInput = document.getElementById('passwordInput');

        // Check if expiration is set
        const useExpiration = document.getElementById('useExpiration')?.checked;

        // Use POST method for text upload
        xhr.open('POST', uploadPath);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');

        // Add Authorization header if password is provided
        if (usePassword && passwordInput.value) {
            xhr.setRequestHeader('Authorization', passwordInput.value);
        }

        // Add expiration header if expiration is set
        if (useExpiration) {
            const setExpirationBtn = document.getElementById('setExpirationBtn');
            let expirationSeconds = setExpirationBtn.getAttribute('data-expiration-seconds');

            // If no expiration time was explicitly set, use default (1 hour)
            if (!expirationSeconds) {
                expirationSeconds = '3600';
            }

            xhr.setRequestHeader('X-Expiration-Seconds', expirationSeconds);
        }

        // Send text as form data
        xhr.send(text);
    });
}

// Initialize language on page load
document.addEventListener('DOMContentLoaded', function() {
    currentLang = detectLanguage();
    switchLanguage(currentLang);
    
    // Fetch server configuration
    fetchServerConfig();
    
    // Set up password checkbox functionality
    const usePasswordCheckbox = document.getElementById('usePassword');
    const passwordContainer = document.getElementById('passwordContainer');
    const passwordInput = document.getElementById('passwordInput');
    
    usePasswordCheckbox.addEventListener('change', function() {
        if (this.checked) {
            passwordContainer.style.display = 'block';
            // Update placeholder text based on language
            updatePasswordPlaceholder();
            // Focus on password input
            setTimeout(() => passwordInput.focus(), 100);
        } else {
            passwordContainer.style.display = 'none';
            passwordInput.value = '';
        }
    });
    
    // Add visual feedback for password input
    passwordInput.addEventListener('input', function() {
        if (this.value.trim()) {
            this.style.borderColor = '#28a745';
            this.style.boxShadow = '0 0 0 2px rgba(40, 167, 69, 0.1)';
        } else {
            this.style.borderColor = '#ddd';
            this.style.boxShadow = 'none';
        }
    });

    // Set up expiration checkbox functionality
    const useExpirationCheckbox = document.getElementById('useExpiration');
    const expirationContainer = document.getElementById('expirationContainer');
    
    useExpirationCheckbox.addEventListener('change', function() {
        if (this.checked) {
            expirationContainer.style.display = 'block';
        } else {
            expirationContainer.style.display = 'none';
        }
    });

    // Set up expiration button functionality
    const setExpirationBtn = document.getElementById('setExpirationBtn');
    const expirationResult = document.getElementById('expirationResult');
    const expirationInput = document.getElementById('expirationInput');
    const expirationUnit = document.getElementById('expirationUnit');
    
    setExpirationBtn.addEventListener('click', function() {
        const value = parseInt(expirationInput.value);
        const unit = expirationUnit.value;
        
        if (value > 0) {
            // Store expiration time in seconds in a global/alternative way
            let seconds = 0;
            switch(unit) {
                case 'seconds':
                    seconds = value;
                    break;
                case 'minutes':
                    seconds = value * 60;
                    break;
                case 'hours':
                    seconds = value * 3600;
                    break;
                case 'days':
                    seconds = value * 86400;
                    break;
            }
            
            // Store in a data attribute for reliable access
            setExpirationBtn.setAttribute('data-expiration-seconds', seconds);
            
            // Show success message
            expirationResult.style.display = 'block';
            setTimeout(() => {
                expirationResult.style.display = 'none';
            }, 2000);
        }
    });

    // Update expiration placeholder based on language
    updateExpirationPlaceholder();

    // Update text input placeholder based on language
    updateTextInputPlaceholder();
});

function updateTextInputPlaceholder() {
    const textInput = document.getElementById('textInput');
    if (textInput) {
        const enPlaceholder = textInput.getAttribute('data-en-placeholder');
        const zhPlaceholder = textInput.getAttribute('data-zh-placeholder');
    const twPlaceholder = textInput.getAttribute('data-zh-tw-placeholder');
        textInput.placeholder = localized(enPlaceholder, zhPlaceholder, twPlaceholder);
    }
}

function updatePasswordPlaceholder() {
    const passwordInput = document.getElementById('passwordInput');
    const enPlaceholder = passwordInput.getAttribute('data-en-placeholder');
    const zhPlaceholder = passwordInput.getAttribute('data-zh-placeholder');
    const twPlaceholder = passwordInput.getAttribute('data-zh-tw-placeholder');
    passwordInput.placeholder = localized(enPlaceholder, zhPlaceholder, twPlaceholder);
    
    // Update password notice text
    const passwordNotice = document.getElementById('passwordNotice');
    if (passwordNotice) {
        const noticeText = passwordNotice.querySelector('.lang-text');
        if (noticeText) {
            const enText = noticeText.getAttribute('data-en');
            const zhText = noticeText.getAttribute('data-zh');
            const twText = noticeText.getAttribute('data-zh-tw');
            noticeText.textContent = localized(enText, zhText, twText);
        }
    }
}

function updateExpirationPlaceholder() {
    const expirationInput = document.getElementById('expirationInput');
    const enPlaceholder = expirationInput.getAttribute('data-en-placeholder');
    const zhPlaceholder = expirationInput.getAttribute('data-zh-placeholder');
    const twPlaceholder = expirationInput.getAttribute('data-zh-tw-placeholder');
    expirationInput.placeholder = localized(enPlaceholder, zhPlaceholder, twPlaceholder);
    
    // Update expiration units text
    const expirationUnit = document.getElementById('expirationUnit');
    const optionSeconds = expirationUnit.querySelector('option[value="seconds"]');
    const optionMinutes = expirationUnit.querySelector('option[value="minutes"]');
    const optionHours = expirationUnit.querySelector('option[value="hours"]');
    const optionDays = expirationUnit.querySelector('option[value="days"]');
    
    if (currentLang === 'zh') {
        optionSeconds.textContent = '秒';
        optionMinutes.textContent = '分钟';
        optionHours.textContent = '小时';
        optionDays.textContent = '天';
    } else if (currentLang === 'zh-TW') {
        optionSeconds.textContent = '秒';
        optionMinutes.textContent = '分鐘';
        optionHours.textContent = '小時';
        optionDays.textContent = '天';
    } else {
        optionSeconds.textContent = 'seconds';
        optionMinutes.textContent = 'minutes';
        optionHours.textContent = 'hours';
        optionDays.textContent = 'days';
    }
}

// Get DOM elements
const uploadContainer = document.getElementById('uploadContainer');
const uploadStatus = document.getElementById('uploadStatus');
const progressBar = document.getElementById('progressBar');
const progressFill = document.getElementById('progressFill');
const fileList = document.getElementById('fileList');

// Drag and drop event handlers
uploadContainer.addEventListener('dragover', handleDragOver);
uploadContainer.addEventListener('dragleave', handleDragLeave);
uploadContainer.addEventListener('drop', handleDrop);

function handleDragOver(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadContainer.classList.add('dragging');
}

function handleDragLeave(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadContainer.classList.remove('dragging');
}

function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    uploadContainer.classList.remove('dragging');
    
    const files = e.dataTransfer.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

function handleFileSelect(e) {
    const files = e.target.files;
    if (files.length > 0) {
        handleFiles(files);
    }
}

function handleFiles(files) {
    for (let i = 0; i < files.length; i++) {
        uploadFile(files[i]);
    }
}

function showStatus(message, type) {
    uploadStatus.textContent = message;
    uploadStatus.className = 'upload-status ' + type;
    uploadStatus.style.display = 'block';
}

function hideStatus() {
    uploadStatus.style.display = 'none';
}

function showProgress() {
    progressBar.style.display = 'block';
    progressFill.style.width = '0%';
}

function updateProgress(percent) {
    progressFill.style.width = percent + '%';
}

function hideProgress() {
    progressBar.style.display = 'none';
}

// Simplified upload function - our Worker handles everything with a single PUT request

async function uploadFile(file) {
    // Check file size limit using server configuration
    const maxFileSize = serverConfig?.maxUploadSize || (5 * 1024 * 1024 * 1024); // Default 5GB if config not loaded
    if (file.size > maxFileSize) {
        const maxSizeText = formatBytes(maxFileSize);
        const errorMsg = localized(`File ${file.name} exceeds ${maxSizeText} size limit.`, `文件 ${file.name} 超过 ${maxSizeText} 大小限制。`, `檔案 ${file.name} 超過 ${maxSizeText} 的大小限制。`);
        showStatus(errorMsg, 'error');
        return;
    }
    
    // Check if password protection is enabled but no password provided
    const usePassword = document.getElementById('usePassword')?.checked;
    const requirePassword = Boolean(serverConfig?.needPassword);
    const passwordInput = document.getElementById('passwordInput');
    if ((requirePassword || usePassword) && (!passwordInput || !passwordInput.value.trim())) {
        const errorMsg = localized('Please enter a password to enable password protection.', '请输入密码以启用密码保护。', '請輸入密碼以啟用密碼保護。');
        showStatus(errorMsg, 'error');
        return;
    }
    
    // Files over 90 MiB use streamed R2 multipart upload; smaller files keep the original PUT path.
    if (file.size > (serverConfig?.multipartPartSize || 90 * 1024 * 1024)) {
        queueMultipartFile(file);
    } else {
        uploadSimpleFile(file);
    }
}

function addFileToList(fileName, url, usePassword = false) {
    const fileItem = document.createElement('div');
    fileItem.className = 'file-item';
    
    // 检查是否设置了有效期
    const useExpiration = document.getElementById('useExpiration')?.checked;
    
    // 添加下载警告（根据是否有有效期显示不同的消息）
    const warningText = document.createElement('div');
    warningText.style.color = '#ff6b35';
    warningText.style.fontSize = '12px';
    warningText.style.marginBottom = '5px';
    if (useExpiration) {
        const setExpirationBtn = document.getElementById('setExpirationBtn');
        const expirationSeconds = setExpirationBtn.getAttribute('data-expiration-seconds');
        
        if (expirationSeconds) {
            // Convert seconds to human readable format
            const seconds = parseInt(expirationSeconds);
            let value = seconds;
            let unit = 'seconds';
            
            if (seconds % 86400 === 0) {
                value = seconds / 86400;
                unit = 'days';
            } else if (seconds % 3600 === 0) {
                value = seconds / 3600;
                unit = 'hours';
            } else if (seconds % 60 === 0) {
                value = seconds / 60;
                unit = 'minutes';
            }
            
            let expirationString = formatExpiration(value, unit);
            
            warningText.innerHTML = localized(`🕐 Note: This file will expire after ${expirationString} and can be downloaded multiple times`, `🕐 注意：此文件将在 ${expirationString} 后过期，期间可多次下载`, `🕐 注意：此檔案將於 ${expirationString} 後到期，期間可重複下載`);
        } else {
            // Default to 1 hour if no specific time was set
            let expirationString = localized('1 hour', '1小时', '1 小時');
            warningText.innerHTML = localized(`🕐 Note: This file will expire after ${expirationString} and can be downloaded multiple times`, `🕐 注意：此文件将在 ${expirationString} 后过期，期间可多次下载`, `🕐 注意：此檔案將於 ${expirationString} 後到期，期間可重複下載`);
        }
    } else {
        warningText.innerHTML = localized('⚠️ Note: This link can only be used once, file will be deleted after download', '⚠️ 注意：此链接只能使用一次，下载后文件将自动删除', '⚠️ 注意：此連結只能使用一次，下載後檔案將自動刪除');
    }
    
    // 添加密码保护警告
    let passwordWarning = null;
    if (usePassword) {
        passwordWarning = document.createElement('div');
        passwordWarning.style.color = '#e74c3c';
        passwordWarning.style.fontSize = '12px';
        passwordWarning.style.marginBottom = '5px';
        passwordWarning.innerHTML = localized('🔒 Note: This link requires a password to download', '🔒 注意：此链接需要密码才能下载', '🔒 注意：此連結需要密碼才能下載');
    }
    
    const fileUrl = document.createElement('span');
    fileUrl.className = 'file-url';
    const nameLabel = document.createElement('strong');
    nameLabel.textContent = fileName + ': ';
    const downloadLink = document.createElement('a');
    downloadLink.href = url;
    downloadLink.target = '_blank';
    downloadLink.rel = 'noopener noreferrer';
    downloadLink.textContent = url;
    fileUrl.append(nameLabel, downloadLink);
    
    const copyButton = document.createElement('button');
    copyButton.className = 'copy-button';
    copyButton.textContent = localized('Copy URL', '复制链接', '複製連結');
    copyButton.onclick = function() {
        copyToClipboard(url);
        copyButton.textContent = localized('Copied!', '已复制！', '已複製！');
        setTimeout(() => {
            copyButton.textContent = localized('Copy URL', '复制链接', '複製連結');
        }, 2000);
    };
    
    fileItem.appendChild(warningText);
    if (passwordWarning) {
        fileItem.appendChild(passwordWarning);
    }
    fileItem.appendChild(fileUrl);
    fileItem.appendChild(copyButton);
    fileList.appendChild(fileItem);
}

async function uploadSimpleFile(file, maxRetries = 3) {
    const uploadingMsg = localized(`Uploading ${file.name}...`, `正在上传 ${file.name}...`, `正在上傳 ${file.name}...`);
    showStatus(uploadingMsg, 'uploading');
    showProgress();
    
    let lastError;
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await uploadWithProgress(file, (progress) => {
                updateProgress(progress);
            });
            
            if (response.status === 200) {
                const responseUrl = response.responseText.trim();
                if (responseUrl.startsWith('http')) {
                    hideProgress();
                    // 根据是否设置了有效期显示不同的成功消息
                    const useExpiration = document.getElementById('useExpiration')?.checked;
                    let successMsg;
                    if (useExpiration) {
                        const setExpirationBtn = document.getElementById('setExpirationBtn');
                        const expirationSeconds = setExpirationBtn.getAttribute('data-expiration-seconds');
                        
                        if (expirationSeconds) {
                            // Convert seconds to human readable format
                            const seconds = parseInt(expirationSeconds);
                            let value = seconds;
                            let unit = 'seconds';
                            
                            if (seconds % 86400 === 0) {
                                value = seconds / 86400;
                                unit = 'days';
                            } else if (seconds % 3600 === 0) {
                                value = seconds / 3600;
                                unit = 'hours';
                            } else if (seconds % 60 === 0) {
                                value = seconds / 60;
                                unit = 'minutes';
                            }
                            
                            let expirationString = formatExpiration(value, unit);
                            
                            successMsg = localized(`Successfully uploaded ${file.name}! (Expiration: ${expirationString})`, `成功上传 ${file.name}！(有效期: ${expirationString})`, `${file.name} 上傳成功！（有效期限：${expirationString}）`);
                        } else {
                            successMsg = localized(`Successfully uploaded ${file.name}! (Default expiration: 1 hour)`, `成功上传 ${file.name}！(默认有效期: 1小时)`, `${file.name} 上傳成功！（預設有效期限：1 小時）`);
                        }
                    } else {
                        successMsg = localized(`Successfully uploaded ${file.name}! (One-time download)`, `成功上传 ${file.name}！(一次性下载)`, `${file.name} 上傳成功！（僅能下載一次）`);
                    }
                    showStatus(successMsg, 'success');
                    // 提取纯URL（去除警告信息）
                    const cleanUrl = responseUrl.split('\n')[0];
                    const usePassword = document.getElementById('usePassword')?.checked;
                    addFileToList(file.name, cleanUrl, usePassword);
                    uploadedFiles.push({ name: file.name, url: cleanUrl, passwordProtected: usePassword });
                    return;
                } else {
                    const errorMsg = localized('Upload completed but received unexpected response', '上传完成但收到意外响应', '上傳完成，但收到非預期的回應');
                    throw new Error(errorMsg);
                }
            } else if (response.status === 401) {
                // Handle password error specifically
                hideProgress();
                const passwordErrorMsg = localized('Password error, please check that the password you entered matches the PASSWORD environment variable configured on the server', '密码错误，请检查您输入的密码是否与服务器配置的PASSWORD环境变量相同', '密碼錯誤，請確認輸入的密碼與伺服器設定的 PASSWORD 環境變數相同');
                showStatus(passwordErrorMsg, 'error');
                return;
            } else {
                throw new Error(`Server returned status ${response.status}`);
            }
        } catch (error) {
            lastError = error;
            console.log(`Upload failed (attempt ${attempt}/${maxRetries}):`, error);
            
            if (attempt < maxRetries) {
                const delay = Math.pow(2, attempt - 1) * 1000;
                console.log(`Retrying in ${delay/1000} seconds...`);
                const retryMsg = localized(`Upload failed, retrying in ${delay/1000} seconds...`, `上传失败，${delay/1000} 秒后重试...`, `上傳失敗，${delay/1000} 秒後重試...`);
                showStatus(retryMsg, 'uploading');
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    
    hideProgress();
    const failedMsg = localized(`Failed to upload ${file.name} after ${maxRetries} attempts. Error: ${lastError.message}`, `上传 ${file.name} 失败，已重试 ${maxRetries} 次。错误：${lastError.message}`, `上傳 ${file.name} 失敗，已重試 ${maxRetries} 次。錯誤：${lastError.message}`);
    showStatus(failedMsg, 'error');
}

function uploadWithProgress(file, onProgress) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        
        // Upload progress
        xhr.upload.addEventListener('progress', function(e) {
            if (e.lengthComputable) {
                const percentComplete = (e.loaded / e.total) * 100;
                onProgress(percentComplete);
            }
        });

        // Upload complete
        xhr.addEventListener('load', function() {
            resolve({
                status: xhr.status,
                responseText: xhr.responseText
            });
        });

        // Upload error
        xhr.addEventListener('error', function() {
            reject(new Error('Network error occurred'));
        });
        
        // Check if short URL option is selected
        const useShortUrl = document.getElementById('useShortUrl')?.checked;
        const encodedFileName = encodeURIComponent(file.name);
        const uploadPath = useShortUrl ? `${UPLOAD_URL}/short/${encodedFileName}` : `${UPLOAD_URL}/${encodedFileName}`;
        
        // Check if password protection is enabled
        const usePassword = document.getElementById('usePassword')?.checked;
        const passwordInput = document.getElementById('passwordInput');
        
        // Check if expiration is set
        const useExpiration = document.getElementById('useExpiration')?.checked;
        
        // Make the request using PUT method to match curl -T behavior
        xhr.open('PUT', uploadPath);
        
        // Add Authorization header if password is provided
        if (usePassword && passwordInput.value) {
            xhr.setRequestHeader('Authorization', passwordInput.value);
        }
        
        // Add expiration header if expiration is set
        if (useExpiration) {
            const setExpirationBtn = document.getElementById('setExpirationBtn');
            let expirationSeconds = setExpirationBtn.getAttribute('data-expiration-seconds');
            
            // If no expiration time was explicitly set, use default (1 hour)
            if (!expirationSeconds) {
                // Default to 1 hour (3600 seconds)
                expirationSeconds = '3600';
            }
            
            xhr.setRequestHeader('X-Expiration-Seconds', expirationSeconds);
        }
        
        xhr.send(file);
    });
}

function copyToClipboard(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text);
    } else {
        // Fallback for older browsers
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
    }
}


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
    const job = { cancelled: false, userCancelled: false, requests: new Set() };
    activeMultipartUpload = job;
    const cancelButton = document.getElementById('cancelMultipartUpload');
    if (cancelButton) {
        cancelButton.style.display = 'inline-block';
        cancelButton.disabled = false;
        cancelButton.onclick = () => {
            job.cancelled = true;
            job.userCancelled = true;
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
        const cancelled = job.userCancelled;
        showStatus(cancelled
            ? localized('Upload cancelled.', '已取消上傳。', '已取消上傳。')
            : localized('Upload failed: ', '上傳失敗：', '上傳失敗：') + error.message,
        'error');
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
