/************************************************************
 * index.js
 * شات بوت فيسبوك ماسنجر مدمج مع Dialogflow ES باستخدام Node.js
 ************************************************************/

require('dotenv').config(); // لتحميل متغيرات البيئة من .env
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dialogflow = require('@google-cloud/dialogflow');

// 1. قراءتها من ملف .env
const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const DIALOGFLOW_PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;

// 2. إنشاء عميل Dialogflow
const sessionClient = new dialogflow.SessionsClient();

const app = express();
app.use(bodyParser.json());

// ----------------------------------------------------
// التحقق من Webhook - فيسبوك يستدعي هذا العنوان (GET /webhook)
// ----------------------------------------------------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === VERIFY_TOKEN) {
    console.log('WEBHOOK_VERIFIED');
    return res.status(200).send(challenge);
  } else {
    return res.sendStatus(403);
  }
});

// ----------------------------------------------------
// استقبال رسائل الماسنجر - (POST /webhook)
// ----------------------------------------------------
app.post('/webhook', (req, res) => {
  const body = req.body;

  // تأكد أن الحدث من صفحة فيسبوك
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      // قد يحتوي entry على عدة أحداث، نأخذ الأول لغرض التبسيط
      const webhookEvent = entry.messaging[0];
      console.log('Incoming event:', webhookEvent);

      // معرف الشخص المرسل (Page Scoped ID)
      const senderPsid = webhookEvent.sender.id;

      // تحقق ما إذا كانت رسالة نصية أو Postback
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message);
      } else if (webhookEvent.postback) {
        // handlePostback(senderPsid, webhookEvent.postback);
      }
    });
    // الرد بـ 200 OK لفيسبوك
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    // إذا لم يكن من نوع page
    return res.sendStatus(404);
  }
});

// ----------------------------------------------------
// handleMessage: إرسال النص إلى Dialogflow واستقبال الرد
// ----------------------------------------------------
async function handleMessage(senderPsid, receivedMessage) {
  if (!receivedMessage.text) {
    // إذا الرسالة ليست نص (مثلاً صورة/ملف)، نتعامل برد بسيط
    await sendMessage(senderPsid, { text: 'I can only handle text messages for now.' });
    return;
  }

  const userText = receivedMessage.text;

  // نرسل النص إلى Dialogflow
  const dialogflowResponse = await sendToDialogflow(userText, senderPsid);

  // Dialogflow يعيد fulfillmentText عند تطابق Intent
  const responseText = dialogflowResponse.fulfillmentText || "I'm not sure I understand.";
  await sendMessage(senderPsid, { text: responseText });
}

// ----------------------------------------------------
// sendToDialogflow: دالة تستدعي detectIntent
// ----------------------------------------------------
async function sendToDialogflow(text, sessionId) {
  const sessionPath = sessionClient.projectAgentSessionPath(DIALOGFLOW_PROJECT_ID, sessionId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: text,
        languageCode: 'en' // أو "ar" إذا تستخدم العربية
      },
    },
  };

  try {
    const [response] = await sessionClient.detectIntent(request);
    console.log('Dialogflow response:', response.queryResult);
    return response.queryResult;
  } catch (err) {
    console.error('Dialogflow error:', err);
    return { fulfillmentText: 'Sorry, there was an error on the AI side.' };
  }
}

// ----------------------------------------------------
// sendMessage: يرسل رسالة إلى مستخدم الماسنجر عبر فيسبوك Graph API
// ----------------------------------------------------
async function sendMessage(senderPsid, response) {
  const requestBody = {
    recipient: { id: senderPsid },
    message: response,
  };

  try {
    await axios.post(
      `https://graph.facebook.com/v14.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`,
      requestBody
    );
    console.log('Message sent to user:', response);
  } catch (err) {
    console.error('Unable to send message:', err.response?.data || err.message);
  }
}

// ----------------------------------------------------
// تشغيل الخادم
// ----------------------------------------------------
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
