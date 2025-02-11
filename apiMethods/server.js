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
// const PASSWORD = "Best@12345";
const PASSWORD = "Vision@2025";
 
 
 
const twilioConfig = JSON.parse(process.env.TWILIO_JSON);
console.log(twilioConfig);
const twilioClient = twilio(twilioConfig.accountSid, twilioConfig.authToken);
 
 
const userData = {};
 
function getAuthHeader() {
  return `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`).toString("base64")}`;
}
 
app.get("/", (req, res) => {
  res.send({ message: "Welcome to Twilio WhatsApp Automation!" });
  this.sendInitialNotification();
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
 
 
// Store PDFs in memory
const pdfStore = new Map();
 
// Convert Base64 to PDF (In-Memory)
function convertBase64ToPDF(prNumber, pdfBase64) {
  if (!pdfBase64) return null;
 
  try {
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const fileName = `PR_${prNumber}.pdf`;
 
    // Store PDF in memory (instead of saving to disk)
    pdfStore.set(fileName, pdfBuffer);
    console.log(`PDF Generated: ${fileName}`);
 
    return `https://sharvi-whatsapp-app.onrender.com/pdf/${fileName}`; // Serve from Express
  } catch (error) {
    console.error("Error converting Base64 to PDF:", error.message);
    return null;
  }
}
 
// Serve PDF Files from Memory
app.get("/pdf/:fileName", (req, res) => {
  const fileName = req.params.fileName;
  const pdfBuffer = pdfStore.get(fileName);
 
  if (!pdfBuffer) {
    return res.status(404).send("PDF Not Found");
  }
 
  res.setHeader("Content-Type", "application/pdf");
  res.send(pdfBuffer);
});
 
// Send WhatsApp Message with PDF
async function sendWhatsAppNotification(data) {
  const toWhatsAppNumber = "whatsapp:+919553142292";
  const fromWhatsAppNumber = "whatsapp:+14155238886";
 
  for (const item of data) {
    try {
      const prNumber = item["PR Number"];
      const pdfUrl = convertBase64ToPDF(prNumber, item["ZFILE"]); // Convert to PDF
      console.log('pdfUrl',pdfUrl)
 
      const messageParams = {
        from: fromWhatsAppNumber,
        to: toWhatsAppNumber,
        body: `*PR Number:* ${prNumber}\n📎 PR Document Attached Below`,
      };
 
      if (pdfUrl) {
        messageParams.mediaUrl = [pdfUrl]; // Attach generated PDF
        console.info("messageParams.mediaUrl",messageParams.mediaUrl)
      }
 
      const response = await twilioClient.messages.create(messageParams);
      console.log("WhatsApp Notification Sent:", response.sid);
    } catch (error) {
      console.error(`Failed to send WhatsApp notification: ${error.message}`);
    }
  }
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
    ZFILE:'ZFILE'
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
 
// async function sendWhatsAppNotification(data) {
//   const messageBody = JSON.stringify(data, null, 2);
//   const toWhatsAppNumber = "whatsapp:+919553142292";
//   const fromWhatsAppNumber = "whatsapp:+14155238886";
 
//   const MAX_LENGTH = 1600;
//   const messages = chunkString(messageBody, MAX_LENGTH);
 
//   for (const message of messages) {
//     try {
//       const response = await twilioClient.messages.create({
//         from: fromWhatsAppNumber,
//         to: toWhatsAppNumber,
//         body: message,
//       });
//       console.log("Notification Sent:", response.sid);
//     } catch (error) {
//       throw new Error(`Failed to send WhatsApp notification: ${error.message}`);
//     }
//   }
// }
 
function chunkString(str, length) {
  const chunks = [];
  for (let i = 0; i < str.length; i += length) {
    chunks.push(str.slice(i, i + length));
  }
  return chunks;
}
 
 
setInterval(sendInitialNotification, 60000);
 
app.post("/api/get/PRFile", async (req, res) => {
  try {
    const { BANFN } = req.body;
    if (!BANFN) {
      return res.status(400).json({ error: "BANFN is required" });
    }
 
    const sapResponse = await axios.put(SAP_API_URL, { BANFN }, {
      headers: {
        Authorization: getAuthHeader(),
        "Content-Type": "application/json",
      },
      httpsAgent: agent,
    });
 
    console.log("SAP Response:", sapResponse.data);
 
    res.status(200).json({ success: true, data: sapResponse.data });
  } catch (error) {
    console.error("Error:", error.message);
    res.status(500).json({ error: "Failed to fetch file from SAP." });
  }
});
 
 
app.post("/api/whatsappWebhook", async (req, res) => {
  try {
    const { From, Body } = req.body;
 
    console.log(`Incoming WhatsApp message from ${From}:`, req.body);
 
    const [BANFN, BNFPO] = Body.split("\n").map((value) => value.trim());
    const sapPayload = {
      RELEASE: {
        BANFN,
        BNFPO: parseInt(BNFPO, 10),
        ZMAIL:""
      },
    };
 
    // console.log("SAP Payload:", sapPayload);
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
      to: "whatsapp:+919553142292",
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
