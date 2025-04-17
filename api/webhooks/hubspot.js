const EmailValidationService = require('../../src/services/email-validator');
const crypto = require('crypto');

// Load configuration
const config = {
  environment: process.env.NODE_ENV || 'development',
  emailValidation: {
    removeGmailAliases: process.env.REMOVE_GMAIL_ALIASES !== 'false',
    checkAustralianTlds: process.env.CHECK_AUSTRALIAN_TLDS !== 'false',
  },
  hubspot: {
    clientSecret: process.env.HUBSPOT_CLIENT_SECRET || '',
    skipSignatureVerification: process.env.SKIP_SIGNATURE_VERIFICATION === 'true'
  }
};

// Initialize the email validation service
const emailValidator = new EmailValidationService(config.emailValidation);

module.exports = async (req, res) => {
  // Only allow POST method
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Verify HubSpot signature
    if (!verifyHubspotSignature(req, config)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }
    
    // Respond immediately to prevent timeouts
    res.status(200).send('Processing');
    
    // Process the webhook asynchronously
    processWebhook(req.body, config)
      .then(result => console.log('Webhook processed:', result))
      .catch(error => console.error('Error processing webhook:', error));
      
  } catch (error) {
    console.error('Error in webhook handler:', error);
    // Already sent 200 response or failed verification, so no need to respond again
  }
};

// Verify the HubSpot signature
function verifyHubspotSignature(req, config) {
  // Skip verification in development if configured
  if (config.environment === 'development' && config.hubspot.skipSignatureVerification) {
    return true;
  }
  
  try {
    const signature = req.headers['x-hubspot-signature'];
    const requestBody = JSON.stringify(req.body);
    
    if (!signature) {
      console.error('Missing HubSpot signature');
      return false;
    }
    
    const hash = crypto
      .createHmac('sha256', config.hubspot.clientSecret)
      .update(requestBody)
      .digest('hex');
      
    return hash === signature;
    
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

// Process the webhook data
async function processWebhook(webhookData, config) {
  try {
    // Extract the contact details
    const subscriptionType = webhookData.subscriptionType;
    const contactId = webhookData.objectId;
    
    // Get the email from the webhook
    let email;
    
    if (webhookData.properties && webhookData.properties.email) {
      email = webhookData.properties.email.value;
    } else {
      console.log(`No email found for contact ${contactId}, skipping validation`);
      return { 
        success: false,
        reason: 'no_email',
        contactId 
      };
    }
    
    // Check if we should validate based on subscription type
    const shouldValidate = shouldValidateForSubscriptionType(subscriptionType);
    
    if (!shouldValidate) {
      console.log(`Skipping validation for subscription type: ${subscriptionType}`);
      return { 
        success: false,
        reason: 'subscription_type_skipped',
        contactId,
        subscriptionType
      };
    }
    
    // Validate the email
    const validationResult = await emailValidator.validateEmail(email);
    
    // Log the result
    console.log(`Validated email ${email}`, {
      contactId,
      result: validationResult.status,
      corrected: validationResult.wasCorrected ? validationResult.currentEmail : null
    });
    
    return {
      success: true,
      contactId,
      validationResult
    };
    
  } catch (error) {
    console.error('Error processing webhook:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Determine if we should validate based on the subscription type
function shouldValidateForSubscriptionType(subscriptionType) {
  // List of subscription types that should trigger validation
  const validSubscriptionTypes = [
    'contact.creation',            // Contact created
    'contact.propertyChange',      // Contact property changed
    'contact.propertyChange.email' // Email property changed
  ];
  
  return validSubscriptionTypes.includes(subscriptionType);
}