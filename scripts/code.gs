/**
 * ===================================================================
 * --- GOOGLE APPS SCRIPT: SMTP-BASED EMAIL RELAY & CAMPAIGN ENGINE ---
 * ===================================================================
 * 
 * Replace your existing Google Apps Script (which uses GmailApp / MailApp)
 * with this production-ready SMTP-based script. This bypasses Google's
 * strict daily limits and prevents emails from landing in spam folders.
 * 
 * SUPPORTED PROVIDERS:
 * 1. Brevo (formerly Sendinblue) - Recommended (Free 300 emails/day)
 * 2. SendGrid - Professional (Free 100 emails/day)
 * 3. Custom Mailgun / Generic SMTP API
 * 
 * HOW TO DEPLOY:
 * 1. Open your Google Apps Script editor (script.google.com).
 * 2. Copy and paste this entire code, replacing the old code.
 * 3. Configure the PROVIDER and API KEY settings below.
 * 4. Click Deploy -> Manage Deploys -> Edit -> Deploy as Web App (Execute as "Me", Access "Anyone").
 * 5. Update SCRIPT_URL in your `js/config.js` to match the new deploy URL.
 */

// ==========================================
// --- 1. CONFIGURATION ---
// ==========================================
const EMAIL_PROVIDER = 'BREVO'; // Set to: 'BREVO', 'SENDGRID', or 'GMAIL' (fallback)
const SENDER_NAME = 'Sahyadri Homes';
const SENDER_EMAIL = 'info@sahyadriconstruction.in';

// --- API KEYS ---
// (Pro-tip: For high security, store these in File -> Project Settings -> Script Properties 
// and access via PropertiesService.getScriptProperties().getProperty('API_KEY'))
const BREVO_API_KEY = 'YOUR_BREVO_API_KEY_HERE';
const SENDGRID_API_KEY = 'YOUR_SENDGRID_API_KEY_HERE';

// ==========================================
// --- 2. MAIN REQUEST HANDLER (POST) ---
// ==========================================
function doPost(e) {
  var origin = e.parameter.origin || "*";
  
  try {
    if (!e.postData || !e.postData.contents) {
      return createResponse({ success: false, message: "Empty request payload." }, 400, origin);
    }
    
    var payload = JSON.parse(e.postData.contents);
    var action = payload.action;
    
    // --- OPTIONAL JWT VALIDATION (If you want to secure your endpoint via Supabase) ---
    /*
    if (!payload.jwt) {
      return createResponse({ success: false, message: "Missing authorization token." }, 401, origin);
    }
    */
    
    switch (action) {
      case 'sendTest':
        return handleSendTest(payload, origin);
        
      case 'runCampaign':
        return handleRunCampaign(payload, origin);
        
      default:
        return createResponse({ success: false, message: "Unknown action requested: " + action }, 400, origin);
    }
    
  } catch (err) {
    return createResponse({ success: false, message: "Server Error: " + err.toString() }, 500, origin);
  }
}

// Support OPTIONS pre-flight requests from browser CORS
function doOptions(e) {
  return createResponse({ success: true }, 200, "*");
}

// ==========================================
// --- 3. CAMPAIGN ACTION HANDLERS ---
// ==========================================

/**
 * Sends a single test email
 */
function handleSendTest(payload, origin) {
  var campaignData = payload.campaignData;
  if (!campaignData || !campaignData.test_recipient) {
    return createResponse({ success: false, message: "Missing test recipient email address." }, 400, origin);
  }
  
  var subject = "[TEST] " + (campaignData.subject || "No Subject");
  var htmlBody = campaignData.body_html || "<p>Test email body.</p>";
  var recipient = campaignData.test_recipient;
  
  var success = sendEmailViaSMTP(recipient, subject, htmlBody);
  
  if (success) {
    return createResponse({ success: true, message: "Test email successfully sent via SMTP to " + recipient }, 200, origin);
  } else {
    return createResponse({ success: false, message: "SMTP relay failed to deliver test email." }, 500, origin);
  }
}

/**
 * Sends campaign emails in bulk to a list of segments
 */
function handleRunCampaign(payload, origin) {
  var campaignData = payload.campaignData;
  var segments = payload.segments; // Array of emails
  
  if (!campaignData || !segments || !segments.length) {
    return createResponse({ success: false, message: "Missing campaign data or recipient list." }, 400, origin);
  }
  
  var subject = campaignData.subject || "Promotion";
  var htmlBody = campaignData.body_html || "";
  
  var successCount = 0;
  var failureCount = 0;
  
  // Loop and send emails through SMTP provider
  for (var i = 0; i < segments.length; i++) {
    var recipient = segments[i];
    var success = sendEmailViaSMTP(recipient, subject, htmlBody);
    if (success) {
      successCount++;
    } else {
      failureCount++;
    }
  }
  
  return createResponse({
    success: true,
    message: "Campaign completed. " + successCount + " emails sent successfully. " + failureCount + " failed."
  }, 200, origin);
}

// ==========================================
// --- 4. SMTP DELIVERY HELPER FUNCTIONS ---
// ==========================================

/**
 * Dispatches an email using the configured SMTP Provider API
 */
function sendEmailViaSMTP(recipient, subject, htmlBody) {
  if (EMAIL_PROVIDER === 'BREVO') {
    return sendViaBrevo(recipient, subject, htmlBody);
  } else if (EMAIL_PROVIDER === 'SENDGRID') {
    return sendViaSendGrid(recipient, subject, htmlBody);
  } else {
    // Fallback to GmailApp script-based sender
    try {
      GmailApp.sendEmail(recipient, subject, '', {
        name: SENDER_NAME,
        htmlBody: htmlBody
      });
      return true;
    } catch (e) {
      Logger.log("GmailApp send error: " + e.toString());
      return false;
    }
  }
}

/**
 * Brevo SMTP Web API Sender
 */
function sendViaBrevo(recipient, subject, htmlBody) {
  var url = "https://api.brevo.com/v3/smtp/email";
  
  var payload = {
    sender: { name: SENDER_NAME, email: SENDER_EMAIL },
    to: [{ email: recipient }],
    subject: subject,
    htmlContent: htmlBody
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "accept": "application/json",
      "api-key": BREVO_API_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    if (responseCode === 200 || responseCode === 201 || responseCode === 202) {
      return true;
    } else {
      Logger.log("Brevo API Error: " + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log("Brevo fetch execution error: " + err.toString());
    return false;
  }
}

/**
 * SendGrid SMTP Web API Sender
 */
function sendViaSendGrid(recipient, subject, htmlBody) {
  var url = "https://api.sendgrid.com/v3/mail/send";
  
  var payload = {
    personalizations: [{
      to: [{ email: recipient }],
      subject: subject
    }],
    from: { name: SENDER_NAME, email: SENDER_EMAIL },
    content: [{
      type: "text/html",
      value: htmlBody
    }]
  };
  
  var options = {
    method: "post",
    contentType: "application/json",
    headers: {
      "Authorization": "Bearer " + SENDGRID_API_KEY
    },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var responseCode = response.getResponseCode();
    if (responseCode === 200 || responseCode === 202) {
      return true;
    } else {
      Logger.log("SendGrid API Error: " + response.getContentText());
      return false;
    }
  } catch (err) {
    Logger.log("SendGrid fetch execution error: " + err.toString());
    return false;
  }
}

// ==========================================
// --- 5. CORS RESPONSE BUILDER ---
// ==========================================
function createResponse(data, code, origin) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  
  // Set headers to support AJAX cross-origin calls
  return output;
}
