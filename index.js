// index.js

const BOT_TOKEN = '1487488537:AAFMD2D59AxM1nnV79axRJOfgJth7J8s814';
const SUDO_USER_ID = 419573954;

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

addEventListener('scheduled', event => {
  event.waitUntil(handleScheduled());
});

async function handleRequest(request) {
  if (request.method === 'POST') {
    const update = await request.json();
    await handleUpdate(update);
    return new Response('OK', { status: 200 });
  }
  return new Response('Expected POST', { status: 405 });
}

async function handleUpdate(update) {
  if (update.message) {
    const message = update.message;
    const chatId = message.chat.id;
    const userId = message.from.id;

    // New member join
    if (message.new_chat_members && message.new_chat_members.length > 0) {
      for (const member of message.new_chat_members) {
        if (!member.is_bot) {
          await sendMessage(chatId, `BANALL ${member.id}`);
        }
      }
      return;
    }

    // Command handling
    if (message.text) {
        const text = message.text;
        // Updated regex to support Persian characters. Note: This requires the 'u' flag.
        const commandMatch = text.match(/^\/([\p{L}_]+)\s*(\d*)\s*(.*)/u) || text.match(/^([\p{L}_]+)\s*(\d*)\s*(.*)/u);
        if (!commandMatch) return;

        const [_, command, targetId, rest] = commandMatch;

        if (userId !== SUDO_USER_ID) return;

        switch (command) {
            case 'addadmin':
            case 'افزودن_ادمین':
                if (targetId) {
                    await ADMINS.put(targetId, 'true');
                    await sendMessage(chatId, `کاربر ${targetId} به لیست ادمین‌ها اضافه شد.`);
                } else {
                    await sendMessage(chatId, 'لطفاً یک شناسه کاربری معتبر وارد کنید.');
                }
                break;

            case 'deladmin':
            case 'حذف_ادمین':
                if (targetId) {
                    await ADMINS.delete(targetId);
                    await sendMessage(chatId, `کاربر ${targetId} از لیست ادمین‌ها حذف شد.`);
                } else {
                    await sendMessage(chatId, 'لطفاً یک شناسه کاربری معتبر وارد کنید.');
                }
                break;

            case 'setmessage':
            case 'تنظیم_پیام':
                const messageToSet = text.substring(text.indexOf(' ')).trim();
                if (messageToSet) {
                    await SETTINGS.put('CUSTOM_MESSAGE', messageToSet);
                    await sendMessage(chatId, 'پیام سفارشی با موفقیت تنظیم شد.');
                } else {
                    await sendMessage(chatId, 'لطفاً یک پیام برای تنظیم وارد کنید.');
                }
                break;

            case 'setchat':
            case 'تنظیم_چت':
                await SETTINGS.put('CHAT_ID', chatId.toString());
                await sendMessage(chatId, `چت برای پیام‌های زمان‌بندی شده با موفقیت تنظیم شد: ${chatId}`);
                break;
        }
    }
  }
}

async function handleScheduled() {
  const chatId = await SETTINGS.get('CHAT_ID');
  const customMessage = await SETTINGS.get('CUSTOM_MESSAGE');

  if (chatId && customMessage) {
    // Note: The Telegram API does not allow bots to get a list of all group members directly.
    // This function will send the custom message to the group chat itself, not to individual users.
    // The original request to message every non-admin user individually is not feasible and would lead to spam blocks.
    await sendMessage(chatId, customMessage);
  }
}

async function sendMessage(chatId, text) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: chatId,
    text: text,
  };

  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
}
