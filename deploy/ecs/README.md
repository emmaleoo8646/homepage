# ECS 部署

目标域名为 `home.douwuyou.cn`。站点文件位于 ECS 的 `/opt/homepage/`，静态文件由独立的 `homepage-web` 容器提供；现有 Nginx 入口仅新增 `homepage.conf`。复用 `family-diary_edge` 网络、证书目录和续期服务。

网站使用 HTTPS 和 Nginx HTTP Basic 登录保护。首次访问时浏览器弹出用户名与密码输入框；所有页面、脚本、图标与壁纸均需要验证。`/healthz` 只返回容器健康状态。页面个人数据继续保存在当前浏览器，不上传到 ECS。

## 部署代码

先提交源码，再执行：

```sh
bash deploy/ecs/deploy.sh alog-prod
```

脚本执行类型检查和构建，将 `dist/client` 上传为独立版本，切换当前版本并重建本站容器。历史版本和配置备份保留在服务器。

首次生成的登录名为 `home`；随机密码保存在本地 `.env.ecs.login.json`，文件权限为 600。密码哈希保存在 `.env.ecs.htpasswd`，上传后位于服务器 `/opt/homepage/secrets/home.htpasswd`。这些文件被 Git 忽略，不应提交、截图或复制到公开日志。后续部署保留原有密码；本地与服务器哈希不一致时停止部署。

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

验收覆盖 HTTPS 有效性、HTTP 跳转、匿名与错误密码拒绝、已登录页面与资源，以及隐藏敏感文件路径。

## 回退

将 `/opt/homepage/current` 的符号链接切换到 `/opt/homepage/releases/` 下的上一版本，并执行 `docker compose -f /opt/homepage/compose.yaml up -d --force-recreate --no-deps web`。变更代理配置前先保存备份，执行 `docker exec family-diary-nginx-1 nginx -t` 成功后再 reload。
