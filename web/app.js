const SESSION_SIZE = 20;
const GRADUATE_AT = 3; // 連續答對幾次視為畢業

let words = [];
let queue = [];
let current = null;
let correctWord = "";
let knowCount = 0;
let againCount = 0;
let graduatedCount = 0;
let currentLevel = "";
let currentMode = "all"; // "all" | "weak"

// ── 啟動 ──────────────────────────────────────────────
initStreak();
updateWeakBadges();

// ── 進入練習 ──────────────────────────────────────────
async function startSession(level, mode) {
  currentLevel = level;
  currentMode = mode;
  knowCount = 0;
  againCount = 0;
  graduatedCount = 0;

  try {
    const res = await fetch(`../data/${level}.json`);
    if (!res.ok) throw new Error();
    words = await res.json();
  } catch {
    words = getSampleWords(level);
  }

  if (mode === "weak") {
    const weakKeys = getWeakKeys(level);
    if (weakKeys.length === 0) {
      alert("目前沒有弱點單字！先練習一輪再來。");
      return;
    }
    const weakWords = words.filter(w => weakKeys.includes(w.word));
    queue = shuffle(weakWords).slice(0, SESSION_SIZE);
  } else {
    const weakKeys = getWeakKeys(level);
    const prioritized = shuffle(words.filter(w => weakKeys.includes(w.word)));
    const rest = shuffle(words.filter(w => !weakKeys.includes(w.word)));
    queue = [...prioritized, ...rest].slice(0, SESSION_SIZE);
  }

  // 模式標籤
  const tag = document.getElementById("mode-tag");
  if (mode === "weak") {
    tag.textContent = "⚡ 弱點練習模式";
    tag.className = "mode-tag weak";
  } else {
    tag.textContent = "📖 全部單字模式";
    tag.className = "mode-tag all";
  }
  tag.classList.remove("hidden");

  show("screen-quiz");
  nextCard();
}

// ── 下一張卡 ──────────────────────────────────────────
function nextCard() {
  if (queue.length === 0) { showDone(); return; }

  current = queue.shift();
  correctWord = current.word;

  const total = SESSION_SIZE;
  const done = total - queue.length - 1;
  document.getElementById("progress-text").textContent = `${done + 1} / ${total}`;
  document.getElementById("progress-fill").style.width = `${(done / total) * 100}%`;

  const sentence = current.example.replace(
    new RegExp(`\\b${escapeRegex(correctWord)}\\b`, "i"),
    `<span class="blank"></span>`
  );
  document.getElementById("sentence-display").innerHTML = sentence;

  const distractors = shuffle(words.filter(w => w.word !== correctWord)).slice(0, 3);
  const options = shuffle([current, ...distractors]);
  const choicesEl = document.getElementById("choices");
  choicesEl.innerHTML = "";
  options.forEach(opt => {
    const btn = document.createElement("button");
    btn.className = "choice-btn";
    btn.textContent = opt.word;
    btn.onclick = () => selectAnswer(btn, opt.word);
    choicesEl.appendChild(btn);
  });

  showFront();
}

// ── 選答案 ──────────────────────────────────────────
function selectAnswer(btn, chosen) {
  document.querySelectorAll(".choice-btn").forEach(b => b.classList.add("disabled"));
  const isCorrect = chosen === correctWord;
  btn.classList.add(isCorrect ? "correct" : "wrong");
  if (!isCorrect) {
    document.querySelectorAll(".choice-btn").forEach(b => {
      if (b.textContent === correctWord) b.classList.add("correct");
    });
  }
  setTimeout(() => showBack(isCorrect), 600);
}

