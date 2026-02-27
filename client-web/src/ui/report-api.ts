/**
 * Report API — customer feedback & bug reports
 */

import { apiRequest } from "./auth-api";

export type ReportType = "bug" | "feedback" | "suggestion";
export type ReportStatus = "open" | "in_progress" | "resolved" | "closed";

export interface FeedbackReport {
  id: string;
  user_id: string;
  type: ReportType;
  subject: string;
  content: string;
  status: ReportStatus;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields (admin endpoint)
  user_name?: string;
  user_email?: string;
}

export interface ReportsResponse {
  reports: FeedbackReport[];
  total: number;
}

export async function createReport(
  type: ReportType,
  subject: string,
  content: string,
): Promise<{ report: FeedbackReport; message: string }> {
  return apiRequest("/feedback", {
    method: "POST",
    body: JSON.stringify({ type, subject, content }),
  });
}

export async function getMyReports(limit = 20, offset = 0): Promise<ReportsResponse> {
  return apiRequest(`/feedback?limit=${limit}&offset=${offset}`);
}

export async function getAllReports(limit = 20, offset = 0): Promise<ReportsResponse> {
  return apiRequest(`/feedback/all?limit=${limit}&offset=${offset}`);
}
