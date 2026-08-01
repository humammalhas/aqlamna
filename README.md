# أقلامنا — Aqlamna

أول محرك قصص تفاعلية مبني للعربية من الأساس — ليس مجرد ترجمة لأداة إنجليزية.
تكتب قصتك في بطاقات وحقول دون أيّ رمز، فيخرج لك ملفّ HTML واحد يعمل دون إنترنت.

**جرّبه الآن على [aqlamna.org](https://aqlamna.org)** — يعمل في المتصفح، دون تثبيت ودون حساب.

## هكذا تكتب

تفتح المحرر فتجد بطاقة مقطع واحدة: حقل لاسمه، وصندوق لنصّه، وزرّ لإضافة خيار. الخيار
يسألك ما يقرأه القارئ وإلى أيّ مقطع ينقله — تختاره من قائمة مقاطعك. لا `===` ولا `->`
ولا أقواس.

وحين تحتاج أكثر:

- **أثر** — علامة تضعها القصة على القارئ لتتذكّر شيئًا فعله. موجود أو غائب.
- **عدّاد** — رقم يزيد كلّما اختار القارئ شيئًا.
- **نصّ مشروط** — فقرة لا يراها إلا من ينطبق عليه الشرط.
- **شرط ظهور الخيار** — زرّ لا يظهر إلا لمن يستحقّه.
- **صورة** — تصفها بالعربية وتضغط زرًّا، فتظهر في المقطع وفي الملفّ المصدَّر. ولا يلزمك
  أن تكتب الوصف بنفسك: زرّ **✨ اقترح من النصّ** يقرأ ما كتبته في المقطع ويكتبه لك.

ثمّ تضغط **▶ شغّل** لتجرّبها، و**⬇ تصدير** لتأخذها معك.

الدليل الكامل في [docs/البداية.md](./docs/البداية.md) — إحدى عشرة خطوة، دون رمز واحد.

## واللغة تحت الحقول

المحرر لا يخفي شيئًا: هو يكتب لغة أقلامنا (`.qalam`) نيابةً عنك، ويمكنك رؤيتها وتحريرها
من **⚙️ الإعدادات ← وضع المحرر ← متقدّم**.

```qalam
عنوان: "الجرّة"

=== البداية ===

على الرفّ جرّةٌ مغلقة. رائحةٌ تتسلّل من تحت غطائها.

* [افتح الجرّة]
  رفعتَ الغطاءَ ففاح عطر اليانسون.
  -> نهاية
```

هذا ما تولّده بطاقتان وخيار واحد. اللغة أوسع من الحقول — فيها خيارات متداخلة وأنفاق
وقوائم — وكلّها في [docs/المرجع.md](./docs/المرجع.md). لست مضطرًّا إلى قراءتها لتكتب قصة.

## البداية السريعة

```bash
npm install
npm run build:all
npm test
npm run dev -w @aqlamna/editor
```

الأمر الأخير يفتح المحرر على `http://localhost:5173`.

## مفتاحك يبقى عندك

مزايا الذكاء الاصطناعي — اقتراح الخيارات وإكمال المقطع ورسم الصور — تعمل بمفتاح تختاره
أنت من مزوّدك. يُحفظ المفتاح في متصفّحك وحده، ويذهب إلى المزوّد مباشرة. لا يمرّ بخادم
لنا، فنحن لا نملك خادمًا أصلًا. القصص كلّها تبقى على جهازك.

**الترخيص:** GPL-3.0

وجدت خطأ؟ عندك فكرة؟ [أبلغ عن خطأ](https://github.com/humammalhas/aqlamna/issues/new?template=bug.yml) أو [اقترح فكرة](https://github.com/humammalhas/aqlamna/issues/new?template=idea.yml) على GitHub. لا تستخدم GitHub؟ راسلنا على admin@almaseer.co. تذكّر: التبليغات عامة — لا تنسخ مفتاح API أبدًا.

---

The first interactive fiction engine built for Arabic from the ground up — not a
translation layer on top of an English tool. You write in cards and fields, with no
syntax at all, and it exports one HTML file that plays offline.

**Live at [aqlamna.org](https://aqlamna.org)** — runs in the browser, no install, no account.

### How you write

The editor opens on a single scene card: a field for its name, a box for its prose, and a
button to add a choice. A choice asks what the reader clicks and which scene it leads to —
picked from a dropdown of your own scenes. No `===`, no `->`, no braces.

When you need more: a **tag** (a flag the story remembers), a **counter** (a number that
goes up), **conditional text** (a paragraph only some readers see), a **gated choice** (a
button that only appears when a condition holds), and an **illustration** — describe it in
Arabic, press a button, and it is drawn and inlined into the exported file. A **✨ suggest**
button writes that description from the scene's own prose, so you never phrase a prompt.

The full walkthrough is [docs/البداية.md](./docs/البداية.md) — eleven steps, no code.

### The language underneath

Nothing is hidden. The editor writes `.qalam` on your behalf, and
**⚙️ Settings → وضع المحرر → متقدّم** shows it in a CodeMirror pane, where you can edit it
by hand. Switching back re-reads it. If you use something the form has no field for —
tunnels, nested choices, lists — the visual writer says so by name and offers you the code
editor rather than dropping it.

`.qalam` is also the export format and the file you share. The reference is
[docs/المرجع.md](./docs/المرجع.md).

### Quick start

```bash
npm install
npm run build:all
npm test
npm run dev -w @aqlamna/editor
```

The last command opens the editor at `http://localhost:5173`.

### Bring your own key

The AI features — suggesting choices, continuing a scene, generating illustrations — run on
a key you supply from your own provider. It is stored in your browser's localStorage and
sent straight to that provider. It never passes through a server of ours, because there is
no server of ours. Your stories stay on your machine.

**License:** GPL-3.0