// ── 翻面 ──────────────────────────────────────────────
function showBack(isCorrect) {
  const badge = document.getElementById("result-badge");
  badge.textContent = isCorrect ? "✓  正確！" : `✗  正確答案是：${correctWord}`;
  badge.className = `result-badge ${isCorrect ? "correct" : "wrong"}`;

  document.getElementById("back-word").textContent = current.word;
  document.getElementById("back-pos").textContent = current.pos || "";
  document.getElementById("back-phonetic").textContent = current.phonetic || "";
  document.getElementById("back-definition").textContent = current.definition_zh || "";
  document.getElementById("back-example").textContent = current.example || "";
  document.getElementById("back-example-zh").textContent = current.example_zh || "";

  const usageSection = document.getElementById("usage-section");
  const usageList = document.getElementById("usage-list");
  const toggleBtn = document.querySelector(".btn-usage-toggle");
  if (current.usage && current.usage.length > 0) {
    usageSection.style.display = "block";
    usageList.innerHTML = current.usage.map(u => `
      <div class="usage-item">
        <span class="usage-pattern">${u.pattern}</span>
        <span class="usage-meaning">${u.meaning_zh}</span>
      </div>`).join("");
    usageList.classList.add("hidden");
    toggleBtn.textContent = "▶ 展開用法";
  } else {
    usageSection.style.display = "none";
  }

  showCard("card-back");
}

// ── 用法展開 ──────────────────────────────────────────
function toggleUsage() {
  const list = document.getElementById("usage-list");
  const btn = document.querySelector(".btn-usage-toggle");
  const open = list.classList.toggle("hidden");
  btn.textContent = open ? "▶ 展開用法" : "▼ 收起用法";
}

// ── 發音 ──────────────────────────────────────────────
function speak() {
  if (!current) return;
  const utt = new SpeechSynthesisUtterance(current.word);
  utt.lang = "en-US";
  speechSynthesis.speak(utt);
}

// ── 標記認識 ──────────────────────────────────────────
function markKnow() {
  knowCount++;
  const graduated = recordCorrect(currentLevel, current.word);
  if (graduated) graduatedCount++;
  nextCard();
}

// ── 標記再複習 ────────────────────────────────────────
function markAgain() {
  againCount++;
  addToWeak(currentLevel, current.word);
  nextCard();
}

// ── 結束畫面 ──────────────────────────────────────────
function showDone() {
  const streak = updateStreak();
  document.getElementById("stat-know").textContent = knowCount;
  document.getElementById("stat-again").textContent = againCount;
  document.getElementById("stat-graduated").textContent = graduatedCount;
  document.getElementById("done-streak").textContent = streak;
  document.getElementById("streak-count").textContent = streak;
  document.getElementById("streak-label").textContent = "今天已練習 ✓";

  const weakInfo = document.getElementById("done-weak-info");
  const remaining = getWeakKeys(currentLevel).length;
  if (graduatedCount > 0) {
    weakInfo.textContent = `🎓 本輪移除 ${graduatedCount} 個弱點，還剩 ${remaining} 個`;
  } else if (againCount > 0) {
    weakInfo.textContent = `📌 加入 ${againCount} 個到弱點清單，共 ${remaining} 個`;
  } else {
    weakInfo.textContent = "";
  }

  const gradStat = document.getElementById("graduated-stat");
  gradStat.style.display = graduatedCount > 0 ? "flex" : "none";

  updateWeakBadges();
  show("screen-done");
}

// ── 返回 ──────────────────────────────────────────────
function goBack() {
  document.getElementById("mode-tag").classList.add("hidden");
  show("screen-select");
}

// ── 弱點庫 ────────────────────────────────────────────
function weakKey(level) { return `vocab_weak_${level}`; }

function getWeakData(level) {
  try { return JSON.parse(localStorage.getItem(weakKey(level)) || "{}"); }
  catch { return {}; }
}

function getWeakKeys(level) {
  return Object.keys(getWeakData(level));
}

function addToWeak(level, word) {
  const data = getWeakData(level);
  if (!data[word]) {
    data[word] = { wrongs: 1, streak: 0 };
  } else {
    data[word].wrongs++;
    data[word].streak = 0;
  }
  localStorage.setItem(weakKey(level), JSON.stringify(data));
}

// 答對：增加連勝，達到 GRADUATE_AT 則畢業移除
function recordCorrect(level, word) {
  const data = getWeakData(level);
  if (!data[word]) return false; // 不在弱點庫，不需處理
  data[word].streak = (data[word].streak || 0) + 1;
  if (data[word].streak >= GRADUATE_AT) {
    delete data[word];
    localStorage.setItem(weakKey(level), JSON.stringify(data));
    return true; // 畢業
  }
  localStorage.setItem(weakKey(level), JSON.stringify(data));
  return false;
}

