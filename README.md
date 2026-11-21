# Kaleidoscope · קליידוסקופ

אתר המוצר: דף נחיתה, מדריכים, ושני כלי דפדפן.

| נתיב | מה יש שם |
|---|---|
| `/` | דף הנחיתה (`index.html`) |
| `/guides` | מדריכים קצרים (`guides.html`) |
| `/builder` | Kaleidoscope Box Builder: תכנון הקופסה, פריסה ללייזר, מבט אמיתי דרך המראות (`kaleidoscope-builder.html`) |
| `/studio` | Kaleidoscope Studio: התמונה למסך שמאחורי המראות (`kaleidoscope-studio.html`) |
| `/phone` | קליידוסקופ לטלפון: תבנית לתפסנית לפי דגם, הדגמת תלת-ממד, ואפליקציית מסך מפוצל (`kaleidoscope-phone.html`, האפליקציה ב-`/phone#app`) |
| `/show` | אותו סטודיו, נפתח ישר במופע הסלפי האוטומטי (זיהוי פנים, מצלמת USB) במסך מלא. כולל "מופע דקה": 4 סלפי על הביט, סגנונות תמונה (קומיקס, צבעי מים, דיו ועוד), פסקול MIDI מקורי והקלטה לסרטון |
| `/download/kaleidoscope-studio.zip` | שני הכלים להרצה בלי אינטרנט, עם מפעילים ל-Windows ול-macOS |

הכול סטטי, בלי שלב בנייה. Vercel מגיש את התיקייה כמו שהיא (`vercel.json` מגדיר את הנתיבים הקצרים).

## פיתוח

- `src/builder.src.html` הוא מקור המחולל (פורמט Artifact, טוען three.js מ-CDN). `tools/build.sh` מייצר ממנו את `kaleidoscope-builder.html` עם three.js בפנים, כך שהוא עובד גם בלי רשת.
- `src/studio.src.html` הוא גרסת ה-Artifact של הסטודיו. `kaleidoscope-studio.html` הוא הגרסה העצמאית.
- `kaleidoscope-phone.html` עצמאי, בלי שלב בנייה. הוא טוען את `assets/three.min.js` (העתק של `src/three.min.js`) ואת `assets/qrcode-generator.js` (MIT) רק כשצריך.
- מופע הסלפי: המקור ב-`src/selfie-show.js`. אחרי שינוי מריצים `python3 tools/inline-selfie.py`, שמעתיק אותו לשני קובצי הסטודיו. זיהוי הפנים (MediaPipe Tasks Vision 0.10.21 ומודל BlazeFace, רישיון Apache 2.0) נמצא ב-`vendor/mediapipe/`, כדי שיעבוד גם בלי אינטרנט.
- הרצה מקומית: `python3 -m http.server 8767` ואז http://127.0.0.1:8767

## פריסה ל-Vercel

ב-Vercel: Add New → Project → בוחרים את המאגר הזה → Framework Preset: **Other** → Deploy. אין פקודת בנייה ואין תיקיית פלט. מאז, כל push ל-`main` עולה לבד.
