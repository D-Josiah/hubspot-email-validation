const { kv } = require('@vercel/kv');

class EmailValidationService {
  constructor(config) {
    this.config = config;
    
    // Common email domain typos
    this.domainTypos = {
      'gmial.com': 'gmail.com',
      'gmal.com': 'gmail.com',
      'gmail.cm': 'gmail.com',
      'gmail.co': 'gmail.com',
      'gamil.com': 'gmail.com',
      'hotmial.com': 'hotmail.com',
      'hotmail.cm': 'hotmail.com',
      'yahoo.cm': 'yahoo.com',
      'yaho.com': 'yahoo.com',
      'outlook.cm': 'outlook.com',
      'outlok.com': 'outlook.com'
    };
    
    this.australianTlds = ['.com.au', '.net.au', '.org.au', '.edu.au', '.gov.au', '.asn.au', '.id.au', '.au'];
    this.commonValidDomains = ['gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com', 'aol.com'];
  }
  
  // Add email to KV store
  async addToKnownValidEmails(email) {
    try {
      const key = `email:${email}`;
      const data = {
        validatedAt: new Date().toISOString(),
        source: 'validation-service'
      };
      
      await kv.set(key, JSON.stringify(data));
      
      // Set expiration to 30 days (in seconds)
      await kv.expire(key, 30 * 24 * 60 * 60);
      
      return true;
    } catch (error) {
      console.error('Error storing email in KV:', error);
      return false;
    }
  }
  
  // Save validation result to KV
  async saveValidationResult(validationResult) {
    try {
      const timestamp = new Date().getTime();
      const key = `validation:${validationResult.originalEmail}:${timestamp}`;
      
      const record = {
        originalEmail: validationResult.originalEmail,
        correctedEmail: validationResult.currentEmail,
        status: validationResult.status,
        validatedAt: new Date().toISOString(),
        recheckNeeded: validationResult.recheckNeeded,
        source: 'hubspot-webhook'
      };
      
      await kv.set(key, JSON.stringify(record));
      
      // Set expiration to 90 days
      await kv.expire(key, 90 * 24 * 60 * 60);
      
      return true;
    } catch (error) {
      console.error('Error saving validation result:', error);
      return false;
    }
  }
  
  // Check if email exists in KV store
  async isKnownValidEmail(email) {
    try {
      const key = `email:${email}`;
      const result = await kv.get(key);
      return !!result;
    } catch (error) {
      console.error('Error checking KV for email:', error);
      return false;
    }
  }
  
