# HiTab · 我的起始页

参考 [HiTab](https://www.haipc.cn) 的独立复刻版，以 React、TypeScript 和 Vinext 实现。支持静态导出部署到私有 Sites 或阿里云 ECS。

阿里云版本域名为 `home.douwuyou.cn`，采用 HTTPS 与服务器端登录保护。配置、更新和验收方法见 [ECS 部署说明](deploy/ecs/README.md)。源码仓库为 [emmaleoo8646/homepage](https://github.com/emmaleoo8646/homepage)。

## 本地运行

需要 Node.js 22.13 或更高版本。

```sh
npm ci
npm run dev
```

默认预览地址为 http://127.0.0.1:5173。

```sh
npx tsc --noEmit
npm run build
```

静态输出位于 `dist/client/`，部署身份与静态目录位于 `.openai/hosting.json`。

## 功能

- 五个网址分类，百度／必应／Google 搜索，以及 `/` 搜索快捷键。
- 网址新增、编辑、删除与撤销；新收藏和已有的文字图标收藏自动加载网站图标；拖拽排序；菜单支持向前／向后移动，适用于手机和键盘。
- 娱乐文件夹，可把网址移入／移出文件夹。
- 待办创建、完成、筛选、删除与撤销，本地笔记自动保存。
- 月历与农历日期、一言切换和复制。
- 壁纸与纯色背景、蒙层强度、浅色／深色外观、时间与组件开关。

使用版本为 1 的 `hitab-personal:v1` 浏览器存储。数据仅属于当前网站域名和浏览器；清除网站数据后会恢复默认内容，不跨设备同步。存储不可用或保存内容无法读取时，显示提示并保留当前会话的操作能力。

天气和热搜是明确标识的示例内容，并有真实来源链接。未建设应用内账号、云端同步或文件上传；文件快传入口说明限制并链接原站。Sites 版本由托管层控制私有访问；ECS 版本由 Nginx 强制验证登录，不在前端模拟认证。

## 素材

默认壁纸：`https://wallpaper.hipc.cn/background2024.jpg/backdrop`。
备用壁纸：`https://wallpaper.hipc.cn/macos/18.jpg/backdrop`、`https://wallpaper.hipc.cn/macos/19.jpg/backdrop`。
内置网址图标：`https://home.hipcapi.com/home_icon/bookmarks/`。内置资源已保存到 `public/assets/`。自定义收藏依次尝试网站根目录的 `favicon.ico`、`favicon.svg`、`apple-touch-icon.png`，再尝试 DuckDuckGo 的域名图标缓存；每个来源最多等待 5 秒，全部失败后使用文字标识。缓存服务仅接收域名，图标请求不发送本站 Referer。修改收藏网址后重新加载网站图标，无需迁移已有浏览器数据。壁纸加载失败使用纯色背景。

## 浏览器能力

支持浏览器 WebMCP 时注册读取页面、添加网址、添加待办与切换分类工具，与界面共用数据操作。不支持时正常使用页面；当前环境未提供可验证的 WebMCP 会话，因此这部分验证未完成。
