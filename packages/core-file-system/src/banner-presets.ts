import type { PageBanner, PageBannerKind } from './page-banner.ts'

export const BANNER_STYLE_IDS = ['jp', 'us', 'eu', 'cn'] as const
export type BannerStyleId = (typeof BANNER_STYLE_IDS)[number]

export const BANNER_STYLE_LABEL: Record<BannerStyleId, string> = {
  jp: '日式',
  us: '美式',
  eu: '欧式',
  cn: '中式',
}

export type BannerPreset = {
  id: string
  kind: PageBannerKind
  style: BannerStyleId
  title: string
  note: string
  html: string
}

const box = (css: string, inner: string) =>
  `<div style="box-sizing:border-box;height:100%;width:100%;overflow:hidden;position:relative;${css}">${inner}</div>`

const copy = (kicker: string, name: string, thought: string, extra = '') =>
  `<div style="position:relative;z-index:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;padding:26px 34px 22px;${extra}"><div style="font-size:10px;font-weight:700;letter-spacing:.34em;opacity:.7">${kicker}</div><div style="margin-top:7px;font-size:28px;font-weight:800;letter-spacing:.04em;line-height:1.08">${name}</div><div style="max-width:36rem;margin-top:9px;font-size:13px;font-weight:500;line-height:1.55;opacity:.9">${thought}</div></div>`

function html(
  id: string,
  style: BannerStyleId,
  title: string,
  note: string,
  css: string,
  inner: string,
): BannerPreset {
  return { id, kind: 'html', style, title, note, html: box(css, inner) }
}

function live(id: string, style: BannerStyleId, title: string, note: string, source: string): BannerPreset {
  return { id, kind: 'htmlframe', style, title, note, html: source }
}

