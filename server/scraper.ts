import axios from "axios";
import { DateTime } from "luxon";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import type { Student, AttendanceData, DayBreakdown, WeeklyData, TermData } from "@shared/schema";

const SHAREPOINT_URL = "https://vijaybhoomischool-my.sharepoint.com/:x:/g/personal/rinu_babu_vijaybhoomi_edu_in/EbLMrNHP8GdGvW4Vvs84o0MBMHULieSJmvqcZv-BXgWeVw?e=hatTjx";
const DOWNLOAD_URL = `${SHAREPOINT_URL}&download=1`;

const CACHE_DURATION_MS = 10 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000;
const MAX_FILE_AGE_MS = 60 * 60 * 1000;
const TIMEZONE = "Asia/Kolkata";
const DOWNLOAD_PATH = "/tmp/attendance";
const FILE_PATH = path.join(DOWNLOAD_PATH, "attendance.xlsx");
const PUPPETEER_TEMP_PREFIX = "attendance_scraper_puppeteer_";

function getChromiumPath(): string {
  const possiblePaths = [
    process.env.PUPPETEER_EXECUTABLE_PATH || '',
    '/nix/store/zi4f80l169xlmivz8vja8wlphq74qqk0-chromium-125.0.6422.141/bin/chromium',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/google-chrome'
  ];
  
  for (const p of possiblePaths) {
    if (p && fs.existsSync(p)) {
      return p;
    }
  }
  
  try {
    const { execSync } = require('child_process');
    const result = execSync('which chromium || which chromium-browser || which google-chrome', { encoding: 'utf8' });
    const foundPath = result.trim().split('\n')[0];
    if (foundPath && fs.existsSync(foundPath)) {
      return foundPath;
    }
  } catch (e) {}
  
  try {
    const { execSync } = require('child_process');
    const result = execSync('find /nix/store -name "chromium" -type f 2>/dev/null | head -1', { encoding: 'utf8' });
    const foundPath = result.trim();
    if (foundPath && fs.existsSync(foundPath)) {
      return foundPath;
    }
  } catch (e) {}
  
  return possiblePaths[0];
}

interface CacheData {
  data: AttendanceData | null;
  lastFetched: Date | null;
  isLoading: boolean;
  error: string | null;
  isDemoData: boolean;
}

interface CleanupStats {
  lastCleanup: Date | null;
  filesDeleted: number;
  totalCleanups: number;
  bytesFreed: number;
}

