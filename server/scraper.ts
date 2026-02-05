import axios from "axios";
import { DateTime } from "luxon";
import XLSX from "xlsx";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer-core";
import type { Student, AttendanceData, DayBreakdown, WeeklyData } from "@shared/schema";

const SHAREPOINT_URL = "https://vijaybhoomischool-my.sharepoint.com/:x:/g/personal/rinu_babu_vijaybhoomi_edu_in/EbLMrNHP8GdGvW4Vvs84o0MBMHULieSJmvqcZv-BXgWeVw?e=hatTjx";
const DOWNLOAD_URL = `${SHAREPOINT_URL}&download=1`;

const CACHE_DURATION_MS = 10 * 60 * 1000;
const TIMEZONE = "Asia/Kolkata";
const DOWNLOAD_PATH = "/tmp/attendance";
const FILE_PATH = path.join(DOWNLOAD_PATH, "attendance.xlsx");

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

class AttendanceCache {
  private cache: CacheData = {
    data: null,
    lastFetched: null,
    isLoading: false,
    error: null,
    isDemoData: false
  };
  private refreshTimer: NodeJS.Timeout | null = null;

  constructor() {
    this.ensureDownloadFolder();
    this.startAutoRefresh();
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
    
    // Create unique userDataDir for each session
    const userDataDir = path.join('/tmp', `puppeteer_${Date.now()}_${Math.random().toString(36).substring(7)}`);
    
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
    
    if (jsonData.length < 2) {
      return { students: [], headers: [], lastUpdated: new Date().toISOString() };
    }

    let headerRowIndex = 0;
    for (let i = 0; i < Math.min(10, jsonData.length); i++) {
      const row = jsonData[i];
      if (!row) continue;
      
      const rowStr = row.map((c: any) => String(c || '').toLowerCase()).join(' ');
      if (rowStr.includes('name') || rowStr.includes('roll') || rowStr.includes('student')) {
        headerRowIndex = i;
        console.log(`[Scraper] Found header row at index ${i}`);
        break;
      }
    }

    const headerRow = jsonData[headerRowIndex];
    if (!headerRow) {
      return { students: [], headers: [], lastUpdated: new Date().toISOString() };
    }

    let genderCol = -1, nameCol = -1, rollCol = -1, schoolCol = -1;
    
    for (let i = 0; i < headerRow.length; i++) {
      const header = String(headerRow[i] || '').toLowerCase().trim();
      if (header.includes('gender') && genderCol === -1) genderCol = i;
      if ((header.includes('student') && header.includes('name')) || header === 'name') nameCol = i;
      if (header.includes('roll') && rollCol === -1) rollCol = i;
      if (header.includes('school') && schoolCol === -1) schoolCol = i;
    }

    if (nameCol === -1) nameCol = 2;
    if (rollCol === -1) rollCol = 3;
    
    console.log(`[Scraper] Column indices - Gender: ${genderCol}, Name: ${nameCol}, Roll: ${rollCol}, School: ${schoolCol}`);

    const dateColumns: { col: number; date: string }[] = [];
    for (let i = 0; i < headerRow.length; i++) {
      const header = headerRow[i];
      if (header === null || header === undefined) continue;
      
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
        dateColumns.push({ col: i, date: dateStr });
      }
    }

    const students: Student[] = [];
    
    for (let rowIdx = headerRowIndex + 1; rowIdx < jsonData.length; rowIdx++) {
      const row = jsonData[rowIdx];
      if (!row) continue;
      
      const name = String(row[nameCol] || '').trim();
      const rollNo = String(row[rollCol] || '').trim();
      
      if (!name || name.length < 2) continue;
      if (!rollNo || rollNo.length < 3) continue;

      const attendance: Record<string, string> = {};
      for (const { col, date } of dateColumns) {
        const value = row[col];
        if (value !== null && value !== undefined && value !== '') {
          attendance[date] = String(value).trim().toUpperCase();
        }
      }

      const student: Student = {
        gender: genderCol >= 0 ? String(row[genderCol] || '').trim() : '',
        studentName: name,
        rollNo,
        school: schoolCol >= 0 ? String(row[schoolCol] || '').trim() : '',
        attendance
      };

      students.push(student);
    }

    console.log(`[Scraper] Parsed ${students.length} students from Excel`);
    if (students.length > 0) {
      console.log(`[Scraper] First student: ${students[0].studentName}, Roll: ${students[0].rollNo}`);
      const keys = Object.keys(students[0].attendance).slice(0, 5);
      console.log(`[Scraper] Sample attendance dates: ${keys.join(', ')}`);
    }

    return {
      students,
      headers: dateColumns.map(d => d.date),
      lastUpdated: new Date().toISOString()
    };
  }

  getStatus() {
    return {
      lastUpdated: this.cache.lastFetched?.toISOString() || null,
      studentCount: this.cache.data?.students.length || 0,
      isLoading: this.cache.isLoading,
      error: this.cache.error,
      isDemoData: this.cache.isDemoData
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
    if (status === 'P') return 'Present';
    if (status === 'L') return 'Leave';
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
      
      let displayStatus: "Present" | "Leave" | "Absent" | "Not marked" | "Future" = "Not marked";
      if (date > now) {
        displayStatus = "Future";
      } else if (status === 'P') {
        displayStatus = "Present";
        presentCount++;
      } else if (status === 'L') {
        displayStatus = "Leave";
      } else if (status) {
        displayStatus = "Absent";
      }
      
      weeklyBreakdown.push({
        day: date.weekdayShort || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'][i],
        date: dateStr,
        status: displayStatus
      });
    }

    const remaining = Math.max(0, 3 - presentCount);
    
    return {
      weeklyData: {
        daysPresent: presentCount,
        daysRequired: 3,
        status: presentCount >= 3 ? "Completed" : "Pending",
        remaining
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