export const BANNER_PRESETS: BannerPreset[] = [
  html(
    'jp-rimpa',
    'jp',
    '琳派',
    '金银地、没骨与非对称。光琳之后，平面把花卉当成纹样，把空当成水。',
    'background:#1a140c;color:#f4e6c4',
    `<div style="position:absolute;right:-4%;bottom:-18%;width:42%;height:90%;background:radial-gradient(circle at 40% 30%,#c4a24a 0 18%,transparent 19%),radial-gradient(circle at 62% 48%,#2f5a8a 0 22%,transparent 23%),radial-gradient(circle at 48% 62%,#c4a24a 0 14%,transparent 15%);opacity:.95"></div>${copy('RIMPA · 尾形光琳', '琳派', '金银地、没骨与非对称。光琳之后，平面把花卉当成纹样，把空当成水。')}`,
  ),
  html(
    'jp-ukiyo',
    'jp',
    '浮世绘',
    '平涂、墨线、大色面。画面是舞台，不是透视窗口。',
    'background:#8c1c16;color:#f6ead0',
    `<div style="position:absolute;inset:18px 22px;border:2px solid #1a120e"></div><div style="position:absolute;top:18px;right:22px;width:88px;height:calc(100% - 36px);background:#1a120e"></div>${copy('UKIYO-E', '浮世绘', '平涂、墨线、大色面。画面是舞台，不是透视窗口。', 'color:#f6ead0')}`,
  ),
  html(
    'jp-seigaiha',
    'jp',
    '青海波',
    '同一弧线无穷反复。秩序来自纹样，平静来自重复。',
    'background:#12303a;color:#d7efe8;background-image:radial-gradient(circle at 50% 120%,transparent 22px,#1e4a58 23px 25px,transparent 26px);background-size:48px 28px',
    copy('SEIGAIHA', '青海波', '同一弧线无穷反复。秩序来自纹样，平静来自重复。'),
  ),
  html(
    'jp-mingei',
    'jp',
    '民艺',
    '柳宗悦：无名工匠的用之美。手感重于签名，朴素重于装饰。',
    'background:#cbb79a;color:#2a2218',
    `<div style="position:absolute;left:0;top:0;bottom:0;width:18px;background:#6a3a28"></div>${copy('MINGEI · 柳宗悦', '民艺', '无名工匠的用之美。手感重于签名，朴素重于装饰。')}`,
  ),
  html(
    'jp-kamekura',
    'jp',
    '龟仓红日',
    '1964：把国旗收成一个圆。现代主义最硬的一刀，也是最日本的一刀。',
    'background:#111;color:#f4f0ea',
    `<div style="position:absolute;right:12%;top:18%;width:120px;height:120px;border-radius:50%;background:#c4122e"></div>${copy('KAMEKURA · 1964', '红日', '把国旗收成一个圆。现代主义最硬的一刀，也是最日本的一刀。')}`,
  ),
  html(
    'jp-ikko',
    'jp',
    '田中一光',
    '能乐脸谱切成色块。传统不是临摹，是几何以后的再认。',
    'background:#f3efe4;color:#171717;display:grid;grid-template-columns:1.6fr 1fr 1fr;grid-template-rows:1fr 1fr',
    `<div style="background:#171717"></div><div style="background:#c43c1c"></div><div style="background:#e8c84a"></div><div style="grid-column:1;background:#f3efe4;padding:18px 22px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em;font-weight:700">IKKO TANAKA</div><div style="margin-top:6px;font-size:26px;font-weight:800">色面能乐</div><div style="margin-top:8px;font-size:12px;line-height:1.5;max-width:22rem">能乐脸谱切成色块。传统不是临摹，是几何以后的再认。</div></div><div style="background:#2a5a9e"></div><div style="background:#171717"></div>`,
  ),
  html(
    'jp-sugiura',
    'jp',
    '杉浦康平',
    '《银花》式密铺：亚洲书籍把信息当成曼荼罗，阅读是进入结构。',
    'background:#16120e;color:#f0d9b0;background-image:repeating-conic-gradient(from 0deg at 78% 50%,#2a1c14 0 8deg,#16120e 8deg 16deg)',
    copy('SUGIURA · 银花', '曼荼罗编辑', '亚洲书籍把信息当成曼荼罗，阅读是进入结构。'),
  ),
  html(
    'jp-yokoo',
    'jp',
    '横尾忠则',
    '浮世绘撞上波普。拼贴、荧光、剧场：现代不是干净，是冲突。',
    'background:#2a0830;color:#ffe48a',
    `<div style="position:absolute;inset:0;background:repeating-linear-gradient(45deg,#c4126a 0 16px,#2a0830 16px 32px,#1c7cff 32px 36px);opacity:.55"></div>${copy('YOKOO', '横尾', '浮世绘撞上波普。拼贴、荧光、剧场：现代不是干净，是冲突。')}`,
  ),
  html(
    'jp-hara',
    'jp',
    '白',
    '原研哉《白》：空不是没有，是感受力被打开以后的场。',
    'background:#f6f4ef;color:#2a2a28',
    copy('HARA · WHITE', '白', '空不是没有，是感受力被打开以后的场。', 'padding:40px 48px'),
  ),
  html(
    'jp-tate',
    'jp',
    '和本',
    '纵组、界线、版心。书写方向本身就是世界观。',
    'background:#efe6d4;color:#1c1610;writing-mode:vertical-rl',
    `<div style="height:100%;padding:20px 28px;border-left:1px solid #c9b89a;letter-spacing:.18em;font:700 22px/1.7 'Songti SC',serif">和本<div style="margin-top:12px;font-size:12px;font-weight:500;letter-spacing:.12em">纵组、界线、版心。书写方向本身就是世界观。</div></div>`,
  ),

  html(
    'us-rand',
    'us',
    'Paul Rand',
    'Thoughts on Design：观念先于装饰。标志是一个想法，被画成最简的形。',
    'background:#111;color:#f4f1ea',
    `<div style="position:absolute;left:8%;top:22%;width:90px;height:90px;background:#e23b2a"></div>${copy('THOUGHTS ON DESIGN', 'Paul Rand', '观念先于装饰。标志是一个想法，被画成最简的形。')}`,
  ),
  html(
    'us-bass',
    'us',
    'Saul Bass',
    '电影海报的一刀切。象征物被剪到只剩力量，标题成为剪影。',
    'background:#0e0e0e;color:#f2f0ea',
    `<div style="position:absolute;left:0;top:0;width:38%;height:100%;background:#c4122e;clip-path:polygon(0 0,100% 0,62% 100%,0 100%)"></div>${copy('SAUL BASS', '一刀', '象征物被剪到只剩力量，标题成为剪影。')}`,
  ),
  html(
    'us-lubalin',
    'us',
    'Lubalin',
    '字母拥抱字母。Herb Lubalin 让刊头成为雕塑，亲密替代间距。',
    'background:#f3efe6;color:#111',
    `<div style="position:absolute;right:6%;top:10%;font:900 120px/0.8 Helvetica,Arial,sans-serif;letter-spacing:-.12em;opacity:.12">AV</div>${copy('AVANT GARDE', 'Lubalin', '字母拥抱字母。刊头成为雕塑，亲密替代间距。')}`,
  ),
  html(
    'us-vignelli',
    'us',
    'Unigrid',
    'Vignelli：信息必须可被网格收留。美国国家公园地图的冷静，是对混乱的礼貌。',
    'background:#f2efe8;color:#111;background-image:linear-gradient(#c8c4ba 1px,transparent 1px),linear-gradient(90deg,#c8c4ba 1px,transparent 1px);background-size:40px 40px',
    copy('VIGNELLI · UNIGRID', '网格即国家', '信息必须可被网格收留。地图的冷静，是对混乱的礼貌。'),
  ),
  html(
    'us-scher',
    'us',
    'Public Theater',
    'Paula Scher：字体铺满城市。字不是说明，是街道上的噪音与节奏。',
    'background:#d21c12;color:#111',
    `<div style="position:absolute;inset:0;font:900 42px/0.9 Helvetica,Arial,sans-serif;letter-spacing:-.04em;padding:8px 10px;opacity:.22">NEW YORK NEW YORK NEW YORK NEW YORK</div>${copy('PAULA SCHER', '公共剧场', '字体铺满城市。字不是说明，是街道上的噪音与节奏。', 'color:#fff')}`,
  ),
  html(
    'us-warhol',
    'us',
    '波普',
    '重复使神性脱落。同一张脸印四次，消费成为圣像。',
    'background:#111;display:grid;grid-template-columns:1fr 1fr 1fr 1fr',
    `<div style="background:#f2d64a"></div><div style="background:#e23b8a"></div><div style="background:#3aa0e8"></div><div style="background:#111;color:#fff;padding:18px 16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em;font-weight:700">WARHOL</div><div style="margin-top:6px;font-size:22px;font-weight:800">波普</div><div style="margin-top:8px;font-size:12px;line-height:1.45">重复使神性脱落。同一张脸印四次。</div></div>`,
  ),
  html(
    'us-greiman',
    'us',
    '新浪潮加州',
    'April Greiman：屏幕刚出现时，层就是空间。数字不是工具，是新的空气。',
    'background:#0b0b12;color:#e8ff6a',
    `<div style="position:absolute;inset:0;background:linear-gradient(115deg,transparent 40%,rgba(80,120,255,.35),transparent 70%),repeating-linear-gradient(0deg,transparent 0 7px,rgba(255,255,255,.06) 7px 8px)"></div>${copy('GREIMAN · NEW WAVE', '加州新浪潮', '屏幕刚出现时，层就是空间。数字不是工具，是新的空气。')}`,
  ),
  html(
    'us-cranbrook',
    'us',
    '解构',
    'Cranbrook / McCoy：意义在读者与版面之间生成。拆开网格，是为了看见权力。',
    'background:#ece7dc;color:#111',
    `<div style="position:absolute;left:8%;top:18%;font:800 54px Helvetica,Arial,sans-serif;transform:rotate(-12deg);opacity:.22">TEXT</div><div style="position:absolute;right:10%;bottom:22%;font:800 40px Helvetica,Arial,sans-serif;transform:rotate(8deg);letter-spacing:.4em;opacity:.35">IMAGE</div>${copy('CRANBROOK', '解构主义', '意义在读者与版面之间生成。拆开网格，是为了看见权力。')}`,
  ),
  html(
    'us-carson',
    'us',
    'Ray Gun',
    'David Carson：可读性不是唯一伦理。感觉先到，字可以迟到。',
    'background:#151515;color:#f0efed',
    `<div style="position:absolute;left:-2%;top:8%;font:900 96px/0.8 Helvetica,Arial,sans-serif;letter-spacing:-.08em;opacity:.14;transform:skewX(-18deg)">RAY</div>${copy('CARSON · RAY GUN', '直觉排版', '可读性不是唯一伦理。感觉先到，字可以迟到。')}`,
  ),
  html(
    'us-emigre',
    'us',
    'Emigre',
    'Rudy VanderLans / Zuzana Licko：字体是文化软件。杂志是实验室。',
    'background:#f4f0e6;color:#111;border-top:14px solid #111',
    copy('EMIGRE', '实验室', '字体是文化软件。杂志是实验室。'),
  ),

  html(
    'eu-bauhaus',
    'eu',
    '包豪斯',
    '形式追随功能，课堂追随车间。红黄蓝与圆方三角，是工业时代的字母。',
    'background:#ece7dc;display:grid;grid-template-columns:1.5fr .9fr .7fr',
    `<div style="background:#111;color:#f4f0ea;padding:20px 22px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em">BAUHAUS</div><div style="margin-top:6px;font-size:24px;font-weight:800">包豪斯</div><div style="margin-top:8px;font-size:12px;line-height:1.5">形式追随功能。红黄蓝与圆方三角，是工业时代的字母。</div></div><div style="background:#c43c1c"></div><div style="background:#1c4a9e"></div>`,
  ),
  html(
    'eu-tschichold',
    'eu',
    '新字体排印',
    'Tschichold《Die neue Typographie》：不对称、无衬线、摄影。书籍要像机器一样清醒。',
    'background:#f2efe8;color:#111',
    `<div style="position:absolute;left:0;top:0;bottom:0;width:10px;background:#c4122e"></div>${copy('TSCHICHOLD · 1928', '新字体排印', '不对称、无衬线、摄影。书籍要像机器一样清醒。')}`,
  ),
  html(
    'eu-swiss',
    'eu',
    '瑞士国际主义',
    'Hollis / Müller-Brockmann：网格是伦理。客观、摄影、Helvetica——少，是为了所有人都能读。',
    'background:#efefef;color:#111;background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:32px 32px',
    copy('INTERNATIONAL STYLE', '瑞士网格', '网格是伦理。客观、摄影、无衬线——少，是为了所有人都能读。'),
  ),
  html(
    'eu-destijl',
    'eu',
    '风格派',
    'Mondrian / van Doesburg：世界可被正交。原色与非色，是宇宙的家具。',
    'background:#f4f1ea;display:grid;grid-template-columns:2fr 18px 1fr 18px .8fr;grid-template-rows:1fr 18px .7fr',
    `<div style="background:#111"></div><div style="background:#111"></div><div style="background:#c4122e"></div><div style="background:#111"></div><div style="background:#1c4a9e"></div><div style="grid-column:1/-1;background:#111"></div><div style="background:#e8c84a;color:#111;padding:12px 16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.28em;font-weight:700">DE STIJL</div><div style="font-size:20px;font-weight:800">风格派</div></div><div style="background:#111"></div><div style="background:#f4f1ea"></div><div style="background:#111"></div><div style="background:#111"></div>`,
  ),
  html(
    'eu-lissitzky',
    'eu',
    '构成主义',
    'El Lissitzky：版面是力场。斜线前进，文字是构件，不是装饰。',
    'background:#d6c9b4;color:#111',
    `<div style="position:absolute;left:12%;top:10%;width:54%;height:8px;background:#c4122e;transform:rotate(-18deg)"></div><div style="position:absolute;left:18%;top:38%;width:40%;height:8px;background:#111;transform:rotate(-18deg)"></div>${copy('LISSITZKY', '构成', '版面是力场。斜线前进，文字是构件，不是装饰。')}`,
  ),
  html(
    'eu-deco',
    'eu',
    '装饰艺术',
    'Cassandre 式阳光放射。奢侈被几何化，速度被镀金。',
    'background:#1a1420;color:#f0d9a0;background-image:repeating-conic-gradient(from 0deg at 100% 0%,#c4a24a 0 6deg,#1a1420 6deg 12deg)',
    copy('ART DECO', '装饰艺术', '阳光放射、阶梯与金属。奢侈被几何化，速度被镀金。'),
  ),
  html(
    'eu-weingart',
    'eu',
    'Weingart',
    '从巴塞尔内部拆瑞士。字距拉断、网屏叠印：规则存在，是为了被加热。',
    'background:#111;color:#f4f0ea',
    `<div style="position:absolute;inset:0;font:800 18px/1.2 Helvetica,Arial,sans-serif;letter-spacing:.6em;opacity:.18;padding:16px">TYPOGRAPHY TYPOGRAPHY TYPOGRAPHY</div>${copy('WEINGART · NEW WAVE', '新浪潮', '从巴塞尔内部拆瑞士。字距拉断、网屏叠印：规则存在，是为了被加热。')}`,
  ),
  html(
    'eu-memphis',
    'eu',
    '孟菲斯',
    'Sottsass：后现代把趣味当武器。几何可以俏皮，严肃可以戴耳环。',
    'background:#f2d64a;color:#111',
    `<div style="position:absolute;right:8%;top:16%;width:70px;height:70px;border-radius:50%;background:#e23b8a"></div><div style="position:absolute;right:22%;bottom:12%;width:90px;height:18px;background:#1c7cff;transform:rotate(-12deg)"></div>${copy('MEMPHIS MILANO', '孟菲斯', '后现代把趣味当武器。几何可以俏皮，严肃可以戴耳环。')}`,
  ),
  html(
    'eu-futurism',
    'eu',
    '未来主义',
    'Marinetti：文字要在纸上奔跑。诗歌炸开中轴线，速度就是语法。',
    'background:#1a120e;color:#f6ead0',
    `<div style="position:absolute;left:6%;top:20%;font:900 64px Helvetica,Arial,sans-serif;transform:skewX(-24deg);opacity:.2">PAROLE</div>${copy('FUTURISMO', '未来主义', '文字要在纸上奔跑。诗歌炸开中轴线，速度就是语法。')}`,
  ),
  html(
    'eu-brody',
    'eu',
    'The Face',
    'Neville Brody：杂志是亚文化的建筑。字体有态度，栏宽有立场。',
    'background:#0a0a0a;color:#fff',
    `<div style="position:absolute;left:0;bottom:0;height:46%;width:100%;background:#c4122e"></div>${copy('THE FACE · BRODY', '面孔', '杂志是亚文化的建筑。字体有态度，栏宽有立场。')}`,
  ),

  html(
    'cn-song',
    'cn',
    '宋版',
    '版心、鱼尾、界栏。印本把阅读收进格子，敬字如敬人。',
    'background:#f0e2c4;color:#2a1c12;background-image:linear-gradient(#c4a070 1px,transparent 1px);background-size:100% 28px;background-position:0 18px',
    `<div style="position:absolute;left:50%;top:12px;bottom:12px;width:2px;background:#8a5a32;transform:translateX(-1px)"></div>${copy('宋刻本', '版心', '版心、鱼尾、界栏。印本把阅读收进格子，敬字如敬人。')}`,
  ),
  html(
    'cn-bai',
    'cn',
    '计白当黑',
    '书法与印章：白不是底，是笔。留白的密度，就是精神的密度。',
    'background:#f7f1e4;color:#1a120e',
    `<div style="position:absolute;right:10%;top:16%;width:54px;height:54px;border:3px solid #c4122e"></div>${copy('计白当黑', '白即笔', '白不是底，是笔。留白的密度，就是精神的密度。')}`,
  ),
  html(
    'cn-yue',
    'cn',
    '月份牌',
    '上海摩登：擦笔水彩、年历边框、商品与仕女同框。商业第一次成为大众美术。',
    'background:#f3d9c4;color:#4a1c28',
    `<div style="position:absolute;inset:14px;border:8px solid #c45a6a;outline:1px solid #f6ead0;outline-offset:6px"></div>${copy('YUEFENPAI', '月份牌', '擦笔水彩、年历边框。商业第一次成为大众美术。')}`,
  ),
  html(
    'cn-liangyou',
    'cn',
    '良友',
    '画报网格：摄影、摩登、栏目。民国杂志用铜版把城市印成可翻的速度。',
    'background:#1c1c1c;color:#f0ead8;display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:6px;padding:10px',
    `<div style="background:#8a1c1c;padding:16px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.3em">1926</div><div style="font-size:24px;font-weight:800">良友</div><div style="margin-top:8px;font-size:12px;line-height:1.45">画报网格：摄影、摩登、栏目。城市被印成可翻的速度。</div></div><div style="background:#3a342c"></div><div style="background:#d8c4a0"></div>`,
  ),
  html(
    'cn-xuan',
    'cn',
    '宣传画',
    '平涂、口号、前进。政治要求可读，色彩要求必胜。',
    'background:#c4122e;color:#f6e27a',
    `<div style="position:absolute;left:0;bottom:0;width:100%;height:22%;background:#f6e27a"></div>${copy('宣传画', '前进', '平涂、口号、前进。政治要求可读，色彩要求必胜。')}`,
  ),
  html(
    'cn-seal',
    'cn',
    '印学',
    '朱文白文：方寸里的建筑。一枚印，是身份被压进朱红。',
    'background:#1a120e;color:#f6e6c8',
    `<div style="position:absolute;right:12%;top:18%;width:86px;height:86px;background:#c4122e;display:grid;place-items:center;font:800 28px/1 'Songti SC',serif;color:#f6e6c8">印</div>${copy('篆刻', '朱砂', '朱文白文：方寸里的建筑。一枚印，是身份被压进朱红。')}`,
  ),
  html(
    'cn-steiner',
    'cn',
    '跨文化',
    'Henry Steiner《Cross-Cultural Design》：并置，不是搅拌。变色龙保有形体，只反射当地的光。',
    'background:#111;color:#f0efed;display:grid;grid-template-columns:1fr 1fr',
    `<div style="background:#c4122e;padding:20px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:22px;font-weight:800">東</div></div><div style="padding:20px;display:flex;flex-direction:column;justify-content:flex-end"><div style="font-size:10px;letter-spacing:.28em">STEINER</div><div style="margin-top:6px;font-size:22px;font-weight:800">跨文化</div><div style="margin-top:8px;font-size:12px;line-height:1.5">并置，不是搅拌。变色龙保有形体，只反射当地的光。</div></div>`,
  ),
  html(
    'cn-kan',
    'cn',
    '靳埭强',
    '水墨入现代。红点、宣纸、包豪斯骨架——东方的笔落在国际网格上。',
    'background:#f6f1e6;color:#1a120e',
    `<div style="position:absolute;left:12%;top:28%;width:72px;height:18px;background:#111;transform:rotate(-28deg);border-radius:40px"></div><div style="position:absolute;left:22%;top:22%;width:18px;height:18px;border-radius:50%;background:#c4122e"></div>${copy('KAN TAI-KEUNG', '水墨现代', '红点、宣纸、包豪斯骨架。东方的笔落在国际网格上。')}`,
  ),
  html(
    'cn-chan',
    'cn',
    '陈幼坚',
    '东方情、西方理。传统纹样被抽成标志，茶与都市共用一条中线。',
    'background:#f4ece0;color:#2a1a12',
    `<div style="position:absolute;right:0;top:0;bottom:0;width:28%;background:#c4122e"></div>${copy('ALAN CHAN', '新中式', '东方情、西方理。传统纹样被抽成标志，茶与都市共用一条中线。')}`,
  ),
  html(
    'cn-window',
    'cn',
    '冰裂纹',
    '园林漏窗：景被框，框也是景。破裂的秩序，比完整更像自然。',
    'background:#1b1410;color:#f0d9a8;background-image:linear-gradient(28deg,#7a2a1a 1px,transparent 1px),linear-gradient(-18deg,#7a2a1a 1px,transparent 1px),linear-gradient(72deg,#7a2a1a 1px,transparent 1px);background-size:46px 46px,52px 52px,38px 38px',
    copy('漏窗', '冰裂纹', '景被框，框也是景。破裂的秩序，比完整更像自然。'),
  ),

  live(
    'jp-live-seigaiha',
    'jp',
    '青海波',
    '纹样自己呼吸。',
    `<div id="b" style="height:100%;background:#12303a;color:#d7efe8;font:700 22px/1.2 ui-sans-serif,sans-serif;display:flex;align-items:flex-end;padding:24px 32px">青海波</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.012;if(e)e.style.backgroundSize=48+Math.sin(t)*6+'px '+ (28+Math.cos(t)*4)+'px';e.style.backgroundImage='radial-gradient(circle at 50% 120%,transparent 22px,#1e4a58 23px 25px,transparent 26px)';e.style.backgroundColor='#12303a';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-sun',
    'jp',
    '红日',
    '圆在呼吸，仍然是圆。',
    `<div style="height:100%;background:#111;position:relative;color:#f4f0ea;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">红日<div id="s" style="position:absolute;right:12%;top:18%;width:120px;height:120px;border-radius:50%;background:#c4122e"></div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=0.02;if(e)e.style.transform='scale('+(1+Math.sin(t)*0.06)+')';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-white',
    'jp',
    '白',
    '空也在微微发热。',
    `<div id="b" style="height:100%;background:#f6f4ef;color:#2a2a28;display:flex;align-items:flex-end;padding:36px 44px;font:800 28px ui-sans-serif,sans-serif">白</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.01;if(e)e.style.background='hsl(40 20% '+(95+Math.sin(t)*1.6)+'%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'jp-live-yokoo',
    'jp',
    '横尾',
    '冲突自己换场。',
    `<div id="b" style="height:100%;background:#2a0830;color:#ffe48a;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">横尾</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.4;if(e)e.style.background='repeating-linear-gradient('+(45+t)+'deg,#c4126a 0 16px,#2a0830 16px 32px,#1c7cff 32px 36px)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-bass',
    'us',
    '一刀',
    '切面在移动。',
    `<div style="height:100%;background:#0e0e0e;position:relative;color:#fff;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px Helvetica,Arial,sans-serif">Bass<div id="c" style="position:absolute;left:0;top:0;width:38%;height:100%;background:#c4122e"></div></div><script>(function(){var e=document.getElementById('c'),t=0;function f(){t+=0.02;if(e)e.style.clipPath='polygon(0 0,100% 0,'+(58+Math.sin(t)*8)+'% 100%,0 100%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-scher',
    'us',
    '公共剧场',
    '字在街上走。',
    `<div style="height:100%;overflow:hidden;background:#d21c12;color:#fff;font:800 22px/240px Helvetica,Arial,sans-serif;letter-spacing:.12em;white-space:nowrap"><div style="display:inline-block;animation:m 14s linear infinite">PAULA SCHER · PUBLIC THEATER · NEW YORK · </div></div><style>@keyframes m{from{transform:translateX(0)}to{transform:translateX(-50%)}}</style>`,
  ),
  live(
    'us-live-decon',
    'us',
    '解构',
    '两层意义错开。',
    `<div id="a" style="height:100%;background:#ece7dc;color:#111;display:flex;align-items:flex-end;padding:24px 32px;font:800 26px Helvetica,Arial,sans-serif">解构</div><script>(function(){var e=document.getElementById('a'),t=0;function f(){t+=0.03;if(e){e.style.letterSpacing=(.04+Math.sin(t)*.2)+'em';e.style.transform='rotate('+Math.sin(t)*1.4+'deg)';}requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'us-live-pop',
    'us',
    '波普',
    '色版轮换。',
    `<div id="b" style="height:100%;display:grid;grid-template-columns:1fr 1fr 1fr 1fr"><i></i><i></i><i></i><i></i></div><style>#b i{display:block}</style><script>(function(){var c=['#f2d64a','#e23b8a','#3aa0e8','#111'],n=0,els=document.querySelectorAll('#b i');function f(){n++;els.forEach(function(el,i){el.style.background=c[(i+n)%4]});}f();setInterval(f,700);})()</script>`,
  ),
  live(
    'eu-live-swiss',
    'eu',
    '瑞士网格',
    '格子自己眨眼。',
    `<div id="b" style="height:100%;background:#efefef;background-image:linear-gradient(#bbb 1px,transparent 1px),linear-gradient(90deg,#bbb 1px,transparent 1px);background-size:32px 32px;color:#111;display:flex;align-items:flex-end;padding:24px 32px;font:800 22px Helvetica,Arial,sans-serif">网格</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.15;if(e)e.style.backgroundSize=32+Math.sin(t)*4+'px '+ (32+Math.cos(t)*4)+'px';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'eu-live-stijl',
    'eu',
    '风格派',
    '原色换班。',
    `<div id="b" style="height:100%;display:grid;grid-template-columns:2fr 18px 1fr 18px .8fr"><i></i><i></i><i></i><i></i><i></i></div><style>#b i{display:block;background:#111}#b i:nth-child(3){background:#c4122e}#b i:nth-child(5){background:#1c4a9e}</style><script>(function(){var n=0,els=document.querySelectorAll('#b i');setInterval(function(){n=(n+1)%3;var c=['#c4122e','#e8c84a','#1c4a9e'];els[2].style.background=c[n];els[4].style.background=c[(n+1)%3];},800);})()</script>`,
  ),
  live(
    'eu-live-memphis',
    'eu',
    '孟菲斯',
    '几何在跳舞。',
    `<div style="height:100%;background:#f2d64a;position:relative"><div id="d" style="position:absolute;right:12%;top:22%;width:70px;height:70px;border-radius:50%;background:#e23b8a"></div></div><script>(function(){var e=document.getElementById('d'),t=0;function f(){t+=0.04;if(e)e.style.transform='translateY('+Math.sin(t)*10+'px)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'eu-live-weingart',
    'eu',
    '新浪潮',
    '字距在呼吸。',
    `<div id="b" style="height:100%;background:#111;color:#f4f0ea;display:flex;align-items:flex-end;padding:24px 32px;font:800 20px Helvetica,Arial,sans-serif;letter-spacing:.4em">WEINGART</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.03;if(e)e.style.letterSpacing=(.2+Math.sin(t)*.35)+'em';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-seal',
    'cn',
    '朱砂',
    '印色在沁。',
    `<div id="b" style="height:100%;background:#1a120e;color:#f6e6c8;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px 'Songti SC',serif">朱砂</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.015;if(e)e.style.background='radial-gradient(circle at '+(50+Math.sin(t)*16)+'% 40%, #c4122e, #1a120e 58%)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-xuan',
    'cn',
    '前进',
    '色带上推。',
    `<div style="height:100%;background:#c4122e;color:#f6e27a;position:relative;display:flex;align-items:flex-end;padding:24px 32px;font:800 24px ui-sans-serif,sans-serif">前进<div id="y" style="position:absolute;left:0;bottom:0;width:100%;height:22%;background:#f6e27a"></div></div><script>(function(){var e=document.getElementById('y'),t=0;function f(){t+=0.03;if(e)e.style.height=(18+Math.sin(t)*6)+'%';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-bai',
    'cn',
    '白即笔',
    '红印微震。',
    `<div style="height:100%;background:#f7f1e4;position:relative;color:#1a120e;display:flex;align-items:flex-end;padding:28px 36px;font:800 24px 'Songti SC',serif">计白当黑<div id="s" style="position:absolute;right:10%;top:16%;width:54px;height:54px;border:3px solid #c4122e"></div></div><script>(function(){var e=document.getElementById('s'),t=0;function f(){t+=0.04;if(e)e.style.transform='rotate('+Math.sin(t)*3+'deg)';requestAnimationFrame(f);}f();})()</script>`,
  ),
  live(
    'cn-live-window',
    'cn',
    '冰裂纹',
    '窗格在错位。',
    `<div id="b" style="height:100%;background:#1b1410;color:#f0d9a8;display:flex;align-items:flex-end;padding:24px 32px;font:700 20px ui-sans-serif,sans-serif">漏窗</div><script>(function(){var e=document.getElementById('b'),t=0;function f(){t+=0.2;if(e)e.style.backgroundPosition=t+'px '+(t*0.4)+'px';e.style.backgroundImage='linear-gradient(28deg,#7a2a1a 1px,transparent 1px),linear-gradient(-18deg,#7a2a1a 1px,transparent 1px)';e.style.backgroundSize='46px 46px,52px 52px';requestAnimationFrame(f);}f();})()</script>`,
  ),
]

export function bannerGalleryId(kind: string, html: string) {
  let hash = 2166136261
  const key = `${kind}\n${html}`
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return `g-${(hash >>> 0).toString(16)}`
}

export function isBannerPreset(banner: PageBanner) {
  return BANNER_PRESETS.some((item) => item.kind === banner.kind && item.html === banner.html)
}

export function presetsOf(kind: PageBannerKind) {
  return BANNER_PRESETS.filter((item) => item.kind === kind)
}
