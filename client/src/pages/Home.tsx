import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, User, Calendar, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, RefreshCw, History, ChevronDown, ChevronUp, GraduationCap, TrendingUp, CalendarDays, Users, FileSpreadsheet, Printer, FileText, Download, ChevronRight, Award, Target } from "lucide-react";
import type { StudentResponse, CacheStatus, Student, TermData } from "@shared/schema";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

interface SearchResult {
  students: Student[];
  count: number;
}

interface MonthlyData {
  month: string;
  year: number;
  days: { date: string; status: string; dayOfMonth: number }[];
  presentCount: number;
  leaveCount: number;
  absentCount: number;
  notMarkedCount: number;
}

function TermwiseAttendanceHistory({ terms }: { terms: TermData[] }) {
  const [expandedTerms, setExpandedTerms] = useState<Set<string>>(new Set([terms[0]?.termName || ""]));
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "P":
        return <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30 text-xs font-semibold">P</Badge>;
      case "L":
        return <Badge className="bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 text-xs font-semibold">L</Badge>;
      case "A":
        return <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs font-semibold">A</Badge>;
      default:
        return <Badge variant="outline" className="text-xs opacity-50">-</Badge>;
    }
  };

  const getTermStatusBadge = (status: string) => {
    switch (status) {
      case "Cleared":
        return <Badge className="bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-xs font-semibold">Cleared</Badge>;
      case "Not Cleared":
        return <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs font-semibold">Not Cleared</Badge>;
      default:
        return <Badge className="bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30 text-xs font-semibold">In Progress</Badge>;
    }
  };

  const toggleTerm = (termName: string) => {
    setExpandedTerms(prev => {
      const next = new Set(prev);
      if (next.has(termName)) {
        next.delete(termName);
      } else {
        next.add(termName);
      }
      return next;
    });
  };

  const toggleMonth = (key: string) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const getMonthlyDataForTerm = (attendance: Record<string, string>) => {
    const months: Record<string, MonthlyData> = {};

    Object.entries(attendance).forEach(([dateStr, status]) => {
      const parts = dateStr.split("/");
      if (parts.length !== 3) return;
      
      const month = parseInt(parts[0], 10);
      const day = parseInt(parts[1], 10);
      const year = parseInt(parts[2], 10);
      
      if (isNaN(month) || isNaN(day) || isNaN(year)) return;

      const monthKey = `${year}-${month.toString().padStart(2, "0")}`;
      
      if (!months[monthKey]) {
        months[monthKey] = {
          month: monthNames[month - 1],
          year,
          days: [],
          presentCount: 0,
          leaveCount: 0,
          absentCount: 0,
          notMarkedCount: 0
        };
      }

      const upperStatus = status.toUpperCase();
      if (upperStatus === "P") months[monthKey].presentCount++;
      else if (upperStatus === "L") months[monthKey].leaveCount++;
      else if (upperStatus === "A") months[monthKey].absentCount++;
      else months[monthKey].notMarkedCount++;

      months[monthKey].days.push({
        date: dateStr,
        status: upperStatus || "NOT MARKED",
        dayOfMonth: day
      });
    });

    Object.values(months).forEach(m => {
      m.days.sort((a, b) => a.dayOfMonth - b.dayOfMonth);
    });

    return Object.entries(months)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, value]) => ({ key, ...value }));
  };

  if (!terms || terms.length === 0) return null;

  return (
    <Card className="overflow-hidden" data-testid="card-attendance-history">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5">
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <History className="w-5 h-5 text-primary" />
          </div>
          <span>Term-wise Attendance History</span>
        </CardTitle>
        <CardDescription>
          Detailed attendance records for each term
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {terms.map((term, termIndex) => {
          const monthlyData = getMonthlyDataForTerm(term.attendance);
          const presentCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "P").length;
          const leaveCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "L").length;
          const absentCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "A").length;
          
          return (
            <div key={termIndex} className="border rounded-xl overflow-hidden" data-testid={`term-history-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
              <button
                onClick={() => toggleTerm(term.termName)}
                className="w-full flex items-center justify-between p-4 hover-elevate transition-all duration-200 bg-muted/30"
                data-testid={`button-term-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <div className="flex items-center gap-4">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-lg">{term.termName}</span>
                      {getTermStatusBadge(term.status)}
                    </div>
                    <div className="flex flex-wrap gap-3 text-xs mt-1">
                      <span className="font-medium">{term.attendedClasses}/{term.totalClasses} classes</span>
                      <span className="text-violet-600 dark:text-violet-400 font-medium">{presentCount} P</span>
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">{leaveCount} L</span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">{absentCount} A</span>
                    </div>
                  </div>
                </div>
                <div className={`p-1.5 rounded-full transition-transform duration-200 ${expandedTerms.has(term.termName) ? 'rotate-180 bg-primary/10' : 'bg-muted'}`}>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>

              {expandedTerms.has(term.termName) && (
                <div className="border-t p-4 space-y-2 bg-background">
                  {monthlyData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No attendance records for this term</p>
                  ) : (
                    monthlyData.map(({ key, month, year, days, presentCount: mPresent, leaveCount: mLeave, absentCount: mAbsent }) => (
                      <div key={key} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleMonth(`${term.termName}-${key}`)}
                          className="w-full flex items-center justify-between p-3 hover-elevate transition-all duration-200"
                          data-testid={`button-month-${term.termName.replace(/\s+/g, '-').toLowerCase()}-${key}`}
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-1.5 rounded-md bg-muted">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="text-left">
                              <span className="font-semibold text-sm">{month} {year}</span>
                              <div className="flex gap-2 text-xs mt-0.5">
                                <span className="text-violet-600 dark:text-violet-400">{mPresent} P</span>
                                <span className="text-yellow-600 dark:text-yellow-400">{mLeave} L</span>
                                <span className="text-rose-600 dark:text-rose-400">{mAbsent} A</span>
                              </div>
                            </div>
                          </div>
                          <div className={`p-1 rounded-full transition-transform duration-200 ${expandedMonths.has(`${term.termName}-${key}`) ? 'rotate-180 bg-primary/10' : 'bg-muted'}`}>
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </button>
                        
                        {expandedMonths.has(`${term.termName}-${key}`) && (
                          <div className="border-t p-3 bg-muted/20">
                            <div className="grid grid-cols-7 gap-1">
                              {days.map((day, i) => (
                                <div
                                  key={i}
                                  className="text-center p-1.5 rounded-md bg-background border hover:border-primary/30 transition-colors"
                                >
                                  <p className="text-xs text-muted-foreground mb-0.5 font-medium">{day.dayOfMonth}</p>
                                  {getStatusBadge(day.status)}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function TermProgress({ terms }: { terms: TermData[] }) {
  if (!terms || terms.length === 0) return null;

  const getStatusStyles = (status: string) => {
    switch (status) {
      case "Cleared":
        return {
          badge: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
          progress: "bg-emerald-500",
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-500" />,
          bg: "from-emerald-500/10 to-emerald-500/5 dark:from-emerald-500/20 dark:to-emerald-500/10 border-emerald-500/20"
        };
      case "Not Cleared":
        return {
          badge: "bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30",
          progress: "bg-rose-500",
          icon: <XCircle className="w-4 h-4 text-rose-500" />,
          bg: "from-rose-500/10 to-rose-500/5 dark:from-rose-500/20 dark:to-rose-500/10 border-rose-500/20"
        };
      default:
        return {
          badge: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30",
          progress: "bg-amber-500",
          icon: <Clock className="w-4 h-4 text-amber-500" />,
          bg: "from-amber-500/10 to-amber-500/5 dark:from-amber-500/20 dark:to-amber-500/10 border-amber-500/20"
        };
    }
  };

  return (
    <Card className="overflow-hidden" data-testid="card-term-progress">
      <CardHeader className="bg-gradient-to-r from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/5">
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <span>Term-wise Attendance</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <span>Requirement: 24 out of 30 classes per term to be marked as Cleared</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-6 space-y-4">
        {terms.map((term, index) => {
          const styles = getStatusStyles(term.status);
          const progressPercent = Math.min((term.attendedClasses / term.requiredClasses) * 100, 100);
          
          return (
            <div key={index} className={`relative overflow-hidden rounded-xl bg-gradient-to-br ${styles.bg} p-5 border`} data-testid={`term-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="flex items-start justify-between gap-4 mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-background/50">
                    <Award className="w-5 h-5 text-primary" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-lg">{term.termName}</h4>
                    <p className="text-sm text-muted-foreground">
                      {term.attendedClasses} / {term.totalClasses} classes attended
                    </p>
                  </div>
                </div>
                <Badge className={`${styles.badge} font-semibold`} data-testid={`badge-status-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
                  {styles.icon}
                  <span className="ml-1.5">{term.status}</span>
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground font-medium">Progress to requirement ({term.requiredClasses} classes)</span>
                  <span className="font-bold">{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-3 rounded-full bg-background/50 overflow-hidden">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${styles.progress}`}
                    style={{ width: `${progressPercent}%` }}
                  />
                </div>
                {term.status === "In Progress" && term.remaining > 0 && (
                  <p className="text-sm font-medium text-amber-600 dark:text-amber-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {term.remaining} more classes needed to clear this term
                  </p>
                )}
                {term.status === "Cleared" && (
                  <p className="text-sm font-medium text-emerald-600 dark:text-emerald-400 mt-2 flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Term requirement completed
                  </p>
                )}
                {term.status === "Not Cleared" && (
                  <p className="text-sm font-medium text-rose-600 dark:text-rose-400 mt-2 flex items-center gap-1.5">
                    <XCircle className="w-3.5 h-3.5" />
                    Term ended without meeting requirement - {term.remaining} classes pending
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"roll" | "name">("roll");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedRollNo, setSelectedRollNo] = useState<string | null>(null);

  const { data: cacheStatus } = useQuery<CacheStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const searchQueryKey = searchType === "roll" 
    ? `/api/students/search?roll=${encodeURIComponent(activeSearch)}`
    : `/api/students/search?name=${encodeURIComponent(activeSearch)}`;

  const { data: searchResults, isLoading: isSearching } = useQuery<SearchResult>({
    queryKey: [searchQueryKey],
    enabled: activeSearch.length > 0 && !selectedRollNo,
  });

  const studentQueryKey = `/api/student?roll=${encodeURIComponent(selectedRollNo || '')}`;

  const { data: studentData, isLoading: isLoadingStudent } = useQuery<StudentResponse>({
    queryKey: [studentQueryKey],
    enabled: !!selectedRollNo,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      setActiveSearch(searchQuery.trim());
      setSelectedRollNo(null);
    }
  };

  const handleSelectStudent = (rollNo: string) => {
    setSelectedRollNo(rollNo);
  };

  const handleBackToList = () => {
    setSelectedRollNo(null);
  };

  const isLoading = isSearching || isLoadingStudent;

  useEffect(() => {
    if (searchResults && searchResults.count === 1 && !selectedRollNo) {
      setSelectedRollNo(searchResults.students[0].rollNo);
    }
  }, [searchResults, selectedRollNo]);

  const handleRefresh = async () => {
    await apiRequest("GET", "/api/refresh");
    queryClient.invalidateQueries({ queryKey: ["/api/status"] });
    if (activeSearch) {
      queryClient.invalidateQueries({ queryKey: [searchQueryKey] });
      if (selectedRollNo) {
        queryClient.invalidateQueries({ queryKey: [studentQueryKey] });
      }
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "Present":
        return <CheckCircle2 className="w-5 h-5 text-violet-500" />;
      case "Leave":
        return <Clock className="w-5 h-5 text-yellow-400" />;
      case "Absent":
        return <XCircle className="w-5 h-5 text-rose-500" />;
      default:
        return <AlertCircle className="w-5 h-5 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Present":
        return <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30 text-xs font-semibold">P</Badge>;
      case "Leave":
        return <Badge className="bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 text-xs font-semibold">L</Badge>;
      case "Absent":
        return <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 text-xs font-semibold">A</Badge>;
      case "Future":
        return <Badge variant="secondary" className="text-xs opacity-50">-</Badge>;
      default:
        return <Badge variant="outline" className="text-xs opacity-50">-</Badge>;
    }
  };

  const handleExportExcel = (data: StudentResponse) => {
    const attendance = data.student.attendance;
    const rows: { Date: string; Day: string; Status: string }[] = [];
    
    Object.entries(attendance)
      .sort((a, b) => {
        const parseDate = (d: string) => {
          const [m, day, y] = d.split("/").map(Number);
          return new Date(y, m - 1, day).getTime();
        };
        return parseDate(b[0]) - parseDate(a[0]);
      })
      .forEach(([dateStr, status]) => {
        const [m, d, y] = dateStr.split("/").map(Number);
        const date = new Date(y, m - 1, d);
        const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
        const statusText = status.toUpperCase() === "P" ? "Present" : 
                          status.toUpperCase() === "L" ? "Leave" : 
                          status.toUpperCase() === "A" ? "Absent" : "Not Marked";
        rows.push({ Date: dateStr, Day: dayName, Status: statusText });
      });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    
    ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }];
    
    const fileName = `${data.student.studentName.replace(/\s+/g, "_")}_Attendance.xlsx`;
    XLSX.writeFile(wb, fileName);
  };

  const handleExportPDF = (data: StudentResponse) => {
    const doc = new jsPDF();
    const attendance = data.student.attendance;
    
    doc.setFontSize(18);
    doc.text("Attendance Report", 14, 22);
    
    doc.setFontSize(12);
    doc.text(`Student: ${data.student.studentName}`, 14, 35);
    doc.text(`Roll No: ${data.student.rollNo}`, 14, 42);
    doc.text(`School: ${data.student.school}`, 14, 49);
    doc.text(`Gender: ${data.student.gender}`, 14, 56);
    
    const totalPresent = Object.values(attendance).filter(s => s.toUpperCase() === "P").length;
    const totalLeave = Object.values(attendance).filter(s => s.toUpperCase() === "L").length;
    const totalAbsent = Object.values(attendance).filter(s => s.toUpperCase() === "A").length;
    const total = totalPresent + totalLeave + totalAbsent;
    const rate = total > 0 ? Math.round((totalPresent / total) * 100) : 0;
    
    doc.text(`Present: ${totalPresent} | Leave: ${totalLeave} | Absent: ${totalAbsent} | Rate: ${rate}%`, 14, 66);
    
    const rows = Object.entries(attendance)
      .sort((a, b) => {
        const parseDate = (d: string) => {
          const [m, day, y] = d.split("/").map(Number);
          return new Date(y, m - 1, day).getTime();
        };
        return parseDate(b[0]) - parseDate(a[0]);
      })
      .map(([dateStr, status]) => {
        const [m, d, y] = dateStr.split("/").map(Number);
        const date = new Date(y, m - 1, d);
        const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][date.getDay()];
        const statusText = status.toUpperCase() === "P" ? "Present" : 
                          status.toUpperCase() === "L" ? "Leave" : 
                          status.toUpperCase() === "A" ? "Absent" : "Not Marked";
        return [dateStr, dayName, statusText];
      });
    
    autoTable(doc, {
      head: [["Date", "Day", "Status"]],
      body: rows,
      startY: 75,
      theme: "grid",
      headStyles: { fillColor: [34, 139, 34] },
      alternateRowStyles: { fillColor: [245, 245, 245] },
    });
    
    const fileName = `${data.student.studentName.replace(/\s+/g, "_")}_Attendance.pdf`;
    doc.save(fileName);
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary/80 flex items-center justify-center shadow-lg shadow-primary/25">
                  <GraduationCap className="w-6 h-6 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-violet-500 border-2 border-background" />
              </div>
              <div>
                <h1 className="text-xl font-bold bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
                  PEP Attendance
                </h1>
                <p className="text-xs text-muted-foreground font-medium">UG 2025 Batch Lifestyle</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                className="gap-2"
                data-testid="button-refresh"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">Refresh</span>
              </Button>
              <Link href="/admin">
                <Button size="sm" className="gap-2" data-testid="link-admin">
                  <Users className="w-4 h-4" />
                  <span className="hidden sm:inline">Admin</span>
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-3xl mx-auto space-y-6">
          {cacheStatus && (
            <div className={`flex items-center justify-between text-sm rounded-xl px-4 py-3 border transition-all ${cacheStatus.isDemoData ? 'bg-yellow-400/10 text-yellow-700 dark:text-yellow-300 border-yellow-400/20' : 'bg-muted/50 text-muted-foreground border-transparent'}`}>
              <span data-testid="text-cache-status" className="flex items-center gap-2">
                {cacheStatus.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading data from SharePoint...</span>
                  </>
                ) : cacheStatus.isDemoData ? (
                  <>
                    <AlertCircle className="w-4 h-4" />
                    <span>Demo Mode: {cacheStatus.studentCount} sample students</span>
                  </>
                ) : cacheStatus.error ? (
                  <span className="text-destructive">{cacheStatus.error}</span>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-violet-500" />
                    <span>
                      <span className="font-semibold">{cacheStatus.studentCount}</span> students loaded
                      {cacheStatus.lastUpdated && (
                        <span className="opacity-70"> · Updated {new Date(cacheStatus.lastUpdated).toLocaleTimeString()}</span>
                      )}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}

          <Card className="overflow-hidden">
            <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <span>Search Student</span>
              </CardTitle>
              <CardDescription>
                Search by Roll Number or Student Name
              </CardDescription>
            </CardHeader>
            <CardContent className="p-6">
              <form onSubmit={handleSearch} className="space-y-4">
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={searchType === "roll" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchType("roll")}
                    className="gap-2"
                    data-testid="button-search-roll"
                  >
                    Roll No
                  </Button>
                  <Button
                    type="button"
                    variant={searchType === "name" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSearchType("name")}
                    className="gap-2"
                    data-testid="button-search-name"
                  >
                    Name
                  </Button>
                </div>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <Input
                      type="text"
                      placeholder={searchType === "roll" ? "Enter Roll Number..." : "Enter Student Name..."}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-10"
                      data-testid="input-search"
                    />
                  </div>
                  <Button type="submit" className="gap-2 px-6" data-testid="button-search-submit">
                    Search
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>

          {isLoading && activeSearch && (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">Searching for student...</p>
              </CardContent>
            </Card>
          )}

          {searchResults && !selectedRollNo && searchResults.count === 0 && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 text-destructive">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <span className="font-medium" data-testid="text-error">No students found matching "{activeSearch}"</span>
                </div>
              </CardContent>
            </Card>
          )}

          {searchResults && !selectedRollNo && searchResults.count > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-primary/10">
                    <Users className="w-5 h-5 text-primary" />
                  </div>
                  <span>Search Results</span>
                  <Badge variant="secondary">{searchResults.count} found</Badge>
                </CardTitle>
                <CardDescription>
                  Click on a student to view their attendance details
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {searchResults.students.map((student) => (
                    <button
                      key={student.rollNo}
                      onClick={() => handleSelectStudent(student.rollNo)}
                      className="w-full flex items-center justify-between p-4 hover-elevate transition-all text-left"
                      data-testid={`button-student-${student.rollNo}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                          <User className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                          <p className="font-semibold">{student.studentName}</p>
                          <div className="flex items-center gap-2 mt-1">
                            <Badge variant="secondary" className="font-mono text-xs">
                              {student.rollNo}
                            </Badge>
                            {student.school && (
                              <Badge variant="outline" className="text-xs">
                                {student.school}
                              </Badge>
                            )}
                          </div>
                        </div>
                      </div>
                      <ChevronRight className="w-5 h-5 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {studentData && selectedRollNo && (
            <div className="space-y-4">
              {searchResults && searchResults.count > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBackToList}
                  className="gap-2"
                  data-testid="button-back-to-list"
                >
                  <ChevronDown className="w-4 h-4 rotate-90" />
                  Back to Search Results ({searchResults.count} students)
                </Button>
              )}
              <Card className="overflow-hidden" id="student-report">
                <div className="h-2 bg-gradient-to-r from-primary via-primary/80 to-primary/60 print:hidden" />
                <CardHeader className="pb-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="relative print:hidden">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                          <User className="w-8 h-8 text-primary" />
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center ${studentData.todayStatus === 'Present' ? 'bg-violet-500' : studentData.todayStatus === 'Leave' ? 'bg-yellow-400' : studentData.todayStatus === 'Absent' ? 'bg-rose-500' : 'bg-muted'}`}>
                          {studentData.todayStatus === 'Present' && <CheckCircle2 className="w-3 h-3 text-white" />}
                          {studentData.todayStatus === 'Leave' && <Clock className="w-3 h-3 text-white" />}
                          {studentData.todayStatus === 'Absent' && <XCircle className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                      <div>
                        <CardTitle className="text-xl" data-testid="text-student-name">
                          {studentData.student.studentName}
                        </CardTitle>
                        <div className="flex flex-wrap items-center gap-2 mt-2">
                          <Badge variant="secondary" className="font-mono" data-testid="text-roll-no">
                            {studentData.student.rollNo}
                          </Badge>
                          <Badge variant="outline" data-testid="text-gender">
                            {studentData.student.gender}
                          </Badge>
                          <Badge variant="outline" data-testid="text-school">
                            {studentData.student.school}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="print:hidden">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="outline" size="sm" className="gap-1.5" data-testid="button-export-dropdown">
                            <Download className="w-4 h-4" />
                            <span className="hidden sm:inline">Export</span>
                            <ChevronDown className="w-3 h-3 ml-1" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleExportExcel(studentData)} data-testid="button-export-excel">
                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                            Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleExportPDF(studentData)} data-testid="button-export-pdf">
                            <FileText className="w-4 h-4 mr-2" />
                            PDF
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handlePrint()} data-testid="button-print">
                            <Printer className="w-4 h-4 mr-2" />
                            Print
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-6 pb-6">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 p-5 border">
                      <div className="absolute top-3 right-3 opacity-5">
                        <Calendar className="w-16 h-16" />
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mb-2">Today ({studentData.todayDate})</p>
                      <div className="flex items-center gap-3">
                        {getStatusIcon(studentData.todayStatus)}
                        <span className="text-lg font-bold" data-testid="text-today-status">{studentData.todayStatus}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2" data-testid="text-today-marked">
                        {studentData.isTodayMarked ? "Attendance marked" : "Attendance not marked yet"}
                      </p>
                    </div>

                    <div className="relative overflow-hidden rounded-xl bg-gradient-to-br from-muted/50 to-muted/30 p-5 border">
                      <div className="absolute top-3 right-3 opacity-5">
                        <TrendingUp className="w-16 h-16" />
                      </div>
                      <p className="text-sm text-muted-foreground font-medium mb-2">Weekly Progress</p>
                      <div className="flex items-center gap-3">
                        {studentData.weeklyData.status === "Completed" ? (
                          <CheckCircle2 className="w-5 h-5 text-violet-500" />
                        ) : (
                          <Clock className="w-5 h-5 text-yellow-400" />
                        )}
                        <span className="text-lg font-bold" data-testid="text-weekly-status">
                          {studentData.weeklyData.status}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2" data-testid="text-weekly-count">
                        {studentData.weeklyData.daysPresent}/{studentData.weeklyData.daysRequired} days present
                        {studentData.weeklyData.remaining > 0 && (
                          <span className="text-yellow-600 dark:text-yellow-400 font-medium"> · {studentData.weeklyData.remaining} more needed</span>
                        )}
                      </p>
                    </div>
                  </div>

                  <div>
                    <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
                      <CalendarDays className="w-4 h-4 text-muted-foreground" />
                      This Week
                    </h4>
                    <div className="grid grid-cols-5 gap-2">
                      {studentData.weeklyBreakdown.map((day, i) => (
                        <div
                          key={i}
                          className="text-center p-3 rounded-xl bg-muted/30 border hover:border-primary/30 transition-colors"
                          data-testid={`day-${day.day.toLowerCase()}`}
                        >
                          <p className="text-xs font-bold text-muted-foreground">{day.day}</p>
                          <p className="text-xs text-muted-foreground/70 mb-2">{day.date}</p>
                          {getStatusBadge(day.status)}
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>

              {studentData.student.terms && studentData.student.terms.length > 0 && (
                <>
                  <TermProgress terms={studentData.student.terms} />
                  <TermwiseAttendanceHistory terms={studentData.student.terms} />
                </>
              )}
            </div>
          )}

          {!activeSearch && !isLoading && (
            <Card className="border-dashed border-2">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-muted/50 flex items-center justify-center">
                  <Search className="w-10 h-10 text-muted-foreground/30" />
                </div>
                <div className="text-center">
                  <p className="text-muted-foreground font-medium">
                    Enter a Roll Number or Student Name
                  </p>
                  <p className="text-sm text-muted-foreground/70 mt-1">
                    Search to view attendance details
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  );
}
