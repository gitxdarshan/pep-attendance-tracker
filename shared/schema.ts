import { z } from "zod";

export const termDataSchema = z.object({
  termName: z.string(),
  percentage: z.number(),
  attendedClasses: z.number(),
  totalClasses: z.number(),
  requiredClasses: z.number(),
  status: z.enum(["Cleared", "Not Cleared", "In Progress"]),
  remaining: z.number(),
  attendance: z.record(z.string(), z.string()),
});

export type TermData = z.infer<typeof termDataSchema>;

export const studentSchema = z.object({
  gender: z.string(),
  studentName: z.string(),
  rollNo: z.string(),
  school: z.string(),
  attendance: z.record(z.string(), z.string()),
  terms: z.array(termDataSchema).optional(),
});

export type Student = z.infer<typeof studentSchema>;

export const attendanceDataSchema = z.object({
  students: z.array(studentSchema),
  headers: z.array(z.string()),
  termNames: z.array(z.string()).optional(),
  lastUpdated: z.string(),
  error: z.string().optional(),
});

export type AttendanceData = z.infer<typeof attendanceDataSchema>;

export interface StudentResponse {
  student: Student;
  todayDate: string;
  todayStatus: "Present" | "Leave" | "Absent" | "Warning" | "Not marked";
  isTodayMarked: boolean;
  weeklyData: WeeklyData;
  weeklyBreakdown: DayBreakdown[];
}

export interface WeeklyData {
  daysPresent: number;
  daysRequired: number;
  status: "Completed" | "Pending";
  remaining: number;
}

export interface DayBreakdown {
  day: string;
  date: string;
  status: "Present" | "Leave" | "Absent" | "Warning" | "Not marked" | "Future";
}

export interface PendingStudent {
  studentName: string;
  rollNo: string;
  gender: string;
  school: string;
  daysPresent: number;
  daysRemaining: number;
  weeklyBreakdown: DayBreakdown[];
}

export interface CacheStatus {
  lastUpdated: string | null;
  studentCount: number;
  isLoading: boolean;
  error: string | null;
  isDemoData?: boolean;
}
