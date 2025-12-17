// ربات تلگرام AI Toolbox
// Telegram: t.me/aminiytblog

/*
دستورات SQL برای D1:

CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, user_id TEXT NOT NULL UNIQUE, username TEXT, first_name TEXT, is_admin INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE settings (id INTEGER PRIMARY KEY AUTOINCREMENT, key TEXT NOT NULL UNIQUE, value TEXT NOT NULL);

CREATE TABLE anonymous_links (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, link_code TEXT NOT NULL UNIQUE, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE anonymous_messages (id INTEGER PRIMARY KEY AUTOINCREMENT, link_id INTEGER NOT NULL, sender_id TEXT NOT NULL, message TEXT NOT NULL, is_read INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE fortune_quizzes (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_id TEXT NOT NULL, quiz_code TEXT NOT NULL UNIQUE, questions TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

CREATE TABLE fortune_answers (id INTEGER PRIMARY KEY AUTOINCREMENT, quiz_id INTEGER NOT NULL, responder_id TEXT NOT NULL, answers TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP);

INSERT INTO settings (key, value) VALUES ('channel_id', '@aminiytblog');
INSERT INTO settings (key, value) VALUES ('bot_active', '1');
*/

// ⚠️ این ۳ خط را ویرایش کنید:
const API_KEY = '5007870012:AAF1hNYiirpSRaAgb2AuLsmWhqK8a3rYOKQ';
const BOT_USERNAME = 'aminiytblog_bot';
const ADMINS = ['admin1', 'admin2'];

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const db = env.DB;
    const kv = env.KV;

    // ======== توابع ========

    async function sendTelegram(method, params) {
      try {
        const response = await fetch(`https://api.telegram.org/bot${API_KEY}/${method}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return await response.json();
      } catch (e) {
        return { ok: false };
      }
    }

    async function sendMessage(chatId, text, keyboard = null) {
      const params = { chat_id: chatId, text: text, parse_mode: 'HTML' };
      if (keyboard) params.reply_markup = { inline_keyboard: keyboard };
      return sendTelegram('sendMessage', params);
    }

    async function checkMembership(userId) {
      try {
        let channelId = '@aminiytblog';
        try {
          const s = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('channel_id').first();
          if (s) channelId = s.value;
        } catch (e) {}

        const r = await sendTelegram('getChatMember', { chat_id: channelId, user_id: userId });
        if (r.ok) return ['member', 'administrator', 'creator'].includes(r.result.status);
        return false;
      } catch (e) {
        return true;
      }
    }

    function isAdmin(username) {
      if (!username) return false;
      return ADMINS.map(a => a.toLowerCase()).includes(username.toLowerCase());
    }

    function generateCode() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
      let code = '';
      for (let i = 0; i < 8; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
      return code;
    }

    // ======== صفحه تست ========
    if (url.pathname === '/' || url.pathname === '/test') {
      return new Response(`✅ Bot Running\nDB: ${db ? 'OK' : 'NO'}\nKV: ${kv ? 'OK' : 'NO'}`, { status: 200 });
    }

    // ======== Webhook ========
    if (url.pathname === '/setwebhook') {
      const r = await sendTelegram('setWebhook', { url: `${url.origin}/webhook` });
      return new Response(JSON.stringify(r), { headers: { 'Content-Type': 'application/json' } });
    }

    // ======== پردازش ========
    if (url.pathname === '/webhook' && request.method === 'POST') {
      try {
        const update = await request.json();

        // ===== پیام =====
        if (update.message) {
          const chatId = update.message.chat.id;
          const userId = update.message.from.id;
          const username = update.message.from.username || '';
          const firstName = update.message.from.first_name || 'کاربر';
          const text = update.message.text || '';

          // ذخیره کاربر
          try {
            await db.prepare('INSERT OR IGNORE INTO users (user_id, username, first_name, is_admin) VALUES (?, ?, ?, ?)').bind(String(userId), username, firstName, isAdmin(username) ? 1 : 0).run();
          } catch (e) {}

          // ===== /start =====
          if (text.startsWith('/start')) {
            const parts = text.split(' ');
            const param = parts.length > 1 ? parts[1] : null;

            // ===== لینک چت ناشناس (بدون چک عضویت) =====
            if (param && param.startsWith('anon_')) {
              const linkCode = param.replace('anon_', '');
              try {
                const link = await db.prepare('SELECT * FROM anonymous_links WHERE link_code = ?').bind(linkCode).first();
                if (link) {
                  if (link.owner_id === String(userId)) {
                    await sendMessage(chatId, '⚠️ نمی‌توانید به خودتان پیام ناشناس بفرستید!');
                  } else {
                    await kv.put(`anon_${userId}`, linkCode, { expirationTtl: 3600 });
                    await sendMessage(chatId, '📩 <b>چت ناشناس</b>\n\n✍️ پیام خود را بنویسید.\nهویت شما مخفی خواهد ماند.');
                  }
                  return new Response('ok');
                }
              } catch (e) {}
            }

            // ===== لینک آینده‌بین (بدون چک عضویت) =====
            if (param && param.startsWith('fortune_')) {
              const quizCode = param.replace('fortune_', '');
              try {
                const quiz = await db.prepare('SELECT * FROM fortune_quizzes WHERE quiz_code = ?').bind(quizCode).first();
                if (quiz) {
                  if (quiz.owner_id === String(userId)) {
                    await sendMessage(chatId, '⚠️ نمی‌توانید به چالش خودتان جواب دهید!');
                  } else {
                    const questions = JSON.parse(quiz.questions);
                    await kv.put(`fortune_${userId}`, JSON.stringify({
                      quizId: quiz.id,
                      ownerId: quiz.owner_id,
                      questions: questions,
                      index: 0,
                      answers: []
                    }), { expirationTtl: 3600 });
                    await sendMessage(chatId, `🔮 <b>آینده‌بین</b>\n\n🎯 شما به چالش دعوت شدید!\n📝 تعداد سوالات: ${questions.length}\n\n<b>سوال ۱:</b>\n${questions[0]}`);
                  }
                  return new Response('ok');
                }
              } catch (e) {}
            }

            // ===== منوی اصلی (با چک عضویت) =====
            const isMember = await checkMembership(userId);

            if (isMember) {
              const keyboard = [
                [{ text: '🤖 ابزارهای هوش مصنوعی', callback_data: 'menu_ai' }],
                [
                  { text: '💬 چت ناشناس', callback_data: 'menu_anon' },
                  { text: '🔮 آینده‌بین', callback_data: 'menu_fortune' }
                ]
              ];
              if (isAdmin(username)) {
                keyboard.push([{ text: '⚙️ پنل مدیریت', callback_data: 'admin_panel' }]);
              }
              await sendMessage(chatId, `👋 سلام <b>${firstName}</b>!\n\n🎉 به جعبه ابزار خوش آمدید!`, keyboard);
            } else {
              await sendMessage(chatId, '⚠️ برای استفاده از ربات، ابتدا در کانال عضو شوید.', [
                [{ text: '📢 عضویت', url: 'https://t.me/aminiytblog' }],
                [{ text: '✅ بررسی', callback_data: 'check_membership' }]
              ]);
            }
            return new Response('ok');
          }

          // ===== پیام ناشناس =====
          try {
            const anonCode = await kv.get(`anon_${userId}`);
            if (anonCode && text) {
              const link = await db.prepare('SELECT * FROM anonymous_links WHERE link_code = ?').bind(anonCode).first();
              if (link) {
                await db.prepare('INSERT INTO anonymous_messages (link_id, sender_id, message) VALUES (?, ?, ?)').bind(link.id, String(userId), text).run();
                await sendMessage(link.owner_id, `📩 <b>پیام ناشناس جدید!</b>\n\n💬 ${text}`, [
                  [{ text: '↩️ پاسخ', callback_data: `reply_${userId}` }]
                ]);
                await sendMessage(chatId, '✅ پیام ناشناس ارسال شد!');
                await kv.delete(`anon_${userId}`);
              }
              return new Response('ok');
            }
          } catch (e) {}

          // ===== پاسخ به ناشناس =====
          try {
            const replyTo = await kv.get(`reply_${userId}`);
            if (replyTo && text) {
              await sendMessage(replyTo, `📩 <b>پاسخ از طرف صاحب لینک:</b>\n\n💬 ${text}`);
              await sendMessage(chatId, '✅ پاسخ ارسال شد!');
              await kv.delete(`reply_${userId}`);
              return new Response('ok');
            }
          } catch (e) {}

          // ===== جواب آینده‌بین =====
          try {
            const fortuneData = await kv.get(`fortune_${userId}`);
            if (fortuneData && text) {
              const session = JSON.parse(fortuneData);
              session.answers.push(text);
              session.index++;

              if (session.index < session.questions.length) {
                await kv.put(`fortune_${userId}`, JSON.stringify(session), { expirationTtl: 3600 });
                await sendMessage(chatId, `<b>سوال ${session.index + 1}:</b>\n${session.questions[session.index]}`);
              } else {
                await db.prepare('INSERT INTO fortune_answers (quiz_id, responder_id, answers) VALUES (?, ?, ?)').bind(session.quizId, String(userId), JSON.stringify(session.answers)).run();

                let result = '🔮 <b>جواب‌های جدید دریافت شد!</b>\n\n';
                session.questions.forEach((q, i) => {
                  result += `<b>س:</b> ${q}\n<b>ج:</b> ${session.answers[i]}\n\n`;
                });
                await sendMessage(session.ownerId, result);
                await sendMessage(chatId, '✅ ممنون! جواب‌ها به صاحب چالش ارسال شد.');
                await kv.delete(`fortune_${userId}`);
              }
              return new Response('ok');
            }
          } catch (e) {}

          // ===== تنظیم کانال =====
          try {
            const settingCh = await kv.get(`setch_${userId}`);
            if (settingCh && text && isAdmin(username)) {
              await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('channel_id', text).run();
              await sendMessage(chatId, `✅ کانال به ${text} تغییر کرد.`);
              await kv.delete(`setch_${userId}`);
              return new Response('ok');
            }
          } catch (e) {}

          // ===== ساخت سوالات آینده‌بین =====
          try {
            const creating = await kv.get(`newfortune_${userId}`);
            if (creating && text) {
              const session = JSON.parse(creating);
              session.questions.push(text);

              if (session.questions.length === 10) {
                const code = generateCode();
                await db.prepare('INSERT INTO fortune_quizzes (owner_id, quiz_code, questions) VALUES (?, ?, ?)').bind(String(userId), code, JSON.stringify(session.questions)).run();
                await sendMessage(chatId, `✅ <b>چالش ۱۰ سوالی شما ساخته شد!</b>\n\n🔗 لینک:\n<code>https://t.me/${BOT_USERNAME}?start=fortune_${code}</code>\n\nاین لینک را برای دوستان بفرستید.`);
                await kv.delete(`newfortune_${userId}`);
              } else {
                await kv.put(`newfortune_${userId}`, JSON.stringify(session), { expirationTtl: 3600 });
                await sendMessage(chatId, `✅ سوال ${session.questions.length} ثبت شد.\n\n📝 <b>سوال ${session.questions.length + 1} از 10</b> را بنویسید:`);
              }
              return new Response('ok');
            }
          } catch (e) {}
        }

        // ===== دکمه‌ها =====
        if (update.callback_query) {
          const cb = update.callback_query;
          const chatId = cb.message.chat.id;
          const userId = cb.from.id;
          const username = cb.from.username || '';
          const data = cb.data;

          await sendTelegram('answerCallbackQuery', { callback_query_id: cb.id });

          // بررسی عضویت
          if (data === 'check_membership') {
            if (await checkMembership(userId)) {
              await sendMessage(chatId, '✅ عضویت تایید شد! /start بزنید.');
            } else {
              await sendMessage(chatId, '❌ هنوز عضو نشدید.');
            }
            return new Response('ok');
          }

          // منوی AI
          if (data === 'menu_ai') {
            await sendMessage(chatId, '🤖 <b>ابزارهای هوش مصنوعی</b>', [
              [
                { text: '🔧 10015', web_app: { url: 'https://10015.io' } },
                { text: '🧠 DeepSeek', web_app: { url: 'https://chat.deepseek.com' } }
              ],
              [
                { text: '💬 ChatGPT', web_app: { url: 'https://chatgpt.com' } },
                { text: '📊 TweetScout', web_app: { url: 'https://app.tweetscout.io' } }
              ],
              [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
            ]);
            return new Response('ok');
          }

          // منوی چت ناشناس
          if (data === 'menu_anon') {
            let linkCode;
            try {
              const existing = await db.prepare('SELECT link_code FROM anonymous_links WHERE owner_id = ?').bind(String(userId)).first();
              if (existing) {
                linkCode = existing.link_code;
              } else {
                linkCode = generateCode();
                await db.prepare('INSERT INTO anonymous_links (owner_id, link_code) VALUES (?, ?)').bind(String(userId), linkCode).run();
              }
            } catch (e) {
              linkCode = generateCode();
            }

            await sendMessage(chatId, `💬 <b>چت ناشناس</b>\n\n🔗 لینک شما:\n<code>https://t.me/${BOT_USERNAME}?start=anon_${linkCode}</code>\n\nاین لینک را به اشتراک بگذارید تا پیام ناشناس دریافت کنید.`, [
              [{ text: '📨 پیام‌های من', callback_data: 'my_messages' }],
              [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
            ]);
            return new Response('ok');
          }

          // پیام‌های من
          if (data === 'my_messages') {
            try {
              const msgs = await db.prepare(`
                SELECT am.message FROM anonymous_messages am
                JOIN anonymous_links al ON am.link_id = al.id
                WHERE al.owner_id = ? ORDER BY am.id DESC LIMIT 10
              `).bind(String(userId)).all();

              if (!msgs.results || msgs.results.length === 0) {
                await sendMessage(chatId, '📭 هنوز پیامی ندارید.');
              } else {
                let txt = '📩 <b>پیام‌های اخیر:</b>\n\n';
                msgs.results.forEach((m, i) => txt += `${i + 1}. ${m.message}\n\n`);
                await sendMessage(chatId, txt);
              }
            } catch (e) {
              await sendMessage(chatId, '📭 پیامی یافت نشد.');
            }
            return new Response('ok');
          }

          // پاسخ به ناشناس
          if (data.startsWith('reply_')) {
            const targetId = data.replace('reply_', '');
            await kv.put(`reply_${userId}`, targetId, { expirationTtl: 300 });
            await sendMessage(chatId, '✍️ پاسخ خود را بنویسید:');
            return new Response('ok');
          }

          // منوی آینده‌بین
          if (data === 'menu_fortune') {
            await sendMessage(chatId, '🔮 <b>آینده‌بین</b>\n\nچالش بسازید و لینک را برای دوستان بفرستید.\nآن‌ها به سوالات شما جواب می‌دهند!', [
              [{ text: '➕ ساخت چالش جدید', callback_data: 'new_fortune' }],
              [{ text: '📋 جواب‌های دریافتی', callback_data: 'my_answers' }],
              [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
            ]);
            return new Response('ok');
          }

          // ساخت چالش جدید
          if (data === 'new_fortune') {
            await kv.put(`newfortune_${userId}`, JSON.stringify({ questions: [] }), { expirationTtl: 3600 });
            await sendMessage(chatId, '🔮 <b>ساخت چالش آینده‌بین</b>\n\nشما باید ۱۰ سوال طراحی کنید.\n\n📝 <b>سوال اول را بنویسید:</b>');
            return new Response('ok');
          }

          // جواب‌های دریافتی
          if (data === 'my_answers') {
            try {
              const answers = await db.prepare(`
                SELECT fa.answers, fq.questions FROM fortune_answers fa
                JOIN fortune_quizzes fq ON fa.quiz_id = fq.id
                WHERE fq.owner_id = ? ORDER BY fa.id DESC LIMIT 5
              `).bind(String(userId)).all();

              if (!answers.results || answers.results.length === 0) {
                await sendMessage(chatId, '📭 هنوز جوابی دریافت نکردید.');
              } else {
                let txt = '🔮 <b>جواب‌های دریافتی:</b>\n\n';
                answers.results.forEach((a, idx) => {
                  const qs = JSON.parse(a.questions);
                  const ans = JSON.parse(a.answers);
                  txt += `<b>پاسخ ${idx + 1}:</b>\n`;
                  qs.forEach((q, i) => txt += `س: ${q}\nج: ${ans[i] || '-'}\n`);
                  txt += '\n';
                });
                await sendMessage(chatId, txt);
              }
            } catch (e) {
              await sendMessage(chatId, '📭 جوابی یافت نشد.');
            }
            return new Response('ok');
          }

          // پنل مدیریت
          if (data === 'admin_panel') {
            if (!isAdmin(username)) {
              await sendMessage(chatId, '❌ دسترسی ندارید.');
              return new Response('ok');
            }

            let userCount = 0, channelId = '@aminiytblog', botActive = '1';
            try {
              const uc = await db.prepare('SELECT COUNT(*) as c FROM users').first();
              userCount = uc?.c || 0;
              const ch = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('channel_id').first();
              if (ch) channelId = ch.value;
              const ba = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('bot_active').first();
              if (ba) botActive = ba.value;
            } catch (e) {}

            await sendMessage(chatId, `⚙️ <b>پنل مدیریت</b>\n\n👥 کاربران: ${userCount}\n📢 کانال: ${channelId}\n🔌 وضعیت: ${botActive === '1' ? '✅ روشن' : '❌ خاموش'}`, [
              [{ text: botActive === '1' ? '🔴 خاموش کردن' : '🟢 روشن کردن', callback_data: 'toggle_bot' }],
              [{ text: '📢 تغییر کانال', callback_data: 'change_channel' }],
              [{ text: '📊 آمار کامل', callback_data: 'full_stats' }],
              [{ text: '🔙 بازگشت', callback_data: 'back_main' }]
            ]);
            return new Response('ok');
          }

          // روشن/خاموش
          if (data === 'toggle_bot' && isAdmin(username)) {
            try {
              const current = await db.prepare('SELECT value FROM settings WHERE key = ?').bind('bot_active').first();
              const newVal = (current?.value === '1') ? '0' : '1';
              await db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').bind('bot_active', newVal).run();
              await sendMessage(chatId, `✅ ربات ${newVal === '1' ? 'روشن' : 'خاموش'} شد.`);
            } catch (e) {}
            return new Response('ok');
          }

          // تغییر کانال
          if (data === 'change_channel' && isAdmin(username)) {
            await kv.put(`setch_${userId}`, '1', { expirationTtl: 300 });
            await sendMessage(chatId, '📢 آیدی کانال جدید را بفرستید:\n(مثال: @channel)');
            return new Response('ok');
          }

          // آمار کامل
          if (data === 'full_stats' && isAdmin(username)) {
            let users = 0, msgs = 0, quizzes = 0;
            try {
              const u = await db.prepare('SELECT COUNT(*) as c FROM users').first();
              const m = await db.prepare('SELECT COUNT(*) as c FROM anonymous_messages').first();
              const q = await db.prepare('SELECT COUNT(*) as c FROM fortune_quizzes').first();
              users = u?.c || 0;
              msgs = m?.c || 0;
              quizzes = q?.c || 0;
            } catch (e) {}
            await sendMessage(chatId, `📊 <b>آمار کامل</b>\n\n👥 کاربران: ${users}\n💬 پیام‌های ناشناس: ${msgs}\n🔮 چالش‌های آینده‌بین: ${quizzes}`);
            return new Response('ok');
          }

          // بازگشت
          if (data === 'back_main') {
            const keyboard = [
              [{ text: '🤖 ابزارهای AI', callback_data: 'menu_ai' }],
              [
                { text: '💬 چت ناشناس', callback_data: 'menu_anon' },
                { text: '🔮 آینده‌بین', callback_data: 'menu_fortune' }
              ]
            ];
            if (isAdmin(username)) {
              keyboard.push([{ text: '⚙️ پنل مدیریت', callback_data: 'admin_panel' }]);
            }
            await sendMessage(chatId, '🏠 <b>منوی اصلی</b>', keyboard);
            return new Response('ok');
          }
        }

        return new Response('ok');
      } catch (e) {
        return new Response('ok');
      }
    }

    return new Response('Bot OK', { status: 200 });
  }
};
