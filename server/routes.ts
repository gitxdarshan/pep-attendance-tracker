import type { Express } from "express";
import { createServer, type Server } from "http";
import { attendanceCache } from "./scraper";
import type { StudentResponse, PendingStudent } from "@shared/schema";
import { getVapidPublicKey, addSubscription, removeSubscription, removeAllSubscriptions, getSubscriptionCount } from "./push";

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

  app.get("/api/push/vapid-key", (req, res) => {
    const key = getVapidPublicKey();
    if (!key) {
      return res.status(500).json({ error: "Push notifications not configured" });
    }
    res.json({ publicKey: key });
  });

  app.post("/api/push/subscribe", (req, res) => {
    const { rollNo, subscription } = req.body;
    if (!rollNo || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: "rollNo and subscription required" });
    }
    addSubscription(rollNo, subscription);
    res.json({ success: true, message: "Subscribed to notifications" });
  });

  app.post("/api/push/unsubscribe", (req, res) => {
    const { rollNo, endpoint } = req.body;
    if (!rollNo) {
      return res.status(400).json({ error: "rollNo required" });
    }
    if (endpoint) {
      removeSubscription(rollNo, endpoint);
    } else {
      removeAllSubscriptions(rollNo);
    }
    res.json({ success: true, message: "Unsubscribed from notifications" });
  });

  app.get("/api/push/stats", (req, res) => {
    res.json({ totalSubscriptions: getSubscriptionCount() });
  });

  return httpServer;
}
