# أقلامنا — Aqlamna

أول محرك قصص تفاعلية مبني للعربية من الأساس — ليس مجرد ترجمة لأداة إنجليزية.
فكّر "توين + إنك، لكن بالعربية." محرر مرئي للعقد يولّد لغة برمجة نصية قابلة للقراءة،
تُصرّف إلى قصص قابلة للتشغيل في المتصفح.

**جرّبه الآن على [aqlamna.org](https://aqlamna.org)** — يعمل في المتصفح، دون تثبيت ودون حساب.

## هكذا تبدو القصة

```qalam
عنوان: "الجرّة"

=== البداية ===

على الرفّ جرّةٌ مغلقة. رائحةٌ تتسلّل من تحت غطائها.

* [افتحي الجرّة] رفعتِ الغطاءَ ففاح عطر اليانسون.
  -> نهاية
```

تكتب هذا، فيخرج لك ملف HTML واحد يعمل دون إنترنت ودون أيّ مكتبة خارجية.

## البداية السريعة

```bash
npm install
npm run build:all
npm test
npm run dev -w @aqlamna/editor
```

الأمر الأخير يفتح المحرر على `http://localhost:5173`.

## مفتاحك يبقى عندك

مزايا الذكاء الاصطناعي — اقتراح الخيارات وإكمال المشهد ورسم الصور — تعمل بمفتاح
تختاره أنت من مزوّدك. يُحفظ المفتاح في متصفّحك وحده، ويذهب إلى المزوّد مباشرة.
لا يمرّ بخادم لنا، فنحن لا نملك خادمًا أصلًا. القصص كلّها تبقى على جهازك.

**الترخيص:** GPL-3.0

وجدت خطأ؟ عندك فكرة؟ [أبلغ عن خطأ](https://github.com/humammalhas/aqlamna/issues/new?template=bug.yml) أو [اقترح فكرة](https://github.com/humammalhas/aqlamna/issues/new?template=idea.yml) على GitHub. لا تستخدم GitHub؟ راسلنا على admin@almaseer.co. تذكّر: التبليغات عامة — لا تنسخ مفتاح API أبدًا.

---

The first interactive fiction engine built for Arabic from the ground up — not a
translation layer on top of an English tool. Think "Twine + Ink, but Arabic-native."
A visual node editor that generates a readable scripting language, compiling to
playable stories in the browser.

**Live at [aqlamna.org](https://aqlamna.org)** — runs in the browser, no install, no account.

### What a story looks like

The example above declares a title, opens the passage `البداية`, prints a line of
prose, and offers one choice that diverts to `نهاية` (END). Keywords are Arabic;
English aliases work too. It exports to a single HTML file that plays offline with
zero dependencies.

### Quick start

```bash
npm install
npm run build:all
npm test
npm run dev -w @aqlamna/editor
```

The last command opens the editor at `http://localhost:5173`.

### Bring your own key

The AI features — suggesting choices, continuing a scene, generating illustrations —
run on a key you supply from your own provider. It is stored in your browser's
localStorage and sent straight to that provider. It never passes through a server of
ours, because there is no server of ours. Your stories stay on your machine.

**License:** GPL-3.0