function updateWeakBadges() {
  ["國中", "高中"].forEach(level => {
    const count = getWeakKeys(level).length;
    const countEl = document.getElementById(`weak-count-${level}`);
    const btn = document.getElementById(`btn-weak-${level}`);
    if (countEl) countEl.textContent = count;
    if (btn) btn.classList.toggle("empty", count === 0);
  });
}

// ── Streak ────────────────────────────────────────────
function initStreak() {
  const { count, lastDate } = getStreak();
  document.getElementById("streak-count").textContent = count;
  document.getElementById("streak-label").textContent =
    lastDate === todayStr() ? "今天已練習 ✓" : "今天還沒練習";
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function getStreak() {
  try { return JSON.parse(localStorage.getItem("streak") || '{"count":0,"lastDate":""}'); }
  catch { return { count: 0, lastDate: "" }; }
}

function updateStreak() {
  const today = todayStr();
  const s = getStreak();
  if (s.lastDate === today) return s.count;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const newCount = s.lastDate === yesterday ? s.count + 1 : 1;
  localStorage.setItem("streak", JSON.stringify({ count: newCount, lastDate: today }));
  return newCount;
}

// ── 畫面工具 ──────────────────────────────────────────
function show(id) {
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("active"));
  document.getElementById(id).classList.add("active");
}

function showFront() { showCard("card-front"); }

function showCard(id) {
  document.querySelectorAll(".card-face").forEach(c => c.classList.add("hidden"));
  document.getElementById(id).classList.remove("hidden");
}

