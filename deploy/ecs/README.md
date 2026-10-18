# ECS 部署

目标域名为 `home.douwuyou.cn`。站点文件位于 ECS 的 `/opt/homepage/`，静态文件由独立的 `homepage-web` 容器提供；现有 Nginx 入口仅新增 `homepage.conf`。复用 `family-diary_edge` 网络、证书目录和续期服务。

站点对外提供 HTTPS 静态页面，任何浏览器都可直接打开 `/`，无需账号或密码。`/healthz` 只返回容器健康状态。页面个人数据继续保存在当前浏览器，不上传到 ECS。可选的跨设备同步入口位于「设置 → 数据同步」，使用与 HTTP Basic 无关的 Fastify cookie 会话。

## 部署代码

先提交源码，再执行：

```sh
bash deploy/ecs/deploy.sh alog-prod
```

脚本执行类型检查和构建，将 `dist/client` 上传为独立版本，切换当前版本并重建本站容器。历史版本和配置备份保留在服务器。

本部署不再开启 HTTP Basic 认证；`create-login.mjs` 仍保留在仓库中，作为未来重新启用 Basic 时使用的草稿脚本，运行时按需生成 `.env.ecs.login.json`（本地权限 600）与 `.env.ecs.htpasswd`，且对已存在的文件保持幂等（不覆盖、不报错）。这些文件由 `.gitignore` 的 `.env*` 规则忽略，不应提交、截图或复制到公开日志。如需恢复 Basic 认证：先在本机运行 `node deploy/ecs/create-login.mjs`，再恢复 `deploy.sh` 中对应的 SCP、`install.sh` / `compose.yaml` / `nginx.conf` 中相关行。

## DNS 与 HTTPS

在阿里云 DNS 为 `douwuyou.cn` 添加默认线路 A 记录：主机记录 `home`，值为 ECS 公网 IPv4，TTL 为 600 秒。配置证书前，必须确认权威 DNS 已解析到目标服务器。

服务器上复用已注册的 Certbot 账户申请本站证书：

```sh
docker run --rm \
  -v family-diary_certbot_config:/etc/letsencrypt \
  -v family-diary_certbot_webroot:/var/www/certbot \
  certbot/certbot:v5.5.0 certonly --non-interactive --webroot \
  --webroot-path /var/www/certbot --cert-name home.douwuyou.cn \
  -d home.douwuyou.cn --keep-until-expiring
```

证书签发后再次部署即可启用 HTTPS。已有定时续期任务应检查为全部证书执行 `certbot renew`，并在成功后重新加载 Nginx。签发前 HTTP 仅提供 ACME 验证和 HTTPS 重定向，不提供页面或明文密码输入。

本地验收（使用正常 DNS 或显式目标 IP，均保留证书验证）：

```sh
node deploy/ecs/verify.mjs
node deploy/ecs/verify.mjs <ECS公网IPv4>
```

验收覆盖 HTTPS 有效性、HTTP 跳转、匿名访问页面与资源，以及隐藏敏感文件路径。`verify-sync.mjs` 覆盖注册 / 登录 / 状态读写 / 冲突流程。

## 回退

将 `/opt/homepage/current` 的符号链接切换到 `/opt/homepage/releases/` 下的上一版本，并执行 `docker compose -f /opt/homepage/compose.yaml up -d --force-recreate --no-deps web sync`。变更代理配置前先保存备份，执行 `docker exec family-diary-nginx-1 nginx -t` 成功后再 reload。

如果某一版同步服务出现严重问题并且需要彻底停用 sync：

```sh
docker compose -f /opt/homepage/compose.yaml stop sync
docker rm -f homepage-sync
sed -i '/HOMEPAGE-SYNC-ROUTES BEGIN/,/HOMEPAGE-SYNC-ROUTES END/d' /etc/family-diary/nginx-extra/homepage.conf
docker exec family-diary-nginx-1 nginx -t && docker exec family-diary-nginx-1 nginx -s reload
```

静态站点不受影响；同步面板再次启用前需要重新部署包含正常 sync 镜像的版本。

## 数据同步

`homepage-sync` 容器与 `homepage-web` 共享 `family-diary_edge` 网络，提供 `/api/sync/*` 端点（注册、登录、状态读 / 写）。同步请求经网关直接代理到 `homepage-sync:3000`；`/` 不再触发 HTTP Basic。Fastify 的 401 由 cookie 会话缺失导致，与 nginx Basic 无关。

会话密钥由 `install.sh` 首次运行时生成，保存在 `/opt/homepage/secrets/sync.env`（权限 600）。后续部署若发现格式不符会立即终止以避免覆盖。SQLite 数据库位于 `/opt/homepage/sync/data/sync.sqlite`，随其它发行版本一并备份。

部署后可用两个脚本验证：

```sh
node deploy/ecs/verify.mjs              # 站点 + sync 健康检查
node deploy/ecs/verify-sync.mjs         # 完整注册 / 登录 / 状态读写 / 冲突流程
```

`verify.mjs` 同时断言 `/api/sync/whoami` 不带 `WWW-Authenticate` 头（同步会话是基于 Fastify cookie 的，与 HTTP Basic 解耦）。

客户端面板入口：站点「设置」面板中的「数据同步」标签。跨设备编辑网址 / 待办时，本地停止输入约 2 秒后自动推送；遇到云端版本更新会暂停推送并提示选择保留哪份。