  // Basic email format check with regex
  isValidEmailFormat(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
  
  // Clean and correct common email typos
  correctEmailTypos(email) {
    if (!email) return { corrected: false, email };
    
    let corrected = false;
    let cleanedEmail = email.trim().toLowerCase();
    
    // Remove any spaces
    const noSpaceEmail = cleanedEmail.replace(/\s/g, '');
    if (noSpaceEmail !== cleanedEmail) {
      cleanedEmail = noSpaceEmail;
      corrected = true;
    }
    
    // Check for common domain typos
    const [localPart, domain] = cleanedEmail.split('@');
    
    if (domain && this.domainTypos[domain]) {
      cleanedEmail = `${localPart}@${this.domainTypos[domain]}`;
      corrected = true;
    }
    
    // Check for + alias in Gmail
    if (this.config.removeGmailAliases && domain === 'gmail.com' && localPart.includes('+')) {
      const baseLocal = localPart.split('+')[0];
      cleanedEmail = `${baseLocal}@gmail.com`;
      corrected = true;
    }
    
    // Check Australian TLDs
    if (this.config.checkAustralianTlds) {
      for (const tld of this.australianTlds) {
        const tldNoDot = tld.replace(/\./g, '');
        if (domain && domain.endsWith(tldNoDot) && !domain.endsWith(tld)) {
          const index = domain.lastIndexOf(tldNoDot);
          const newDomain = domain.substring(0, index) + tld;
          cleanedEmail = `${localPart}@${newDomain}`;
          corrected = true;
          break;
        }
      }
    }
    
    return { corrected, email: cleanedEmail };
  }
  
  // Check if email domain is valid
  isValidDomain(email) {
    try {
      const domain = email.split('@')[1];
      return this.commonValidDomains.includes(domain);
    } catch (error) {
      return false;
    }
  }
  
  // Main validation function
  async validateEmail(email) {
    const result = {
      originalEmail: email,
      currentEmail: email,
      formatValid: false,
      wasCorrected: false,
      isKnownValid: false,
      domainValid: false,
      status: 'unknown',
      subStatus: null,
      recheckNeeded: true,
      validationSteps: []
    };
    
    // Step 1: Basic format check with regex
    result.formatValid = this.isValidEmailFormat(email);
    result.validationSteps.push({
      step: 'format_check',
      passed: result.formatValid
    });
    
    if (!result.formatValid) {
      result.status = 'invalid';
      result.subStatus = 'bad_format';
      result.recheckNeeded = false;
      await this.saveValidationResult(result);
      return result;
    }
    
    // Step 2: Correct common typos
    const { corrected, email: correctedEmail } = this.correctEmailTypos(email);
    result.wasCorrected = corrected;
    result.currentEmail = correctedEmail;
    result.validationSteps.push({
      step: 'typo_correction',
      applied: corrected,
      original: email,
      corrected: correctedEmail
    });
    
    // Step 3: Check if it's a known valid email
    result.isKnownValid = await this.isKnownValidEmail(correctedEmail);
    result.validationSteps.push({
      step: 'known_valid_check',
      passed: result.isKnownValid
    });
    
    if (result.isKnownValid) {
      result.status = 'valid';
      result.recheckNeeded = false;
      await this.saveValidationResult(result);
      return result;
    }
    
    // Step 4: Check if domain appears valid
    result.domainValid = this.isValidDomain(correctedEmail);
    result.validationSteps.push({
      step: 'domain_check',
      passed: result.domainValid
    });
    
    // Without external API, rely on domain check
    result.status = result.domainValid ? 'valid' : 'unknown';
    result.recheckNeeded = !result.domainValid;
    
    // If valid, add to known valid emails
    if (result.status === 'valid') {
      await this.addToKnownValidEmails(correctedEmail);
    }
    
    // Save the validation result to KV
    await this.saveValidationResult(result);
    
    return result;
  }
  
  // Process a batch of emails
  async validateBatch(emails) {
    const results = [];
    
    for (const email of emails) {
      try {
        const result = await this.validateEmail(email);
        results.push(result);
      } catch (error) {
        console.error(`Error validating email ${email}:`, error);
        results.push({
          originalEmail: email,
          currentEmail: email,
          status: 'check_failed',
          error: error.message
        });
      }
    }
    
    return results;
  }
  
  // Update HubSpot contact (if needed)
  async updateHubSpotContact(contactId, validationResult, hubspotClient) {
    try {
      if (!hubspotClient) {
        return {
          success: false,
          contactId,
          error: 'HubSpot client not provided'
        };
      }
      
      const properties = {
        email: validationResult.currentEmail,
        email_status: validationResult.status,
        email_recheck_needed: validationResult.recheckNeeded,
        email_check_date: new Date().toISOString(),
      };
      
      if (validationResult.wasCorrected) {
        properties.original_email = validationResult.originalEmail;
        properties.email_corrected = true;
      }
      
      if (validationResult.subStatus) {
        properties.email_sub_status = validationResult.subStatus;
      }
      
      const response = await hubspotClient.crm.contacts.basicApi.update(
        contactId,
        { properties }
      );
      
      return {
        success: true,
        contactId,
        response
      };
      
    } catch (error) {
      console.error(`Error updating HubSpot contact ${contactId}:`, error);
      return {
        success: false,
        contactId,
        error: error.message
      };
    }
  }
}

module.exports = EmailValidationService;