// ── 工具 ──────────────────────────────────────────────
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ── 範例資料 ──────────────────────────────────────────
function getSampleWords(level) {
  return [
    { word: "struggle", phonetic: "/ˈstrʌɡəl/", pos: "v.", definition_zh: "掙扎；奮鬥", example: "She struggled to finish the exam on time.", example_zh: "她努力在時間內完成考試。", usage: [{ pattern: "struggle to V", meaning_zh: "努力嘗試做某事" }, { pattern: "struggle with sth", meaning_zh: "與某事搏鬥" }] },
    { word: "abandon", phonetic: "/əˈbændən/", pos: "v.", definition_zh: "放棄；遺棄", example: "He had to abandon his plan due to lack of funding.", example_zh: "他因缺乏資金不得不放棄計畫。", usage: [{ pattern: "abandon sth", meaning_zh: "放棄某事物" }] },
    { word: "achieve", phonetic: "/əˈtʃiːv/", pos: "v.", definition_zh: "達到；實現", example: "Hard work helps you achieve your goals.", example_zh: "努力能幫助你實現目標。", usage: [{ pattern: "achieve a goal", meaning_zh: "達成目標" }] },
    { word: "brilliant", phonetic: "/ˈbrɪliənt/", pos: "adj.", definition_zh: "出色的；聰明的", example: "She came up with a brilliant solution to the problem.", example_zh: "她想出了一個出色的解決方案。", usage: [{ pattern: "a brilliant idea", meaning_zh: "絕妙的主意" }] },
    { word: "curious", phonetic: "/ˈkjʊəriəs/", pos: "adj.", definition_zh: "好奇的", example: "Children are naturally curious about the world.", example_zh: "孩子天生對世界充滿好奇。", usage: [{ pattern: "be curious about sth", meaning_zh: "對某事感到好奇" }] },
    { word: "determine", phonetic: "/dɪˈtɜːrmɪn/", pos: "v.", definition_zh: "決定；查明", example: "Scientists are trying to determine the cause of the disease.", example_zh: "科學家正試圖查明這種疾病的原因。", usage: [{ pattern: "determine to V", meaning_zh: "決心做某事" }] },
    { word: "encourage", phonetic: "/ɪnˈkɜːrɪdʒ/", pos: "v.", definition_zh: "鼓勵；支持", example: "Her teacher encouraged her to keep writing.", example_zh: "她的老師鼓勵她繼續寫作。", usage: [{ pattern: "encourage sb to V", meaning_zh: "鼓勵某人做某事" }] },
    { word: "flexible", phonetic: "/ˈfleksɪbl/", pos: "adj.", definition_zh: "靈活的；有彈性的", example: "A flexible schedule allows you to manage your time better.", example_zh: "靈活的時間表讓你更好地管理時間。", usage: [{ pattern: "flexible hours", meaning_zh: "彈性工時" }] },
    { word: "grateful", phonetic: "/ˈɡreɪtfl/", pos: "adj.", definition_zh: "感激的；感謝的", example: "I am grateful for all the help you gave me.", example_zh: "我很感激你給我的所有幫助。", usage: [{ pattern: "be grateful for sth", meaning_zh: "對某事心存感激" }] },
    { word: "hesitate", phonetic: "/ˈhezɪteɪt/", pos: "v.", definition_zh: "猶豫；躊躇", example: "Don't hesitate to ask if you have any questions.", example_zh: "有任何問題請不要猶豫，盡管發問。", usage: [{ pattern: "hesitate to V", meaning_zh: "猶豫是否做某事" }] },
    { word: "ignore", phonetic: "/ɪɡˈnɔːr/", pos: "v.", definition_zh: "忽視；不理會", example: "It is dangerous to ignore warning signs.", example_zh: "忽視警告信號是危險的。", usage: [{ pattern: "ignore sb/sth", meaning_zh: "無視某人/某事" }] },
    { word: "journey", phonetic: "/ˈdʒɜːrni/", pos: "n.", definition_zh: "旅程；旅行", example: "Learning a language is a long journey.", example_zh: "學習一門語言是一段漫長的旅程。", usage: [{ pattern: "on a journey", meaning_zh: "在旅途中" }] },
    { word: "knowledge", phonetic: "/ˈnɒlɪdʒ/", pos: "n.", definition_zh: "知識；了解", example: "Reading widely can expand your knowledge.", example_zh: "廣泛閱讀可以拓展你的知識。", usage: [{ pattern: "knowledge of sth", meaning_zh: "對某事的了解" }] },
    { word: "literature", phonetic: "/ˈlɪtrətʃər/", pos: "n.", definition_zh: "文學；文獻", example: "She developed a passion for literature in high school.", example_zh: "她在高中時培養了對文學的熱情。", usage: [{ pattern: "world literature", meaning_zh: "世界文學" }] },
    { word: "mission", phonetic: "/ˈmɪʃn/", pos: "n.", definition_zh: "任務；使命", example: "The team's mission was to explore the remote island.", example_zh: "這個團隊的任務是探索這座偏遠的島嶼。", usage: [{ pattern: "on a mission", meaning_zh: "執行任務中" }] },
    { word: "negotiate", phonetic: "/nɪˈɡoʊʃieɪt/", pos: "v.", definition_zh: "談判；協商", example: "Both sides agreed to negotiate a peace deal.", example_zh: "雙方同意就和平協議進行談判。", usage: [{ pattern: "negotiate with sb", meaning_zh: "與某人談判" }] },
    { word: "ordinary", phonetic: "/ˈɔːrdəneri/", pos: "adj.", definition_zh: "普通的；平常的", example: "He was just an ordinary student who worked very hard.", example_zh: "他只是一個非常努力的普通學生。", usage: [{ pattern: "out of the ordinary", meaning_zh: "不同尋常的" }] },
    { word: "precious", phonetic: "/ˈpreʃəs/", pos: "adj.", definition_zh: "珍貴的；寶貴的", example: "Time is precious, so use it wisely.", example_zh: "時間是寶貴的，所以要善加利用。", usage: [{ pattern: "precious time", meaning_zh: "寶貴的時間" }] },
    { word: "qualify", phonetic: "/ˈkwɒlɪfaɪ/", pos: "v.", definition_zh: "取得資格；使具備資格", example: "You need to pass the test to qualify for the program.", example_zh: "你需要通過測試才能獲得該計畫的資格。", usage: [{ pattern: "qualify for sth", meaning_zh: "取得某事的資格" }] },
    { word: "release", phonetic: "/rɪˈliːs/", pos: "v.", definition_zh: "釋放；發布", example: "The singer will release a new album next month.", example_zh: "這位歌手下個月將發行新專輯。", usage: [{ pattern: "release sb from sth", meaning_zh: "從某事中釋放某人" }] },
  ];
}