class AttendanceCache {
  private cache: CacheData = {
    data: null,
    lastFetched: null,
    isLoading: false,
    error: null,
    isDemoData: false
  };
  private cleanupStats: CleanupStats = {
    lastCleanup: null,
    filesDeleted: 0,
    totalCleanups: 0,
    bytesFreed: 0
  };
  private refreshTimer: NodeJS.Timeout | null = null;
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDownloadFolder();
    this.startAutoRefresh();
    this.startAutoCleanup();
  }

  private startAutoCleanup() {
    this.runCleanup();
    this.cleanupTimer = setInterval(() => {
      this.runCleanup();
    }, CLEANUP_INTERVAL_MS);
    console.log(`[Scraper] Auto cleanup scheduled every ${CLEANUP_INTERVAL_MS / 60000} minutes`);
  }

  runCleanup(): { filesDeleted: number; bytesFreed: number } {
    console.log("[Scraper] Running cache cleanup...");
    
    const excelResult = this.cleanupOldExcelFiles();
    const puppeteerResult = this.cleanupStalePuppeteerDirs();
    
    const filesDeleted = excelResult.filesDeleted + puppeteerResult.dirsDeleted;
    const bytesFreed = excelResult.bytesFreed + puppeteerResult.bytesFreed;

    this.cleanupStats.lastCleanup = new Date();
    this.cleanupStats.filesDeleted += filesDeleted;
    this.cleanupStats.totalCleanups++;
    this.cleanupStats.bytesFreed += bytesFreed;

    console.log(`[Scraper] Cleanup complete: ${filesDeleted} files/dirs deleted, ${(bytesFreed / 1024).toFixed(2)} KB freed`);
    return { filesDeleted, bytesFreed };
  }

  private cleanupOldExcelFiles(): { filesDeleted: number; bytesFreed: number } {
    let filesDeleted = 0;
    let bytesFreed = 0;
    try {
      if (!fs.existsSync(DOWNLOAD_PATH)) return { filesDeleted: 0, bytesFreed: 0 };

      const files = fs.readdirSync(DOWNLOAD_PATH);

      for (const file of files) {
        const filePath = path.join(DOWNLOAD_PATH, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            bytesFreed += stats.size;
            fs.unlinkSync(filePath);
            filesDeleted++;
            console.log(`[Scraper] Deleted file during cleanup: ${file} (${(stats.size / 1024).toFixed(2)} KB)`);
          }
        } catch (err) {
          console.error(`[Scraper] Error checking file ${file}: ${err}`);
        }
      }
    } catch (err) {
      console.error(`[Scraper] Error during Excel cleanup: ${err}`);
    }
    return { filesDeleted, bytesFreed };
  }

  private cleanupStalePuppeteerDirs(): { dirsDeleted: number; bytesFreed: number } {
    let dirsDeleted = 0;
    let bytesFreed = 0;
    const tmpDir = '/tmp';

    try {
      const entries = fs.readdirSync(tmpDir);
      const now = Date.now();

      for (const entry of entries) {
        if (!entry.startsWith(PUPPETEER_TEMP_PREFIX)) continue;

        const dirPath = path.join(tmpDir, entry);
        try {
          const stats = fs.statSync(dirPath);
          if (!stats.isDirectory()) continue;

          const dirAge = now - stats.mtimeMs;
          if (dirAge > MAX_FILE_AGE_MS) {
            const dirSize = this.getDirectorySize(dirPath);
            fs.rmSync(dirPath, { recursive: true, force: true });
            bytesFreed += dirSize;
            dirsDeleted++;
            console.log(`[Scraper] Deleted stale puppeteer dir: ${entry} (age: ${Math.round(dirAge / 60000)} mins)`);
          }
        } catch (err) {
          console.error(`[Scraper] Error cleaning puppeteer dir ${entry}: ${err}`);
        }
      }
    } catch (err) {
      console.error(`[Scraper] Error during puppeteer cleanup: ${err}`);
    }

    return { dirsDeleted, bytesFreed };
  }

  private getDirectorySize(dirPath: string): number {
    let size = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const entryPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
          size += this.getDirectorySize(entryPath);
        } else {
          try {
            size += fs.statSync(entryPath).size;
          } catch {}
        }
      }
    } catch {}
    return size;
  }

  private deleteAllDataFiles(): number {
    let bytesFreed = 0;
    try {
      if (!fs.existsSync(DOWNLOAD_PATH)) return 0;
      const files = fs.readdirSync(DOWNLOAD_PATH);
      for (const file of files) {
        const filePath = path.join(DOWNLOAD_PATH, file);
        try {
          const stats = fs.statSync(filePath);
          if (stats.isFile()) {
            bytesFreed += stats.size;
            fs.unlinkSync(filePath);
          }
        } catch {}
      }
      if (bytesFreed > 0) {
        console.log(`[Scraper] Cleaned up ${(bytesFreed / 1024).toFixed(2)} KB from download folder`);
      }
    } catch (err) {
      console.error(`[Scraper] Error cleaning download folder: ${err}`);
    }
    return bytesFreed;
  }

  private ensureDownloadFolder() {
    try {
      if (!fs.existsSync(DOWNLOAD_PATH)) {
        fs.mkdirSync(DOWNLOAD_PATH, { recursive: true });
        console.log(`[Scraper] Created download folder: ${DOWNLOAD_PATH}`);
      }
    } catch (err) {
      console.error(`[Scraper] Failed to create folder: ${err}`);
    }
  }

  private startAutoRefresh() {
    this.refresh();
    this.refreshTimer = setInterval(() => {
      this.refresh();
    }, CACHE_DURATION_MS);
  }

  private async downloadWithPuppeteer(): Promise<Buffer> {
    const chromiumPath = getChromiumPath();
    console.log(`[Scraper] Using Chromium at: ${chromiumPath}`);
    
    // Create unique userDataDir for each session with app-specific prefix
    const userDataDir = path.join('/tmp', `${PUPPETEER_TEMP_PREFIX}${Date.now()}_${Math.random().toString(36).substring(7)}`);
    
    const browser = await puppeteer.launch({
      executablePath: chromiumPath,
      headless: true,
      userDataDir,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-default-apps',
        '--disable-sync',
        '--metrics-recording-only',
        '--mute-audio',
        '--no-first-run',
        '--safebrowsing-disable-auto-update',
        '--disable-crash-reporter'
      ]
    });

    try {
      const page = await browser.newPage();
      
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      console.log("[Scraper] Navigating to SharePoint...");
      await page.goto(SHAREPOINT_URL, { 
        waitUntil: 'networkidle2',
        timeout: 60000 
      });
      
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const cookies = await page.cookies();
      console.log(`[Scraper] Got ${cookies.length} cookies`);
      
      const cookieString = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      
      console.log("[Scraper] Downloading with cookies via HTTP...");
      const response = await axios.get(DOWNLOAD_URL, {
        responseType: 'arraybuffer',
        timeout: 60000,
        headers: {
          'Cookie': cookieString,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, */*'
        }
      });

      console.log(`[Scraper] HTTP Status: ${response.status}`);
      console.log(`[Scraper] Content-Type: ${response.headers['content-type']}`);
      
      const buffer = Buffer.from(response.data);
      console.log(`[Scraper] Downloaded ${buffer.length} bytes`);
      
      if (buffer.length < 1000) {
        throw new Error(`File too small: ${buffer.length} bytes`);
      }
      
      const contentCheck = buffer.toString('utf8', 0, 100);
      if (contentCheck.includes('<!DOCTYPE') || contentCheck.includes('<html')) {
        throw new Error("Received HTML instead of Excel file");
      }
      
      return buffer;
      
    } finally {
      await browser.close();
      // Clean up userDataDir after browser closes
      try {
        fs.rmSync(userDataDir, { recursive: true, force: true });
      } catch (e) {
        console.log(`[Scraper] Failed to cleanup userDataDir: ${e}`);
      }
    }
  }

  async refresh(): Promise<{ success: boolean; studentCount?: number; lastUpdated?: string; error?: string }> {
    if (this.cache.isLoading) {
      console.log("[Scraper] Already loading, skipping refresh");
      return { success: false, error: "Already loading" };
    }

    this.cache.isLoading = true;
    this.cache.error = null;
    console.log("[Scraper] Starting data refresh...");

    const timeout = setTimeout(() => {
      if (this.cache.isLoading) {
        console.log("[Scraper] Refresh timeout - forcing isLoading to false");
        this.cache.isLoading = false;
        this.cache.error = "Refresh timeout after 2 minutes";
      }
    }, 120000);

    try {
      this.ensureDownloadFolder();

      const buffer = await this.downloadWithPuppeteer();

      fs.writeFileSync(FILE_PATH, buffer);
      console.log(`[Scraper] Saved file to ${FILE_PATH}`);

      console.log("[Scraper] Parsing Excel file...");
      const data = this.parseExcelFile(FILE_PATH);

      this.deleteAllDataFiles();
      
      if (data.students.length === 0) {
        throw new Error("No students found in Excel file");
      }

      this.cache.data = data;
      this.cache.lastFetched = new Date();
      this.cache.error = null;
      this.cache.isDemoData = false;
      this.cache.isLoading = false;
      clearTimeout(timeout);
      
      console.log(`[Scraper] SUCCESS: Loaded ${data.students.length} students`);
      
      return { 
        success: true, 
        studentCount: data.students.length, 
        lastUpdated: this.cache.lastFetched.toISOString() 
      };

    } catch (error: any) {
      clearTimeout(timeout);
      const errorMessage = error?.message || "Unknown error";
      console.error(`[Scraper] ERROR: ${errorMessage}`);
      
      this.cache.error = errorMessage;
      this.cache.isLoading = false;
      this.cache.isDemoData = true;
      
      return { success: false, error: errorMessage };
    }
  }

  private parseExcelFile(filePath: string): AttendanceData {
    const workbook = XLSX.readFile(filePath);
    
    console.log(`[Scraper] Available sheets: ${workbook.SheetNames.join(', ')}`);
    
    let sheetName = workbook.SheetNames.find(name => 
      name.toLowerCase().includes('attendance')
    ) || workbook.SheetNames[0];
    
    console.log(`[Scraper] Using sheet: ${sheetName}`);
    const worksheet = workbook.Sheets[sheetName];
    
    const jsonData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
    console.log(`[Scraper] Found ${jsonData.length} rows in Excel`);
    
    if (jsonData.length < 3) {
      return { students: [], headers: [], termNames: [], lastUpdated: new Date().toISOString() };
    }

    const termRow = jsonData[0] || [];
    const headerRow = jsonData[2] || [];
    const headerRowIndex = 2;

    interface TermInfo {
      name: string;
      startCol: number;
      endCol: number;
      percentageCol: number;
      attendedCol: number;
      totalCol: number;
      criteriaCol: number;
      dateColumns: { col: number; date: string }[];
    }

    const terms: TermInfo[] = [];
    
    for (let i = 0; i < termRow.length; i++) {
      const cellValue = String(termRow[i] || '').trim().toUpperCase();
      if (cellValue.includes('TERM') && !cellValue.includes('(L-')) {
        const termName = cellValue.replace('TERM', '').trim() + ' TERM';
        
        let percentageCol = -1, attendedCol = -1, totalCol = -1, criteriaCol = -1;
        for (let j = i + 1; j < Math.min(i + 10, headerRow.length); j++) {
          const header = String(headerRow[j] || '').toLowerCase().trim();
          if (header === '%' && percentageCol === -1) percentageCol = j;
          if (header.includes('total') && header.includes('attend') && attendedCol === -1) attendedCol = j;
          if (header.includes('total') && header.includes('class') && !header.includes('attend') && totalCol === -1) totalCol = j;
          if (header.includes('criteria') && criteriaCol === -1) criteriaCol = j;
        }

        let nextTermStart = headerRow.length;
        for (let k = i + 1; k < termRow.length; k++) {
          const nextCell = String(termRow[k] || '').trim().toUpperCase();
          if (nextCell.includes('TERM') && !nextCell.includes('(L-')) {
            nextTermStart = k;
            break;
          }
        }

        const dateColumns: { col: number; date: string }[] = [];
        const startDateCol = criteriaCol >= 0 ? criteriaCol + 1 : i + 10;
        for (let j = startDateCol; j < nextTermStart; j++) {
          const header = headerRow[j];
          if (header === null || header === undefined) continue;
          if (String(header).toLowerCase() === 'summary') continue;
          
          let dateStr: string | null = null;
          
          if (typeof header === 'number' && header > 40000 && header < 50000) {
            const excelDate = new Date((header - 25569) * 86400 * 1000);
            dateStr = `${excelDate.getMonth() + 1}/${excelDate.getDate()}/${excelDate.getFullYear()}`;
          } else if (typeof header === 'string') {
            const dateMatch = header.match(/^\d{1,2}\/\d{1,2}\/\d{4}$/);
            if (dateMatch) {
              dateStr = header;
            }
          }
          
          if (dateStr) {
            dateColumns.push({ col: j, date: dateStr });
          }
        }

        terms.push({
          name: termName,
          startCol: i,
          endCol: nextTermStart - 1,
          percentageCol,
          attendedCol,
          totalCol,
          criteriaCol,
          dateColumns
        });

        console.log(`[Scraper] Found term: ${termName} (cols ${i}-${nextTermStart - 1}), dates: ${dateColumns.length}`);
      }
    }

    let genderCol = -1, nameCol = -1, rollCol = -1, schoolCol = -1;
    for (let i = 0; i < Math.min(10, headerRow.length); i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();
      if (header.includes('gender') && genderCol === -1) genderCol = i;
      if ((header.includes('student') && header.includes('name')) || header === 'name') nameCol = i;
      if (header.includes('roll') && rollCol === -1) rollCol = i;
      if (header.includes('school') && schoolCol === -1) schoolCol = i;
    }

    if (nameCol === -1) nameCol = 2;
    if (rollCol === -1) rollCol = 3;
    
    console.log(`[Scraper] Column indices - Gender: ${genderCol}, Name: ${nameCol}, Roll: ${rollCol}, School: ${schoolCol}`);

    const allDateColumns: { col: number; date: string }[] = [];
    terms.forEach(term => {
      allDateColumns.push(...term.dateColumns);
    });

    const termConductedMap: Map<string, number> = new Map();
    for (const term of terms) {
      let conducted = 0;
      for (const { col } of term.dateColumns) {
        let hasData = false;
        for (let rowIdx = headerRowIndex + 1; rowIdx < jsonData.length; rowIdx++) {
          const row = jsonData[rowIdx];
          if (!row) continue;
          const studentName = String(row[nameCol] || '').trim();
          const studentRoll = String(row[rollCol] || '').trim();
          if (!studentName || studentName.length < 2 || !studentRoll || studentRoll.length < 3) continue;
          const val = row[col];
          if (val !== null && val !== undefined && val !== '') {
            hasData = true;
            break;
          }
        }
        if (hasData) conducted++;
      }
      termConductedMap.set(term.name, conducted);
      console.log(`[Scraper] Term "${term.name}": ${conducted} classes conducted out of ${term.dateColumns.length} date columns`);
    }

    const students: Student[] = [];
    const REQUIRED_CLASSES = 24;
    
    for (let rowIdx = headerRowIndex + 1; rowIdx < jsonData.length; rowIdx++) {
      const row = jsonData[rowIdx];
      if (!row) continue;
      
      const name = String(row[nameCol] || '').trim();
      const rollNo = String(row[rollCol] || '').trim();
      
      if (!name || name.length < 2) continue;
      if (!rollNo || rollNo.length < 3) continue;

      const allAttendance: Record<string, string> = {};
      for (const { col, date } of allDateColumns) {
        const value = row[col];
        if (value !== null && value !== undefined && value !== '') {
          allAttendance[date] = String(value).trim().toUpperCase();
        }
      }

      const studentTerms: TermData[] = [];
      const today = new Date();
      
      for (const term of terms) {
        const percentage = typeof row[term.percentageCol] === 'number' ? row[term.percentageCol] : 0;
        const attended = typeof row[term.attendedCol] === 'number' ? Math.round(row[term.attendedCol]) : 0;
        const total = typeof row[term.totalCol] === 'number' ? Math.round(row[term.totalCol]) : 30;
        const criteriaValue = String(row[term.criteriaCol] || '').toLowerCase().trim();
        
        const termAttendance: Record<string, string> = {};
        for (const { col, date } of term.dateColumns) {
          const value = row[col];
          if (value !== null && value !== undefined && value !== '') {
            termAttendance[date] = String(value).trim().toUpperCase();
          }
        }

        const isRepublicTerm = term.name.toUpperCase().includes('REPUBLIC');

        let termEnded = false;
        if (!isRepublicTerm && term.dateColumns.length > 0) {
          const lastDateStr = term.dateColumns[term.dateColumns.length - 1].date;
          const parts = lastDateStr.split('/');
          if (parts.length === 3) {
            const lastDate = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
            const daysSinceLastClass = Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
            termEnded = (total >= 30 && daysSinceLastClass > 7) || daysSinceLastClass > 30;
          }
        }

        let status: "Cleared" | "Not Cleared" | "In Progress";
        if (attended >= REQUIRED_CLASSES) {
          status = "Cleared";
        } else if (isRepublicTerm) {
          status = "In Progress";
        } else if (criteriaValue.includes('cleared') && !criteriaValue.includes('not')) {
          status = "Cleared";
        } else if (criteriaValue.includes('not') && criteriaValue.includes('cleared')) {
          status = "Not Cleared";
        } else if (termEnded) {
          status = "Not Cleared";
        } else {
          status = "In Progress";
        }

        const remaining = Math.max(0, REQUIRED_CLASSES - attended);
        const classesConducted = termConductedMap.get(term.name) || 0;
        const PLANNED_TOTAL = 30;
        const classesLeft = isRepublicTerm
          ? Math.max(0, PLANNED_TOTAL - attended)
          : Math.max(0, PLANNED_TOTAL - classesConducted);

        studentTerms.push({
          termName: term.name,
          percentage: Math.round(percentage * 100) / 100,
          attendedClasses: attended,
          totalClasses: total,
          classesConducted,
          requiredClasses: REQUIRED_CLASSES,
          status,
          remaining,
          classesLeft,
          attendance: termAttendance
        });
      }

      const student: Student = {
        gender: genderCol >= 0 ? String(row[genderCol] || '').trim() : '',
        studentName: name,
        rollNo,
        school: schoolCol >= 0 ? String(row[schoolCol] || '').trim() : '',
        attendance: allAttendance,
        terms: studentTerms
      };

      students.push(student);
    }

    console.log(`[Scraper] Parsed ${students.length} students with ${terms.length} terms`);
    if (students.length > 0 && students[0].terms) {
      console.log(`[Scraper] First student: ${students[0].studentName}, Terms: ${students[0].terms.map(t => `${t.termName}(${t.attendedClasses}/${t.totalClasses})`).join(', ')}`);
    }

    return {
      students,
      headers: allDateColumns.map(d => d.date),
      termNames: terms.map(t => t.name),
      lastUpdated: new Date().toISOString()
    };
  }

  getStatus() {
    return {
      lastUpdated: this.cache.lastFetched?.toISOString() || null,
      studentCount: this.cache.data?.students.length || 0,
      isLoading: this.cache.isLoading,
      error: this.cache.error,
      isDemoData: this.cache.isDemoData,
      cleanup: {
        lastCleanup: this.cleanupStats.lastCleanup?.toISOString() || null,
        totalFilesDeleted: this.cleanupStats.filesDeleted,
        totalCleanups: this.cleanupStats.totalCleanups,
        totalBytesFreed: this.cleanupStats.bytesFreed,
        nextCleanupIn: `${Math.round(CLEANUP_INTERVAL_MS / 60000)} minutes`
      }
    };
  }

  getCleanupStats() {
    return {
      lastCleanup: this.cleanupStats.lastCleanup?.toISOString() || null,
      totalFilesDeleted: this.cleanupStats.filesDeleted,
      totalCleanups: this.cleanupStats.totalCleanups,
      totalBytesFreed: this.cleanupStats.bytesFreed,
      bytesFreedFormatted: `${(this.cleanupStats.bytesFreed / 1024).toFixed(2)} KB`
    };
  }

  getData(): AttendanceData | null {
    return this.cache.data;
  }

  searchByRoll(rollNo: string): Student | null {
    if (!this.cache.data) return null;
    const searchRoll = rollNo.toLowerCase().trim();
    return this.cache.data.students.find(s => 
      s.rollNo.toLowerCase().includes(searchRoll)
    ) || null;
  }

  searchByName(name: string): Student[] {
    if (!this.cache.data) return [];
    const searchTerms = name.toLowerCase().trim().split(/\s+/).filter(t => t.length > 0);
    if (searchTerms.length === 0) return [];
    
    const results = this.cache.data.students.filter(s => {
      const studentNameLower = s.studentName.toLowerCase();
      return searchTerms.every(term => studentNameLower.includes(term));
    });
    
    results.sort((a, b) => {
      const aName = a.studentName.toLowerCase();
      const bName = b.studentName.toLowerCase();
      const firstTerm = searchTerms[0];
      
      const aFirstNameMatch = aName.split(/\s+/)[0].startsWith(firstTerm);
      const bFirstNameMatch = bName.split(/\s+/)[0].startsWith(firstTerm);
      
      if (aFirstNameMatch && !bFirstNameMatch) return -1;
      if (!aFirstNameMatch && bFirstNameMatch) return 1;
      
      const aExactFirst = aName.split(/\s+/)[0] === firstTerm;
      const bExactFirst = bName.split(/\s+/)[0] === firstTerm;
      
      if (aExactFirst && !bExactFirst) return -1;
      if (!aExactFirst && bExactFirst) return 1;
      
      return a.studentName.localeCompare(b.studentName);
    });
    
    return results;
  }

  findStudentByRoll(rollNo: string): Student | null {
    return this.searchByRoll(rollNo);
  }

  findStudentByName(name: string): Student | null {
    const results = this.searchByName(name);
    return results.length > 0 ? results[0] : null;
  }

  getPendingStudents(): Student[] {
    if (!this.cache.data) return [];
    
    const now = DateTime.now().setZone(TIMEZONE);
    const startOfWeek = now.startOf('week');
    const weekDates: string[] = [];
    
    for (let i = 0; i < 5; i++) {
      const date = startOfWeek.plus({ days: i });
      weekDates.push(`${date.month}/${date.day}/${date.year}`);
    }

    return this.cache.data.students.filter(student => {
      let presentCount = 0;
      for (const date of weekDates) {
        const status = student.attendance[date];
        if (status === 'P') presentCount++;
      }
      return presentCount < 3;
    });
  }

  getTodayStatus(student: Student): string {
    const now = DateTime.now().setZone(TIMEZONE);
    const todayStr = `${now.month}/${now.day}/${now.year}`;
    const status = student.attendance[todayStr];
    
    if (!status) return 'Not marked';
    const upperStatus = status.toUpperCase();
    if (upperStatus === 'P') return 'Present';
    if (upperStatus === 'L') return 'Leave';
    if (upperStatus === 'W') return 'Warning';
    return 'Absent';
  }

  getWeeklyData(student: Student): { weeklyData: WeeklyData; weeklyBreakdown: DayBreakdown[] } {
    const now = DateTime.now().setZone(TIMEZONE);
    const startOfWeek = now.startOf('week');
    
    const weeklyBreakdown: DayBreakdown[] = [];
    let presentCount = 0;
    
    for (let i = 0; i < 5; i++) {
      const date = startOfWeek.plus({ days: i });
      const dateStr = `${date.month}/${date.day}/${date.year}`;
      const status = student.attendance[dateStr];
      
      let displayStatus: "Present" | "Leave" | "Absent" | "Warning" | "Not marked" | "Future" = "Not marked";
      const upperStatus = status?.toUpperCase();
      if (date > now) {
        displayStatus = "Future";
      } else if (upperStatus === 'P') {
        displayStatus = "Present";
        presentCount++;
      } else if (upperStatus === 'L') {
        displayStatus = "Leave";
      } else if (upperStatus === 'W') {
        displayStatus = "Warning";
      } else if (status) {
        displayStatus = "Absent";
      }
      
      weeklyBreakdown.push({
        day: date.weekdayShort || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i],
        date: dateStr,
        status: displayStatus
      });
    }

    const daysRequired = 3;
    const totalDaysInWeek = 5;
    const remaining = Math.max(0, daysRequired - presentCount);
    
    return {
      weeklyData: {
        daysPresent: presentCount,
        daysRequired,
        status: presentCount >= daysRequired ? "Completed" : "Pending",
        remaining,
        totalDays: totalDaysInWeek
      },
      weeklyBreakdown
    };
  }

  getAttendanceHistory(student: Student) {
    const dates = Object.keys(student.attendance).sort((a, b) => {
      const dateA = new Date(a);
      const dateB = new Date(b);
      return dateB.getTime() - dateA.getTime();
    });

    const months: Record<string, { date: string; status: string }[]> = {};
    let totalPresent = 0;
    let totalLeave = 0;
    let totalAbsent = 0;

    for (const date of dates) {
      const status = student.attendance[date];
      const dateObj = new Date(date);
      const monthKey = `${dateObj.toLocaleString('default', { month: 'long' })} ${dateObj.getFullYear()}`;
      
      if (!months[monthKey]) months[monthKey] = [];
      
      months[monthKey].push({ date, status });
      
      if (status === 'P') totalPresent++;
      else if (status === 'L') totalLeave++;
      else totalAbsent++;
    }

    const totalDays = totalPresent + totalLeave + totalAbsent;
    const attendanceRate = totalDays > 0 ? Math.round((totalPresent / totalDays) * 100) : 0;

    return {
      months,
      stats: {
        totalPresent,
        totalLeave,
        totalAbsent,
        attendanceRate
      }
    };
  }
}

export const attendanceCache = new AttendanceCache();
