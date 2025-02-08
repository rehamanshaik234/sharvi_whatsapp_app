const express = require("express");
const cfenv = require("cfenv");
const appEnv = cfenv.getAppEnv();
const app = express();
const bodyParser = require("body-parser");
const twilio = require("twilio");
const https = require("https");
const axios = require("axios");

const agent = new https.Agent({
  rejectUnauthorized: false, 
});

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

const PORT = process.env.PORT || 3000;
const SAP_API_URL = "https://49.207.9.62:44325/pr/release?sap-client=100";
// const SAP_API_URL = 'http://10.10.6.113:8000/smart_app/pr_rel/release?sap-client=234'
const USERNAME = "s23hana3";
const PASSWORD = "Vision@2025";


const accountSid = "AC46614487d4b0f2e9e7f9b7f20de1673e";
// const accountSid ="AC18ae6e19cc87ab473e00a0b0c235e0fb"
const authToken = "4c4703bdcb61014e10ee21bacacbf8a1";
// const authToken = "4c63201ff48d98a69e425c694be3408f";
const twilioClient = twilio(accountSid, authToken);


const userData = {};

function getAuthHeader() {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`;
}

app.get("/", (req, res) => {
  res.send({ message: "Welcome to Twilio WhatsApp Automation!" });
});

const sentBANFNs = new Set();

async function sendInitialNotification() {
  try {
    console.log("Fetching SAP data for notification...");

    // Fetch SAP data
    const sapData = await fetchSapData();

    if (!sapData || sapData.length === 0) {
      console.log("No data fetched from SAP. Skipping notification.");
      return;
    }

    console.log(`Fetched ${sapData.length} records from SAP.`);

    // Filter new records
    const newRecords = filterNewRecords(sapData);
    console.log(`Found ${newRecords.length} new records.`);

    if (newRecords.length > 0) {
      // Convert data for notification
      const convertedData = convertSapData(newRecords);
      console.log("Converted Data:", JSON.stringify(convertedData, null, 2));

      // Send WhatsApp notification
      await sendWhatsAppNotification(convertedData);

      // Update tracker
      updateSentRecords(newRecords);
    } else {
      console.log("No new records to notify. Skipping notification.");
    }
  } catch (error) {
    console.error("Error sending notification:", error.message);
  }
}

// Helper Functions
async function fetchSapData() {
  const sapResponse = await axios.get(SAP_API_URL, {
    headers: {
      Authorization: getAuthHeader(),
      "Content-Type": "application/json",
    },
    httpsAgent: agent,
  });
  return sapResponse.data;
}

function filterNewRecords(sapData) {
  return sapData.filter((item) => !sentBANFNs.has(item.BANFN));
}

function updateSentRecords(newRecords) {
  newRecords.forEach((record) => sentBANFNs.add(record.BANFN));
}

function convertSapData(records) {
  const fieldMapping = {
    BANFN: "PR Number",
    BNFPO: "PR Item",
    MATNR: "Material",
    SHORT_TEXT: "Material Description",
    AFNAM: "Name of Requisitioner/Requester",
    WERKS: "Plant",
    BAMNG: "PR Quantity",
    EINDT: "Item Delivery Date",
    BAPREBAPI: "Price in Purchase Requisition",
  };

  return records.map((item) => {
    const formattedItem = {};
    for (const key in item) {
      if (fieldMapping[key]) {
        formattedItem[fieldMapping[key]] = item[key];
      }
    }
    return formattedItem;
  });
}

async function sendWhatsAppNotification(data) {
  console.log("enter into what",data)
  const messageBody = JSON.stringify(data, null, 2);
  const toWhatsAppNumber = "whatsapp:+918897646530";
  const fromWhatsAppNumber = "whatsapp:+14155238886";

  const MAX_LENGTH = 1600;
  const messages = chunkString(messageBody, MAX_LENGTH);

  for (const message of messages) {
    try {
      const response = await twilioClient.messages.create({
        from: fromWhatsAppNumber,
        to: toWhatsAppNumber,
        body: message,
      });
      console.log("Notification Sent:", response.sid);
    } catch (error) {
      throw new Error(`Failed to send WhatsApp notification: ${error.message}`);
    }
  }
}

function chunkString(str, length) {
  const chunks = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}


setInterval(sendInitialNotification, 60000);
app.post("/api/whatsappWebhook", async (req, res) => {
  try {
    const { From, Body } = req.body; 

    console.log(`Incoming WhatsApp message from ${From}:`, req.body);

    const [BANFN, BNFPO] = Body.split("\n").map((value) => value.trim());
    const sapPayload = {
      RELEASE: {
        BANFN, 
        BNFPO: parseInt(BNFPO, 10), 
        ZMAIL:''
      },
    };

    console.log("SAP Payload:", sapPayload);
    const sapResponse = await axios.post(SAP_API_URL, sapPayload, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      httpsAgent: agent,
    });

    console.log("SAP Final Response:", sapResponse.data);

    const formattedResponse = sapResponse.data;
    let message = formattedResponse.map(item => item.MSGTXT).join('\n');

    const twilioResponse = await twilioClient.messages.create({
      from: "whatsapp:+14155238886", // Twilio WhatsApp number
      to: "whatsapp:+918897646530", 
      body: message,
    });
  

    console.log("Final WhatsApp Message Sent:", twilioResponse.sid);
    res.send({ status:200, message });
  } 
  catch (error) {
    console.error("Error handling WhatsApp request:", error.message);
    res.status(500).send({ error: "Failed to process request." });
  }
});


app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);
  await sendInitialNotification(); // trigger when server start
});
