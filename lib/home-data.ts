import { z } from "zod";
export const categoryIds = [
  "home",
  "ai",
  "design",
  "code",
  "discover",
] as const;
export type CategoryId = (typeof categoryIds)[number];
export const categoryNames: Record<CategoryId, string> = {
  home: "首页",
  ai: "AI",
  design: "设计",
  code: "编程",
  discover: "发现",
};
export const safeUrl = z.string().refine((v) => {
  try {
    return ["https:", "http:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}, "请输入有效的 http 或 https 网址");
export const bookmarkSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(40),
  url: safeUrl,
  icon: z.string(),
  category: z.enum(categoryIds),
  folder: z.string().nullable(),
});
export type Bookmark = z.infer<typeof bookmarkSchema>;
export const folderSchema = z.object({
  id: z.string(),
  name: z.string().min(1).max(20),
  category: z.enum(categoryIds),
});
export type Folder = z.infer<typeof folderSchema>;
export const settingsSchema = z.object({
  engine: z.enum(["baidu", "bing", "google"]),
  wallpaper: z.enum(["night-city", "mountain", "coast", "solid"]),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  overlay: z.number().min(0).max(75),
  theme: z.enum(["light", "dark"]),
  showTime: z.boolean(),
  showWidgets: z.boolean(),
  showQuote: z.boolean(),
});
export type Settings = z.infer<typeof settingsSchema>;
const todoSchema = z.object({
  id: z.string(),
  text: z.string().min(1).max(120),
  done: z.boolean(),
});
// Public schema is v2 (single shape). Legacy v1 blobs are upgraded by
// `migrateToV2` below using the internal `stateSchemaV1` so the rest of the
// app can rely on `data.folders` always being present.
const stateSchemaV1 = z.object({
  version: z.literal(1),
  bookmarks: z.array(bookmarkSchema),
  todos: z.array(todoSchema),
  note: z.string().max(100000),
  settings: settingsSchema,
  quoteIndex: z.number().int().min(0),
  lastModified: z.string().optional(),
});
export const stateSchema = z.object({
  version: z.literal(2),
  bookmarks: z.array(bookmarkSchema),
  folders: z.array(folderSchema),
  todos: z.array(todoSchema),
  note: z.string().max(100000),
  settings: settingsSchema,
  quoteIndex: z.number().int().min(0),
  lastModified: z.string().optional(),
});
export type HomeState = z.infer<typeof stateSchema>;
export const STORAGE_KEY = "hitab-personal:v1";
export const SYNC_BASE_URL_STORAGE_KEY = "hitab-sync:baseUrl";
export const SYNC_SESSION_STORAGE_KEY = "hitab-sync:lastLogin";
export const wallpapers = [
  { id: "night-city", name: "城市夜色", src: "/assets/night-city.jpg" },
  { id: "mountain", name: "山野之间", src: "/assets/mountain.jpg" },
  { id: "coast", name: "静谧海岸", src: "/assets/coast.jpg" },
] as const;
export const quotes = [
  { text: "未觉池塘春草梦，阶前梧叶已秋声。", author: "朱熹《偶成》" },
  { text: "行到水穷处，坐看云起时。", author: "王维《终南别业》" },
  { text: "且将新火试新茶，诗酒趁年华。", author: "苏轼《望江南》" },
  { text: "山重水复疑无路，柳暗花明又一村。", author: "陆游《游山西村》" },
  { text: "长风破浪会有时，直挂云帆济沧海。", author: "李白《行路难》" },
];
type Seed = [string, string, string];
const seeds: Record<CategoryId, Seed[]> = {
  home: [
    ["微博", "weibo.png", "https://weibo.com"],
    ["哔哩哔哩", "bilibili.png", "https://www.bilibili.com"],
    ["抖音", "douyin.png", "https://www.douyin.com"],
    ["BOSS直聘", "boss_hipc.png", "https://www.zhipin.com"],
    ["小红书", "xiaohongshu.png", "https://www.xiaohongshu.com"],
    ["携程", "ctrip.png", "https://www.ctrip.com"],
    ["爱淘宝", "aitaobao.png", "https://www.taobao.com"],
    ["京东", "jd.png", "https://www.jd.com"],
    ["天猫", "tmall.png", "https://www.tmall.com"],
    ["1688", "1688.png", "https://www.1688.com"],
    ["QQ邮箱", "qqmail_hipc.png", "https://mail.qq.com"],
    ["12306", "12306_hipc.png", "https://www.12306.cn"],
    ["唯品会", "vip.png", "https://www.vip.com"],
    ["夸克网盘", "quark.png", "https://pan.quark.cn"],
    ["知乎", "zhihu.png", "https://www.zhihu.com"],
  ],
  ai: [
    ["DeepSeek", "", "https://chat.deepseek.com"],
    ["豆包", "doubao.png", "https://www.doubao.com"],
    ["千问", "qianwen.png", "https://www.qianwen.com"],
    ["Kimi", "kimi.png", "https://www.kimi.com"],
    ["元宝", "", "https://yuanbao.tencent.com"],
    ["ChatGPT", "chatgpt.png", "https://chatgpt.com"],
    ["Gemini", "gemini.png", "https://gemini.google.com"],
    ["文心一言", "yiyan.png", "https://yiyan.baidu.com"],
    ["讯飞星火", "xinghuo_xfyun.png", "https://xinghuo.xfyun.cn"],
    ["秘塔写作猫", "xiezuocat.png", "https://xiezuocat.com"],
    ["即梦AI", "jimeng.png", "https://jimeng.jianying.com"],
  ],
  design: [
    ["花瓣", "huaban.png", "https://huaban.com"],
    ["站酷", "zcool.png", "https://www.zcool.com.cn"],
    ["UI中国", "ui.png", "https://www.ui.cn"],
    ["稿定设计", "gaoding.png", "https://www.gaoding.com"],
    ["图虫", "tuchong.png", "https://tuchong.com"],
    ["Iconfont", "iconfont.png", "https://www.iconfont.cn"],
    ["IconPark", "iconpark.png", "https://iconpark.oceanengine.com"],
    ["Figma", "figma.png", "https://www.figma.com"],
    ["千图网", "58pic.png", "https://www.58pic.com"],
    ["千库网", "588ku.png", "https://588ku.com"],
    ["摄图网", "699pic.png", "https://699pic.com"],
    ["站酷海洛", "hellorf.png", "https://www.hellorf.com"],
    ["Icons8", "icons8.png", "https://icons8.com"],
    ["字由", "hellofont.png", "https://www.hellofont.cn"],
    ["求字体", "qiuziti.png", "https://www.qiuziti.com"],
    ["墨刀", "modao.png", "https://modao.cc"],
  ],
  code: [
    ["谷歌", "google.png", "https://www.google.com"],
    ["GitHub", "github.png", "https://github.com"],
    ["Gitee", "gitee.png", "https://gitee.com"],
    ["Vite", "vitejs.png", "https://vite.dev"],
    ["Ant Design", "ant_design.png", "https://ant.design"],
    ["Arco Design", "arco_design.png", "https://arco.design"],
    ["React", "react_hipc.png", "https://react.dev"],
    ["Vue", "vue_hipc.png", "https://vuejs.org"],
    ["Element Plus", "element.png", "https://element-plus.org"],
    ["TypeScript", "typescriptlang.png", "https://www.typescriptlang.org"],
    ["Bootstrap", "bootstrap_hipc.png", "https://getbootstrap.com"],
    ["Electron", "electronjs.png", "https://www.electronjs.org"],
    ["Flutter", "flutter_hipc.png", "https://flutter.dev"],
    ["Python", "python_hipc.png", "https://www.python.org"],
    ["W3School", "w3school_hipc.png", "https://www.w3school.com.cn"],
    ["阿里云", "aliyun.png", "https://www.aliyun.com"],
    ["腾讯云", "cloudtencent.png", "https://cloud.tencent.com"],
  ],
  discover: [
    ["HiPC", "haipc_hipc.png", "https://hipc.cn"],
    ["鸿蒙系统", "harmonyos_hipc.png", "https://www.harmonyos.com"],
    ["小米", "mi.png", "https://www.mi.com"],
    ["IT之家", "ithome.png", "https://www.ithome.com"],
    ["YouTube", "googleyoutube.png", "https://www.youtube.com"],
    ["测速网", "cesuwang.png", "https://www.speedtest.cn"],
    ["在线工具", "tool.png", "https://tool.lu"],
    ["吾爱破解", "52pojie_hipc.png", "https://www.52pojie.cn"],
    ["微信网页版", "weixin_hipc.png", "https://wx.qq.com"],
  ],
};
export const initialState: HomeState = {
  version: 2,
  folders: [{ id: "entertainment", name: "娱乐", category: "home" }],
  bookmarks: categoryIds
    .flatMap((category) =>
      seeds[category].map(([name, icon, url], i) => ({
        id: `${category}-${i}`,
        name,
        icon,
        url,
        category,
        folder: null as string | null,
      })),
    )
    .concat(
      [
        ["爱奇艺", "iqiy_hipc.png", "https://www.iqiyi.com"],
        ["网易云音乐", "163music.png", "https://music.163.com"],
        ["腾讯视频", "tengxun_v_qq.png", "https://v.qq.com"],
        ["QQ音乐", "qqmusic.png", "https://y.qq.com"],
      ].map(([name, icon, url], i) => ({
        id: `ent-${i}`,
        name,
        icon,
        url,
        category: "home" as CategoryId,
        folder: "entertainment",
      })),
    ),
  todos: [
    { id: "todo-1", text: "喝一杯水", done: false },
    { id: "todo-2", text: "读几页喜欢的书", done: false },
    { id: "todo-3", text: "出去走走", done: false },
  ],
  note: "",
  settings: {
    engine: "baidu",
    wallpaper: "night-city",
    color: "#18324a",
    overlay: 30,
    theme: "light",
    showTime: false,
    showWidgets: true,
    showQuote: true,
  },
  quoteIndex: 0,
};

/**
 * Migrate a raw localStorage blob into a v2 {@link HomeState}.
 *
 * v2 introduced a top-level `folders: Folder[]` so users can create custom-named
 * bookmark groups (previously the only folder `entertainment` was hardcoded in
 * `app/page.tsx` and never persisted). When upgrading v1 data we seed the
 * entertainment folder *only if* a bookmark still references it, so users who
 * had already cleared it don't see it come back from the dead.
 */
export function migrateToV2(input: unknown):
  | { ok: true; state: HomeState }
  | { ok: false; error: string } {
  const v2 = stateSchema.safeParse(input);
  if (v2.success) return { ok: true, state: v2.data };
  const v1 = stateSchemaV1.safeParse(input);
  if (!v1.success) {
    // Surface whichever parse error was closer to the actual blob. v2 is tried
    // first so malformed v2 writes are reported as v2 errors, falling back to
    // v1 only for genuinely-older blobs.
    return { ok: false, error: v2.error.message };
  }
  const v = v1.data;
  const stillReferenced = v.bookmarks.some((b) => b.folder === "entertainment");
  return {
    ok: true,
    state: {
      version: 2,
      bookmarks: v.bookmarks,
      folders: stillReferenced
        ? [{ id: "entertainment", name: "娱乐", category: "home" as CategoryId }]
        : [],
      todos: v.todos,
      note: v.note,
      settings: v.settings,
      quoteIndex: v.quoteIndex,
      lastModified: v.lastModified,
    },
  };
}
export const homeSlots = [
  "weibo",
  "bilibili",
  "douyin",
  "boss",
  "red",
  "ctrip",
  "taobao",
  "jd",
  "tmall",
  "alibaba",
  "mail",
  "train",
  "vip",
  "quark",
  "zhihu",
];
export const hotSources = [
  {
    id: "weibo",
    name: "微博",
    url: "https://s.weibo.com/top/summary",
    items: [
      "用镜头记录秋日的美好",
      "在旅途中发现生活的另一面",
      "属于秋天的第一份小确幸",
      "把平凡的日子过成喜欢的样子",
    ],
  },
  {
    id: "baidu",
    name: "百度",
    url: "https://top.baidu.com/board",
    items: [
      "秋天最适合去哪里旅行",
      "一份简单好吃的家常菜菜单",
      "假期一起去看山与海",
      "普通人的生活也值得被记录",
    ],
  },
  {
    id: "toutiao",
    name: "今日头条",
    url: "https://www.toutiao.com",
    items: [
      "城市里的秋日散步路线",
      "把时间留给喜欢的事情",
      "那些让人心动的自然风光",
      "今天也要认真生活",
    ],
  },
  {
    id: "douyin",
    name: "抖音",
    url: "https://www.douyin.com/hot",
    items: [
      "日落是每天的浪漫",
      "一起记录生活碎片",
      "秋天的第一杯热咖啡",
      "镜头里的家乡有多美",
    ],
  },
  {
    id: "bilibili",
    name: "B站",
    url: "https://www.bilibili.com/v/popular/rank/all",
    items: [
      "用一首歌打开秋天",
      "在周末做一顿好吃的饭",
      "听见生活里的小美好",
      "一份温暖的秋日书单",
    ],
  },
  {
    id: "kuaishou",
    name: "快手",
    url: "https://www.kuaishou.com",
    items: [
      "发现身边的风景",
      "每一天都有新的故事",
      "晚饭的香气是家的味道",
      "把生活过成一首诗",
    ],
  },
  {
    id: "zhihu",
    name: "知乎",
    url: "https://www.zhihu.com/hot",
    items: [
      "如何建立自己的阅读习惯",
      "你最喜欢秋天的哪个瞬间",
      "哪些小事让生活更有幸福感",
      "周末有什么值得尝试的爱好",
    ],
  },
  {
    id: "red",
    name: "小红书",
    url: "https://www.xiaohongshu.com/explore",
    items: [
      "收藏这份秋日出游清单",
      "周末去公园晒晒太阳",
      "我的书桌布置分享",
      "在城市里寻找秋天",
    ],
  },
];

export const iconColors: Record<string, string> = {
  "weibo.png": "rgba(100,100,100,0.6)",
  "bilibili.png": "rgba(100,100,100,0.6)",
  "douyin.png": "#170b1a",
  "boss_hipc.png": "rgba(100,100,100,0.6)",
  "xiaohongshu.png": "#ff2938",
  "ctrip.png": "#1684ef",
  "aitaobao.png": "#e55145",
  "jd.png": "#db1616",
  "tmall.png": "#ff002b",
  "1688.png": "#ff5000",
  "qqmail_hipc.png": "#0275b7",
  "12306_hipc.png": "#ff3510",
  "iqiy_hipc.png": "#00cc4c",
  "163music.png": "#d81e06",
  "tengxun_v_qq.png": "#ffffff",
  "qqmusic.png": "#ffffff",
  "youku.png": "#ffffff",
  "smzdm_hipc.png": "#f5363f",
  "vip.png": "#e5008d",
  "quark.png": "#ffffff",
  "zhihu.png": "#008fff",
  "HiTab.png": "#ffffff",
  "deepseek.png": "#fbfdff",
  "doubao.png": "#ffffff",
  "kimi.png": "#000000",
  "yuanbao.png": "#ffffff",
  "qclaw.png": "#ffffff",
  "openclaw.png": "#ffffff",
  "chatgpt.png": "#000000",
  "gemini.png": "#ffffff",
  "yiyan.png": "#ffffff",
  "chatbaidu.png": "#ffffff",
  "xiezuocat.png": "rgba(100,100,100,0.6)",
  "jimeng.png": "#172B4D",
  "xiaoyi.png": "#ffffff",
  "1.png": "#ffffff",
  "huaban.png": "#f47e8a",
  "zcool.png": "#ffe200",
  "store_eqxiu.png": "#1593ff",
  "image_baidu.png": "#4176f0",
  "photo.png": "#ffffff",
  "meitu.png": "#fd4965",
  "xiumi.png": "#ffffff",
  "ui.png": "#398eca",
  "gaoding.png": "#2054f4",
  "tuchong.png": "#ff328c",
  "iconfont.png": "#ff0000",
  "iconpark.png": "#ffffff",
  "figma.png": "#ffffff",
  "58pic.png": "#00be6d",
  "588ku.png": "#17a1ff",
  "699pic.png": "#31a5f5",
  "ooopic.png": "#11aa99",
  "hellorf.png": "#ffffff",
  "icons8.png": "#32c24d",
  "zhisheji.png": "#0084ff",
  "docer.png": "#eb4e2f",
  "hellofont.png": "#ffffff",
  "qiuziti.png": "#04d3b0",
  "bigbigwork.png": "#ff4d4d",
  "pixiv.png": "rgba(0, 150, 250)",
  "modao.png": "#eb5548",
  "7k7k.png": "#ff6700",
  "4399.png": "#379904",
  "epic.png": "#ffffff",
  "google.png": "rgba(100,100,100,0.6)",
  "github.png": "rgba(100,100,100,0.6)",
  "gitee.png": "#c81d23",
  "vitejs.png": "#ffffff",
  "harmonyos_hipc.png": "rgba(100,100,100,0.6)",
  "mi.png": "#ff6700",
  "ant_design.png": "#ffffff",
  "arco_design.png": "#ffffff",
  "csdn.png": "#ffffff",
  "juejin.png": "rgba(100,100,100,0.6)",
  "cnblogs.png": "rgba(100,100,100,0.6)",
  "react_hipc.png": "rgba(100,100,100,0.6)",
  "vue_hipc.png": "rgba(100,100,100,0.6)",
  "element.png": "#409EFF",
  "ant_design_vue.png": "#ffffff",
  "uniapp_hipc.png": "rgba(100,100,100,0.6)",
  "typescriptlang.png": "#3178C6",
  "bootstrap_hipc.png": "rgba(100,100,100,0.6)",
  "electronjs.png": "#ffffff",
  "flutter_hipc.png": "rgba(100,100,100,0.6)",
  "angular_hipc.png": "rgba(100,100,100,0.6)",
  "reduxjs.png": "#764ABC",
  "python_hipc.png": "rgba(100,100,100,0.6)",
  "php_hipc.png": "rgba(100,100,100,0.6)",
  "w3school_hipc.png": "rgba(100,100,100,0.6)",
  "aliyun.png": "#fe6a00",
  "cloudtencent.png": "#ffffff",
  "huawei.png": "#d71517",
  "volcengine.png": "#ffffff",
  "bt.png": "#ffffff",
  "clawhub.png": "#ffffff",
  "iwin10_hipc.png": "rgba(100,100,100,0.6)",
  "newxittong_iwin7_hipc.png": "rgba(100,100,100,0.6)",
  "xitongku.png": "#01ca64",
  "himaauto.png": "#ffffff",
  "tesla_hipc.png": "rgba(100,100,100,0.6)",
  "aito_auto.png": "rgba(100,100,100,0.6)",
  "lixiang_hipc.png": "rgba(100,100,100,0.6)",
  "weilai_hipc.png": "rgba(100,100,100,0.6)",
  "xiaopeng_hipc.png": "rgba(100,100,100,0.6)",
  "xiaomiev.png": "#ff6700",
  "haipc_hipc.png": "rgba(100,100,100,0.6)",
  "ithome.png": "#d12222",
  "googleyoutube.png": "rgba(100,100,100,0.6)",
  "cesuwang.png": "rgba(100,100,100,0.6)",
  "tool.png": "rgba(100,100,100,0.6)",
  "52pojie_hipc.png": "rgba(100,100,100,0.6)",
  "weixin_hipc.png": "rgba(100,100,100,0.6)",
};
