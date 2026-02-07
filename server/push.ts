import webPush from "web-push";
import type { Student } from "@shared/schema";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:pep@vijaybhoomi.edu.in";

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
  console.log("[Push] VAPID keys configured");
} else {
  console.warn("[Push] VAPID keys not set - push notifications disabled");
}

interface PushSubscriptionData {
  rollNo: string;
  subscription: webPush.PushSubscription;
  subscribedAt: Date;
}

const subscriptions: Map<string, PushSubscriptionData[]> = new Map();

const previousAttendance: Map<string, Record<string, string>> = new Map();

export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}

export function addSubscription(rollNo: string, subscription: webPush.PushSubscription): boolean {
  const existing = subscriptions.get(rollNo) || [];

  const alreadyExists = existing.some(
    (s) => s.subscription.endpoint === subscription.endpoint
  );

  if (!alreadyExists) {
    existing.push({
      rollNo,
      subscription,
      subscribedAt: new Date(),
    });
    subscriptions.set(rollNo, existing);
    console.log(`[Push] Added subscription for ${rollNo} (total: ${existing.length})`);
  }

  return true;
}

export function removeSubscription(rollNo: string, endpoint: string): boolean {
  const existing = subscriptions.get(rollNo) || [];
  const filtered = existing.filter((s) => s.subscription.endpoint !== endpoint);

  if (filtered.length === 0) {
    subscriptions.delete(rollNo);
  } else {
    subscriptions.set(rollNo, filtered);
  }

  console.log(`[Push] Removed subscription for ${rollNo}`);
  return true;
}

export function removeAllSubscriptions(rollNo: string): boolean {
  subscriptions.delete(rollNo);
  console.log(`[Push] Removed all subscriptions for ${rollNo}`);
  return true;
}

export function getSubscriptionCount(): number {
  let count = 0;
  subscriptions.forEach((subs) => (count += subs.length));
  return count;
}

export async function checkAndNotifyNewAttendance(students: Student[]): Promise<number> {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) return 0;

  let notificationsSent = 0;

  for (const student of students) {
    const rollNo = student.rollNo;
    const subs = subscriptions.get(rollNo);
    if (!subs || subs.length === 0) continue;

    const prevAttendance = previousAttendance.get(rollNo);
    const currentAttendance = student.attendance;

    if (!prevAttendance) {
      previousAttendance.set(rollNo, { ...currentAttendance });
      continue;
    }

    const newDates: string[] = [];
    for (const [date, status] of Object.entries(currentAttendance)) {
      if (!prevAttendance[date]) {
        newDates.push(date);
      } else if (prevAttendance[date] !== status) {
        newDates.push(date);
      }
    }

    if (newDates.length > 0) {
      const latestDate = newDates.sort((a, b) => {
        const [m1, d1, y1] = a.split("/").map(Number);
        const [m2, d2, y2] = b.split("/").map(Number);
        return new Date(y2, m2 - 1, d2).getTime() - new Date(y1, m1 - 1, d1).getTime();
      })[0];

      const latestStatus = currentAttendance[latestDate]?.toUpperCase();
      const statusText =
        latestStatus === "P" ? "Present" :
        latestStatus === "L" ? "Leave" :
        latestStatus === "A" ? "Absent" :
        latestStatus === "W" ? "Warning" : "Updated";

      const totalPresent = Object.values(currentAttendance).filter(
        (s) => s.toUpperCase() === "P"
      ).length;

      const payload = JSON.stringify({
        title: `PEP Attendance: ${statusText}`,
        body: `${student.studentName} - ${latestDate}: ${statusText}. Total Present: ${totalPresent}`,
        icon: "/favicon.png",
        badge: "/favicon.png",
        data: {
          rollNo,
          date: latestDate,
          status: statusText,
          url: "/",
        },
      });

      const failedEndpoints: string[] = [];

      for (const sub of subs) {
        try {
          await webPush.sendNotification(sub.subscription, payload);
          notificationsSent++;
          console.log(`[Push] Notification sent to ${rollNo}`);
        } catch (error: any) {
          console.error(`[Push] Failed to send to ${rollNo}:`, error?.statusCode || error?.message);
          if (error?.statusCode === 410 || error?.statusCode === 404) {
            failedEndpoints.push(sub.subscription.endpoint);
          }
        }
      }

      for (const endpoint of failedEndpoints) {
        removeSubscription(rollNo, endpoint);
      }
    }

    previousAttendance.set(rollNo, { ...currentAttendance });
  }

  if (notificationsSent > 0) {
    console.log(`[Push] Sent ${notificationsSent} notifications total`);
  }

  return notificationsSent;
}

export function initializePreviousAttendance(students: Student[]): void {
  for (const student of students) {
    const subs = subscriptions.get(student.rollNo);
    if (subs && subs.length > 0) {
      if (!previousAttendance.has(student.rollNo)) {
        previousAttendance.set(student.rollNo, { ...student.attendance });
      }
    }
  }
}
