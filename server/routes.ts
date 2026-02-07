import type { Express } from "express";
import { createServer, type Server } from "http";
import { attendanceCache } from "./scraper";
import type { StudentResponse, PendingStudent } from "@shared/schema";
import OpenAI from "openai";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  app.get("/api/status", (req, res) => {
    const status = attendanceCache.getStatus();
    res.json(status);
  });

  app.get("/api/student", (req, res) => {
    const { roll, name } = req.query;

    if (!roll && !name) {
      return res.status(400).json({ error: "Please provide roll or name parameter" });
    }

    let student;

    if (roll) {
      student = attendanceCache.findStudentByRoll(String(roll));
    } else if (name) {
      student = attendanceCache.findStudentByName(String(name));
    }

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const todayStatus = attendanceCache.getTodayStatus(student);
    const { weeklyData, weeklyBreakdown } = attendanceCache.getWeeklyData(student);

    const response: StudentResponse = {
      student,
      todayDate: new Date().toISOString().split('T')[0],
      todayStatus: todayStatus as "Not marked" | "Present" | "Leave" | "Absent" | "Warning",
      isTodayMarked: todayStatus !== "Not marked",
      weeklyData,
      weeklyBreakdown
    };

    res.json(response);
  });

  app.get("/api/students/search", (req, res) => {
    const { roll, name } = req.query;

    if (!roll && !name) {
      return res.status(400).json({ error: "Please provide roll or name parameter" });
    }

    let students: any[] = [];

    if (roll) {
      const student = attendanceCache.findStudentByRoll(String(roll));
      if (student) students = [student];
    } else if (name) {
      students = attendanceCache.searchByName(String(name));
    }

    res.json({ students, count: students.length });
  });

  app.get("/api/admin/pending", (req, res) => {
    const students = attendanceCache.getPendingStudents();

    const pendingStudents: PendingStudent[] = students.map(student => {
      const { weeklyData, weeklyBreakdown } = attendanceCache.getWeeklyData(student);
      
      return {
        studentName: student.studentName,
        rollNo: student.rollNo,
        gender: student.gender,
        school: student.school,
        daysPresent: weeklyData.daysPresent,
        daysRemaining: weeklyData.remaining,
        weeklyBreakdown
      };
    });

    pendingStudents.sort((a, b) => a.daysPresent - b.daysPresent);

    res.json(pendingStudents);
  });

  app.get("/api/refresh", async (req, res) => {
    try {
      await attendanceCache.refresh();
      const status = attendanceCache.getStatus();
      res.json({ success: true, ...status });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to refresh data" });
    }
  });

  app.get("/api/cleanup", (req, res) => {
    try {
      const result = attendanceCache.runCleanup();
      const stats = attendanceCache.getCleanupStats();
      res.json({ 
        success: true, 
        message: "Cleanup completed successfully",
        thisCleanup: result,
        totalStats: stats
      });
    } catch (error) {
      res.status(500).json({ success: false, error: "Failed to run cleanup" });
    }
  });

  app.get("/api/cleanup/stats", (req, res) => {
    const stats = attendanceCache.getCleanupStats();
    res.json(stats);
  });

  const kimi = new OpenAI({
    apiKey: process.env.MOONSHOT_API_KEY,
    baseURL: "https://api.moonshot.cn/v1",
  });

  const chatRateLimit = new Map<string, number>();

  app.post("/api/chat", async (req, res) => {
    const { rollNo, message, history } = req.body;

    if (!rollNo || typeof rollNo !== 'string' || !message || typeof message !== 'string') {
      return res.status(400).json({ error: "rollNo and message required" });
    }

    if (message.length > 500) {
      return res.status(400).json({ error: "Message too long" });
    }

    const now = Date.now();
    const lastRequest = chatRateLimit.get(rollNo) || 0;
    if (now - lastRequest < 2000) {
      return res.status(429).json({ error: "Too many requests. Please wait." });
    }
    chatRateLimit.set(rollNo, now);

    if (!process.env.MOONSHOT_API_KEY) {
      return res.status(500).json({ error: "AI service not configured" });
    }

    const student = attendanceCache.findStudentByRoll(String(rollNo));
    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    const { weeklyData, weeklyBreakdown } = attendanceCache.getWeeklyData(student);
    const todayStatus = attendanceCache.getTodayStatus(student);

    let termContext = "";
    if (student.terms && student.terms.length > 0) {
      termContext = student.terms.map(t => {
        const dayPatterns: Record<string, number> = {};
        for (const [dateStr, status] of Object.entries(t.attendance)) {
          const parts = dateStr.split('/');
          if (parts.length === 3) {
            const d = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
            const dayName = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()];
            if (status.toUpperCase() === 'A' || status.toUpperCase() === 'L') {
              dayPatterns[dayName] = (dayPatterns[dayName] || 0) + 1;
            }
          }
        }
        const absentDays = Object.entries(dayPatterns).sort((a, b) => b[1] - a[1]).map(([day, count]) => `${day}(${count})`).join(', ');

        return `Term: ${t.termName}
  Status: ${t.status}
  Attended: ${t.attendedClasses}/${t.classesConducted} classes conducted (${t.totalClasses} total planned)
  Required: ${t.requiredClasses} classes to clear
  Still needed: ${t.remaining} more classes
  Classes left in term: ${t.classesLeft}
  Percentage: ${t.percentage}%
  Absent/Leave patterns by day: ${absentDays || 'None'}`;
      }).join('\n\n');
    }

    const weekContext = weeklyBreakdown.map(d => `${d.day} ${d.date}: ${d.status}`).join(', ');

    const systemPrompt = `You are PEP Attendance Assistant for Vijaybhoomi University. You help students understand their Physical Education Program (PEP) attendance.

RULES:
- PEP requires 24 out of 30 classes per term to be "Cleared"
- Normal schedule: 3 PEP days per week (Mon-Fri), special weeks like Ranbhoomi have 5 days
- Statuses: P (Present), L (Leave), A (Absent), W (Warning - PEP rule violations)
- Terms: Festival Term (Oct-Dec), Republic Term (Jan-Feb)
- "Cleared" = 24+ classes attended, "Not Cleared" = term ended with <24, "In Progress" = ongoing

STUDENT DATA:
Name: ${student.studentName}
Roll No: ${student.rollNo}
Gender: ${student.gender}
School: ${student.school}
Today's Status: ${todayStatus}

TERM-WISE DATA:
${termContext}

THIS WEEK:
Present: ${weeklyData.daysPresent}/3 required
Status: ${weeklyData.status}
Breakdown: ${weekContext}

INSTRUCTIONS:
- Reply in the same language the student uses (Hindi, Hinglish, or English)
- Keep responses concise and friendly, max 3-4 sentences unless asked for detail
- Give personalized advice based on their actual data
- If they ask predictions, calculate based on their patterns
- Be encouraging but honest about their status
- Use simple language, they are college students`;

    try {
      const messages: any[] = [
        { role: "system", content: systemPrompt },
      ];

      if (history && Array.isArray(history)) {
        const validRoles = new Set(["user", "assistant"]);
        for (const h of history.slice(-8)) {
          if (h && validRoles.has(h.role) && typeof h.content === 'string') {
            messages.push({ role: h.role, content: h.content.slice(0, 1000) });
          }
        }
      }

      const response = await kimi.chat.completions.create({
        model: "kimi-k2",
        messages,
        temperature: 0.7,
        max_tokens: 500,
      });

      const reply = response.choices[0]?.message?.content || "Sorry, I couldn't process that.";
      res.json({ reply });
    } catch (error: any) {
      console.error("[AI Chat] Error:", error.message, error.status || '');
      if (error.status === 401) {
        res.status(500).json({ error: "AI API key is invalid. Please check MOONSHOT_API_KEY." });
      } else {
        res.status(500).json({ error: "AI service temporarily unavailable" });
      }
    }
  });

  return httpServer;
}
