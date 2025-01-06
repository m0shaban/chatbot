/************************************************************
 * index.js
 * شات بوت فيسبوك ماسنجر مدمج مع Dialogflow ES باستخدام Node.js
 * مع إضافة قسم تجريبي لاستدعاء Gemini (Generative Language API).
 ************************************************************/

require('dotenv').config(); // لتحميل متغيرات البيئة من .env
const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const dialogflow = require('@google-cloud/dialogflow');

// ========== المتغيرات من .env ==========
const PORT = process.env.PORT || 3000;
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const DIALOGFLOW_PROJECT_ID = process.env.DIALOGFLOW_PROJECT_ID;

// إن كنت ستستخدم Gemini مستقبلاً:
// const GEMINI_API_KEY = process.env.GEMINI_API_KEY || ''; // مثال

// إنشاء عميل Dialogflow
const sessionClient = new dialogflow.SessionsClient();

const app = express();
app.use(bodyParser.json());

// ----------------------------------------------------
// Webhook Verification (GET /webhook)
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
// Messenger Events (POST /webhook)
// ----------------------------------------------------
app.post('/webhook', (req, res) => {
  const body = req.body;

  // تأكد أن الحدث من نوع صفحة فيسبوك
  if (body.object === 'page') {
    body.entry.forEach(entry => {
      // قد يحتوي entry على عدة أحداث، هنا نأخذ الأول تبسيطًا
      const webhookEvent = entry.messaging[0];
      console.log('Incoming event:', webhookEvent);

      const senderPsid = webhookEvent.sender.id; // المرسل (العميل)
      
      // هل هو Message أم Postback؟
      if (webhookEvent.message) {
        handleMessage(senderPsid, webhookEvent.message);
      } else if (webhookEvent.postback) {
        // handlePostback(senderPsid, webhookEvent.postback);
      }
    });
    // رد 200 لفيسبوك
    return res.status(200).send('EVENT_RECEIVED');
  } else {
    // إذا لم يكن من نوع page
    return res.sendStatus(404);
  }
});

// ----------------------------------------------------
// handleMessage: استقبال النص من المستخدم
// ----------------------------------------------------
async function handleMessage(senderPsid, receivedMessage) {
  if (!receivedMessage.text) {
    // إذا الرسالة ليست نصًا (صورة/ملف مثلًا)، نرد برد بسيط
    await sendMessage(senderPsid, { text: 'I can only handle text messages for now.' });
    return;
  }

  const userText = receivedMessage.text;
  console.log(`User said: ${userText}`);

  // ===== اختيار: هل تريد استدعاء Gemini أم Dialogflow أم كلاهما؟ =====
  // مثال بسيط:
  // إذا كتب المستخدم عبارة فيها كلمة "gemini" نرسلها لـ Gemini بدلًا من Dialogflow
  if (userText.toLowerCase().includes('gemini')) {
    // استدعاء Gemini
    const geminiReply = await callGeminiAPI(userText);
    await sendMessage(senderPsid, { text: geminiReply });
  } else {
    // نرسل النص إلى Dialogflow
    const dialogflowResponse = await sendToDialogflow(userText, senderPsid);

    // قراءة fulfillmentText
    const responseText = dialogflowResponse.fulfillmentText || "I'm not sure I understand.";
    await sendMessage(senderPsid, { text: responseText });
  }
}

// ----------------------------------------------------
// sendToDialogflow: استدعاء detectIntent
// ----------------------------------------------------
async function sendToDialogflow(text, sessionId) {
  const sessionPath = sessionClient.projectAgentSessionPath(DIALOGFLOW_PROJECT_ID, sessionId);

  const request = {
    session: sessionPath,
    queryInput: {
      text: {
        text: text,
        languageCode: 'en' // أو ar إذا تريد العربية
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
// callGeminiAPI: دالة تجريبية لاستدعاء Gemini
// ----------------------------------------------------
async function callGeminiAPI(prompt) {
  try {
    // مثال وهمي باستخدام axios:
    // const apiUrl = 'https://generativelanguage.googleapis.com/v1beta1/gemini:generateText';
    // const response = await axios.post(
    //   apiUrl,
    //   { prompt }, 
    //   {
    //     headers: {
    //       Authorization: `Bearer ${GEMINI_API_KEY}`,
    //       'Content-Type': 'application/json'
    //     }
    //   }
    // );
    // return response.data.generatedText;

    // حاليًا نرجع رد ثابت:
    return `**Gemini Mock Reply**: تحليل للنص [${prompt}]`;
  } catch (error) {
    console.error('Gemini API error:', error);
    return "Sorry, there's an error calling Gemini API.";
  }
}

// ----------------------------------------------------
// sendMessage: إرسال رسالة للمستخدم على ماسنجر
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
