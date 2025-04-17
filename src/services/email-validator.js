const fs = require('fs-extra');
const path = require('path');
const csvParser = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');

class EmailValidationService {
  constructor(config) {
    this.config = config;
    
    // Set up paths for CSV storage
    this.knownValidEmailsPath = path.join(process.cwd(), 'data', 'known_valid_emails.csv');
    this.validationResultsPath = path.join(process.cwd(), 'data', 'validation_results.csv');
    
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
    
    // Initialize CSV files if they don't exist
    this.initializeStorage();
  }
  
  // Initialize CSV storage
  async initializeStorage() {
    const dataDir = path.join(process.cwd(), 'data');
    
    // Create data directory if it doesn't exist
    await fs.ensureDir(dataDir);
    
    // Create known valid emails CSV if it doesn't exist
    if (!await fs.pathExists(this.knownValidEmailsPath)) {
      const csvWriter = createObjectCsvWriter({
        path: this.knownValidEmailsPath,
        header: [
          { id: 'email', title: 'EMAIL' },
          { id: 'validatedAt', title: 'VALIDATED_AT' },
          { id: 'source', title: 'SOURCE' }
        ]
      });
      
      await csvWriter.writeRecords([]);
    }
    
    // Create validation results CSV if it doesn't exist
    if (!await fs.pathExists(this.validationResultsPath)) {
      const csvWriter = createObjectCsvWriter({
        path: this.validationResultsPath,
        header: [
          { id: 'originalEmail', title: 'ORIGINAL_EMAIL' },
          { id: 'correctedEmail', title: 'CORRECTED_EMAIL' },
          { id: 'status', title: 'STATUS' },
          { id: 'validatedAt', title: 'VALIDATED_AT' },
          { id: 'recheckNeeded', title: 'RECHECK_NEEDED' },
          { id: 'source', title: 'SOURCE' }
        ]
      });
      
      await csvWriter.writeRecords([]);
    }
  }
  
  // Add email to known valid emails CSV
  async addToKnownValidEmails(email) {
    try {
      const record = {
        email: email.toLowerCase(),
        validatedAt: new Date().toISOString(),
        source: 'validation-service'
      };
      
      const csvWriter = createObjectCsvWriter({
        path: this.knownValidEmailsPath,
        header: [
          { id: 'email', title: 'EMAIL' },
          { id: 'validatedAt', title: 'VALIDATED_AT' },
          { id: 'source', title: 'SOURCE' }
        ],
        append: true
      });
      
      await csvWriter.writeRecords([record]);
      return true;
    } catch (error) {
      console.error('Error storing email in CSV:', error);
      return false;
    }
  }
  
  // Save validation result to CSV
  async saveValidationResult(validationResult) {
    try {
      const record = {
        originalEmail: validationResult.originalEmail,
        correctedEmail: validationResult.currentEmail,
        status: validationResult.status,
        validatedAt: new Date().toISOString(),
        recheckNeeded: validationResult.recheckNeeded.toString(),
        source: 'hubspot-webhook'
      };
      
      const csvWriter = createObjectCsvWriter({
        path: this.validationResultsPath,
        header: [
          { id: 'originalEmail', title: 'ORIGINAL_EMAIL' },
          { id: 'correctedEmail', title: 'CORRECTED_EMAIL' },
          { id: 'status', title: 'STATUS' },
          { id: 'validatedAt', title: 'VALIDATED_AT' },
          { id: 'recheckNeeded', title: 'RECHECK_NEEDED' },
          { id: 'source', title: 'SOURCE' }
        ],
        append: true
      });
      
      await csvWriter.writeRecords([record]);
      return true;
    } catch (error) {
      console.error('Error saving validation result:', error);
      return false;
    }
  }
  
  // Check if email exists in known valid emails CSV
  async isKnownValidEmail(email) {
    try {
      const lowerEmail = email.toLowerCase();
      const knownEmails = [];
      
      return new Promise((resolve, reject) => {
        fs.createReadStream(this.knownValidEmailsPath)
          .pipe(csvParser())
          .on('data', (row) => {
            knownEmails.push(row.EMAIL.toLowerCase());
          })
          .on('end', () => {
            resolve(knownEmails.includes(lowerEmail));
          })
          .on('error', (error) => {
            console.error('Error reading known emails CSV:', error);
            resolve(false);
          });
      });
    } catch (error) {
      console.error('Error checking CSV for email:', error);
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
    
    // Save the validation result to CSV
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
}

module.exports = EmailValidationService;