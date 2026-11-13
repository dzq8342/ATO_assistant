// 剧情书速查：把官方中文剧情书数据整理成精简格式（书 → 章节 → 段落），
// 压缩后嵌进 template.html，生成一个可离线打开的单文件网页。
//
// 用法（在仓库根目录）：
//   node tools/story-reader/build.cjs <storybook-official-data.js 的路径> [输出 html，默认 剧情书速查.html]
//
// 剧情正文是版权内容：输入数据和生成的 html 都不要提交进仓库（本目录的 .gitignore 已挡住 html 输出）。
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const repo = path.resolve(__dirname, '..', '..');
const officialPath = process.argv[2];
const outPath = process.argv[3] || path.join(process.cwd(), '剧情书速查.html');
if (!officialPath) {
  console.error('用法：node tools/story-reader/build.cjs <storybook-official-data.js> [输出.html]');
  process.exit(1);
}
const placeholderPath = path.join(repo, 'story', 'storybook-placeholder.js');
const load = (file, name) => { const w = {}; new Function('window', fs.readFileSync(file, 'utf8'))(w); return w[name]; };
const official = load(officialPath, 'STORYBOOK_OFFICIAL_DATA');
const placeholder = load(placeholderPath, 'STORYBOOK_DATA');

// 标题、章节名、遭遇名：用 App 的官方中文用词表（assets/ato-terms.js）替换，
// 作用域与剧情书跳转器的标题处相同；再叠加私人版的用词偏好。
const { createEngine } = require(path.join(repo, 'tests', 'helpers', 'term-language.cjs'));
const terms = load(path.join(repo, 'assets', 'ato-terms.js'), 'ATO_TERMS');
const READER = 'story-reader';
const prefer = [
  ['冒险枢纽', '分支冒险'], ['冒险中枢', '分支冒险'],
  ['休憩冒险', '休整冒险'], ['R&R 冒险', '休整冒险'],
  ['休整冒险 (R&R Adventures)', '休整冒险'], ['休憩冒险 (R&R Adventures)', '休整冒险'], ['R&R 冒险 (R&R Adventures)', '休整冒险'],
  ['法洛斯之梦', '航标梦境'],
];
const engine = createEngine(terms.concat(prefer.map(([from, to]) => ({ from, to, scope: READER }))));
const TITLE_SCOPES = ['#encounterSelect, #entryTitle, #resultList, #memoryList', READER];
const rename = (t) => engine.translate(String(t || ''), TITLE_SCOPES);
// 正文本身已是官方校对稿（C1–C3）；只把私人版偏好里的几个专有名词统一，不套整张表，
// 免得把正文里的常用词（如「力量」）也换掉。
const proseEngine = createEngine(prefer.map(([from, to]) => ({ from, to })));
const prose = (t) => proseEngine.translate(String(t || ''), []);
const bookNames = { c1: 'C1 迷宫的真理', c2: 'C2 深渊凝视者', c3: 'C3 无情烈日', c4: 'C4 无尽增长的花园', c5: 'C5 真言者' };

const books = official.books.map((book) => {
  const meta = placeholder.books.find((b) => b.id === book.id) || { chapters: [], entries: [] };
  const metaByKey = new Map(meta.entries.map((e) => [e.key, e]));
  const chapterList = (book.chapters && book.chapters.length ? book.chapters : meta.chapters)
    .map((c) => ({ key: c.key, title: rename(c.title) }));
  // 只有在条目里真正出现过的章节才保留，并按段落的原始顺序排列。
  const chapterIndex = new Map(chapterList.map((c, i) => [c.key, i]));
  const chapters = chapterList.map((c) => ({ ...c, entries: [] }));
  const other = { key: 'other', title: '其他', entries: [] };
  const entries = [];
  const hasOfficial = !(book.chapters && book.chapters.length);
  const officialEncounter = new Map();
  if (hasOfficial) {
    const ordered = book.entries.slice().sort((a, b) => ((metaByKey.get(a.key) || {}).order ?? 1e9) - ((metaByKey.get(b.key) || {}).order ?? 1e9));
    for (const e of ordered) {
      const m = metaByKey.get(e.key) || {};
      if (m.encounterKey && !officialEncounter.has(m.encounterKey)) officialEncounter.set(m.encounterKey, String(e.officialTitle || '').trim() || rename(m.encounter));
    }
  }
  const sorted = book.entries.slice().sort((a, b) => {
    const ma = metaByKey.get(a.key) || a, mb = metaByKey.get(b.key) || b;
    return (ma.order ?? 1e9) - (mb.order ?? 1e9);
  });
  for (const e of sorted) {
    const m = metaByKey.get(e.key) || {};
    let chapterKey = e.chapterKey || m.chapterKey;
    if (!chapterKey && /^战斗[：:]/.test(e.officialTitle || '')) chapterKey = 'battle';
    const ci = chapterIndex.has(chapterKey) ? chapterIndex.get(chapterKey) : -1;
    const text = String(e.officialText || e.text || '').replace(/\r\n/g, '\n').trim();
    const item = {
      k: e.key,
      i: String(e.id || ''),
      // C1–C3 的 officialTitle 就是官方译名，原样使用；C4/C5 没有官方译本，标题按用词表替换。
      t: hasOfficial ? (String(e.officialTitle || '').trim() || rename(String(e.title || m.title || '').trim()) || String(e.id || '')) : rename(String(e.officialTitle || e.title || m.title || e.id || '').trim()),
      x: prose(text),
    };
    // 分组名（遭遇）：C1–C3 用该遭遇开头那一段的官方标题，C4/C5 按用词表替换。
    const encounterKey = e.encounterKey || m.encounterKey;
    const encounter = hasOfficial ? officialEncounter.get(encounterKey) : rename(e.encounter || m.encounter);
    if (encounter) item.n = encounter;
    const index = entries.push(item) - 1;
    (ci >= 0 ? chapters[ci] : other).entries.push(index);
  }
  const cleanTitle = (t) => t.replace(/\s*v\d+(\.\d+)?$/i, '').replace(/\s*\([A-Za-z0-9 ,.’'&:!?-]+\)\s*$/, '').replace(/\s+[A-Za-z][A-Za-z ]*$/, '').replace(/\s*v\d+(\.\d+)?$/i, '').replace(/^战斗\s*\(?Battles?\)?$|^Battles?$/i, '战斗').replace(/^战斗 Battle$/, '战斗').trim();
  chapters.forEach((c) => { c.title = cleanTitle(c.title); });
  const rank = (c) => (c.key === 'main' || /主线故事/.test(c.title) ? 0 : c.key === 'battle' || c.title === '战斗' ? 2 : 1);
  const used = chapters.filter((c) => c.entries.length)
    .map((c, i) => [c, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map(([c]) => c);
  if (other.entries.length) used.push(other);
  return { id: book.id, name: bookNames[book.id] || book.id.toUpperCase(), chapters: used.map((c) => ({ k: c.key, t: c.title, e: c.entries })), entries };
});

const json = JSON.stringify({ revision: official.officialVersion?.revision || '', books });
const gz = zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
const template = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
fs.writeFileSync(outPath, template.replace('__DATA__', () => gz.toString('base64')));
console.log('已生成', outPath);
console.log('json', json.length, 'gzip', gz.length, 'base64', Math.ceil(gz.length * 4 / 3));
for (const b of books) console.log(b.id, b.entries.length, b.chapters.map((c) => `${c.t}(${c.e.length})`).join(' / '));
