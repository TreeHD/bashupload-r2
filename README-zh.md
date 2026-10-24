# BashUpload-R2

[English](README.md) | 中文

基于 Cloudflare Workers 和 Cloudflare R2 对象存储构建，适合命令行和浏览器的简单文件上传服务。

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/DullJZ/bashupload-r2)

直接使用：[bashupload.app](https://bashupload.app)

感谢 [bashupload.com](https://bashupload.com) 及其作者 [@mrcrypster](https://github.com/mrcrypster) 提供的灵感。

## 快速开始

```sh
# 上传文件并返回普通链接
curl bashupload.app -T file.txt

# 上传文本内容（保存为 .txt 文件）
curl bashupload.app -d "你的长文本内容"

# 上传并返回短链接
curl bashupload.app/short -T file.txt

# 上传并设置有效期（86400秒=24小时，允许多次下载）
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt
```

使用命令行别名快速设置

```sh
alias bashupload='curl bashupload.app -T'
alias bashuploadtext='curl bashupload.app -d'
alias bashuploadshort='curl bashupload.app/short -T'
alias bashuploadexpire='curl -H "X-Expiration-Seconds: 3600" bashupload.app -T'
bashupload file.txt            # 返回普通链接
bashuploadtext "你的文本内容"   # 上传文本内容
bashuploadshort file.txt       # 返回短链接
bashuploadexpire file.txt      # 返回1小时有效期链接
```

要使别名永久生效，请将其添加到你的 shell 配置文件中。

```sh
echo "alias bashupload='curl bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadtext='curl bashupload.app -d'" >> ~/.bashrc
echo "alias bashuploadshort='curl bashupload.app/short -T'" >> ~/.bashrc
echo "alias bashuploadexpire='curl -H \"X-Expiration-Seconds: 3600\" bashupload.app -T'" >> ~/.bashrc
source ~/.bashrc
```


### 瀏覽器大檔上傳（90 MiB 分段）

網頁上傳超過 **90 MiB（94,371,840 bytes）** 的檔案時，會自動切換為 Cloudflare R2 Multipart Upload。前端使用 `File.slice()` 分段、最多三段並行、失敗分段最多重試三次，並提供「取消上傳」按鈕。最後 R2 會合併成**一個完整物件**，維持原本的下載連結格式、一次性下載、到期自動刪除與可選短網址。

每個分段請求低於 Cloudflare Free / Pro 的 **100 MB** 上限；但**整個檔案**仍會受到 `MAX_UPLOAD_SIZE` 限制，預設 **5 GiB**。若要上傳更大的檔案，請調整 Worker 的設定，並留意公開上傳服務的儲存費用及濫用風險。

Worker 新增同網域的 Multipart API：`POST /api/multipart/init`、`PUT /api/multipart/part`、`POST /api/multipart/complete`、`DELETE /api/multipart/abort`。如有設定 `PASSWORD`，以上 API 也會要求密碼。Worker 透過 R2 存放不可猜測的上傳工作階段、檢查每段的位元組數，並以串流方式送到 R2，不會在 Worker 記憶體中合併整個檔案。

未完成的工作階段在 **24 小時**後由現有定時清理程序中止（`NO_CLEANUP=false`）；R2 本身也會在七天後中止未完成的 multipart upload。**目前重新整理頁面後需重新上傳**，還不支援跨頁面恢復。

### 預設上傳保留時間

可透過 Worker 環境變數（或 `wrangler.toml`）的 `DEFAULT_EXPIRATION_SECONDS` 調整**新上傳檔案**的預設保留秒數。預設值為 `3600`（1 小時），**期限內可重複下載**，不是下載一次就刪除。有效值介於 `0` 與 `MAX_AGE_FOR_MULTIDOWNLOAD` 之間。

| 設定值 | 行為 |
| --- | --- |
| `3600` | 預設保留 1 小時，期間可重複下載 |
| `86400` | 預設保留 24 小時，期間可重複下載（上限至少需 86400） |
| `0` | 恢復舊版預設一次性下載 |

網頁的「僅能下載一次」勾選框可明確指定首次下載後刪除；「自訂有效期限」則可覆蓋伺服器預設值。如果都不勾選，就使用環境變數的預設保留時間。直接使用 `curl -T`、`curl -d` 而不帶相關 Header 也會遵循預設；需要一次性下載時加上 `-H "X-One-Time-Download: true"`，需要自訂期限時則加上 `-H "X-Expiration-Seconds: 7200"`。

**一般上傳、文字上傳與 R2 Multipart 分段上傳都適用**。`MAX_AGE` 仍負責沒有過期時間 metadata 的舊物件／一次性上傳排程清理；新上傳的多次下載檔案會優先使用其過期時間。修改環境變數**不會追溯改變 R2 裡現有檔案的到期時間**，修改後需更新 Worker 部署。

## 浏览器上传

网页界面支持**英语、简体中文（zh-CN）和繁体中文（zh-TW）**，会自动识别浏览器语言；也可以手动切换并记住您的选择。


- 拖拽文件或点击选择文件
- 设置文件的有效期
- 直接下载链接
- 无需注册

## 特性

- 简单的命令行接口
- 快速文本分享
- 浏览器拖拽上传
- 无需注册
- 直接下载链接
- 隐私保护：文件在下载后自动删除
- 安全的臨時檔案儲存，預設在有效期限內可重複下載
- 支持自定义有效期：可设置文件有效期，在指定时间内允许多次下载
- 支持最大 5GB 的文件（自部署可调整）
- 支持自部署设置密码

**隱私注意：** 預設依 `DEFAULT_EXPIRATION_SECONDS` 的設定保留檔案（未設定時為 1 小時），期限內可重複下載；過期後會依排程自動刪除。如需首次下載後就刪除，請使用一次性下載選項。


## 自部署到Cloudflare

点击上方的 "Deploy to Cloudflare" 按钮，修改配置。

其中，`MAX_UPLOAD_SIZE`单位为字节（默认为 5GB），`MAX_AGE`单位为秒（默认为 1小时），可以根据需要进行调整。

`MAX_AGE_FOR_MULTIDOWNLOAD` 是允许多次下载的最大有效期时间，单位为秒（默认值是86400，即24小时）。用户可以设置不超过此限制的自定义有效期。

`SHORT_URL_SERVICE` 是短链接服务的 API 端点（默认为 `https://suosuo.de/short`），如果需要，可以将其更改为您自己的短链接服务。仅支持 [MyUrls](https://github.com/CareyWang/MyUrls)。

`PASSWORD` 环境变量为上传、下载必须提供的密码。如果不需要密码保护，可以将其留空。

编译部署最后一步可能会出现部署失败的错误，原因是默认使用了配置文件中的 bashupload.app 作为域名。事实上项目已经部署成功，在Worker项目设置中进行域名绑定即可。

## 高级功能

### 自定义有效期

通过使用 `X-Expiration-Seconds` 头部，您可以为上传的文件设置自定义有效期。这允许文件在过期前被多次下载，过期后文件将自动删除。

示例：
```sh
# 设置1小时有效期（文件可多次下载1小时）
curl -H "X-Expiration-Seconds: 3600" bashupload.app -T file.txt

# 设置24小时有效期
curl -H "X-Expiration-Seconds: 86400" bashupload.app -T file.txt

# 设置7天有效期
curl -H "X-Expiration-Seconds: 604800" bashupload.app -T file.txt
```

**重要说明：**
- 未明確設定有效期限時，使用伺服器的 `DEFAULT_EXPIRATION_SECONDS`；如需一次性下載請明確指定
- 设置有效期后，文件在有效期内可多次下载
- 最大允许的有效期由 `MAX_AGE_FOR_MULTIDOWNLOAD` 控制（默认：24小时）
- 浏览器上传也通过UI支持设置有效期

### 快速文本分享

您可以快速分享长文本片段、代码、日志或任何文本内容，无需先创建文件。只需使用 `curl -d` 直接上传文本，它将自动保存为 `.txt` 文件。

示例：
```sh
# 分享快速文本片段
curl bashupload.app -d "这是我遇到的错误信息..."

# 分享代码片段
curl bashupload.app -d "$(cat script.sh)"

# 分享命令输出
curl bashupload.app -d "$(ls -la)"

# 设置有效期以便多次查看
curl -H "X-Expiration-Seconds: 3600" bashupload.app -d "今天的会议记录..."

# 结合短链接方便分享
curl bashupload.app/short -d "你的文本内容"
```

### 密码保护

要启用密码保护，请在 Cloudflare Worker 设置中设置 `PASSWORD` 环境变量。当设置 PASSWORD 后，上传和下载都需要在 Authorization 头中提供密码。

使用 curl 的示例：
```sh
# 带密码上传
curl -H "Authorization: yourpassword" bashupload.app -T file.txt

# 带密码下载
curl -H "Authorization: yourpassword" https://bashupload.app/yourfile.txt
```

设置含密码的alias别名：
```sh
echo "alias bashupload='curl -H \"Authorization: yourpassword\" bashupload.app -T'" >> ~/.bashrc
echo "alias bashuploadshort='curl -H \"Authorization: yourpassword\" bashupload.app/short -T'" >> ~/.bashrc
source ~/.bashrc
```
