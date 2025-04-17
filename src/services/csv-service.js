const fs = require('fs-extra');
const path = require('path');
const { createObjectCsvWriter } = require('csv-writer');
const csvParser = require('csv-parser');

class CsvService {
  constructor() {
    this.dataDirectory = path.join(process.cwd(), 'data');
    this.ensureDataDirectory();
  }

  async ensureDataDirectory() {
    await fs.ensureDir(this.dataDirectory);
  }

  async createCsvFile(filePath, headers) {
    // Create directory if it doesn't exist
    await fs.ensureDir(path.dirname(filePath));

    // Check if file exists
    const fileExists = await fs.pathExists(filePath);
    
    if (!fileExists) {
      // Create new file with headers
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: headers
      });
      
      await csvWriter.writeRecords([]);
      return true;
    }
    
    return false;
  }

  async appendToCsv(filePath, records, headers) {
    try {
      // Ensure the file exists with proper headers
      await this.createCsvFile(filePath, headers);
      
      const csvWriter = createObjectCsvWriter({
        path: filePath,
        header: headers,
        append: true
      });
      
      await csvWriter.writeRecords(Array.isArray(records) ? records : [records]);
      return true;
    } catch (error) {
      console.error(`Error appending to CSV ${filePath}:`, error);
      return false;
    }
  }

  async readCsvFile(filePath) {
    try {
      // Check if file exists
      const fileExists = await fs.pathExists(filePath);
      
      if (!fileExists) {
        return [];
      }
      
      const results = [];
      
      return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
          .pipe(csvParser())
          .on('data', (data) => results.push(data))
          .on('end', () => {
            resolve(results);
          })
          .on('error', (error) => {
            reject(error);
          });
      });
      
    } catch (error) {
      console.error(`Error reading CSV ${filePath}:`, error);
      return [];
    }
  }

  // Find a record in a CSV file
  async findInCsv(filePath, key, value) {
    try {
      const records = await this.readCsvFile(filePath);
      const found = records.find(record => record[key] === value);
      return found || null;
    } catch (error) {
      console.error(`Error finding in CSV ${filePath}:`, error);
      return null;
    }
  }

  // Update a record in a CSV file
  async updateInCsv(filePath, key, value, newData, headers) {
    try {
      const records = await this.readCsvFile(filePath);
      const index = records.findIndex(record => record[key] === value);
      
      if (index !== -1) {
        // Update the record
        records[index] = { ...records[index], ...newData };
        
        // Write all records back to file
        const csvWriter = createObjectCsvWriter({
          path: filePath,
          header: headers
        });
        
        await csvWriter.writeRecords(records);
        return true;
      }
      
      return false;
    } catch (error) {
      console.error(`Error updating in CSV ${filePath}:`, error);
      return false;
    }
  }
}

module.exports = CsvService;