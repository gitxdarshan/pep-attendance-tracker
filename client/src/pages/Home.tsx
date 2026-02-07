import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Search, User, Calendar, CheckCircle2, XCircle, Clock, AlertCircle, Loader2, RefreshCw, History, ChevronDown, ChevronUp, GraduationCap, TrendingUp, CalendarDays, Users, FileSpreadsheet, FileText, Download, ChevronRight, ChevronLeft, Award, Target, Heart, HeartOff, LogOut } from "lucide-react";
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
  warningCount: number;
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
      case "W":
        return <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30 text-xs font-semibold">W</Badge>;
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
          warningCount: 0,
          notMarkedCount: 0
        };
      }

      const upperStatus = status.toUpperCase();
      if (upperStatus === "P") months[monthKey].presentCount++;
      else if (upperStatus === "L") months[monthKey].leaveCount++;
      else if (upperStatus === "A") months[monthKey].absentCount++;
      else if (upperStatus === "W") months[monthKey].warningCount++;
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
      <CardHeader className="bg-gradient-to-r from-purple-500/10 to-transparent">
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <History className="w-5 h-5 text-primary" />
          </div>
          <span>Term-wise Attendance History</span>
        </CardTitle>
        <CardDescription>
          Detailed attendance records for each term
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 space-y-4">
        {terms.map((term, termIndex) => {
          const monthlyData = getMonthlyDataForTerm(term.attendance);
          const presentCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "P").length;
          const leaveCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "L").length;
          const absentCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "A").length;
          const warningCount = Object.values(term.attendance).filter(s => s.toUpperCase() === "W").length;
          
          return (
            <div key={termIndex} className="border rounded-xl overflow-hidden" data-testid={`term-history-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
              <button
                onClick={() => toggleTerm(term.termName)}
                className="w-full flex items-center justify-between p-3 sm:p-4 hover-elevate transition-all duration-200 glass"
                data-testid={`button-term-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}
              >
                <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-purple-500/20 shrink-0">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                  <div className="text-left min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-bold text-base sm:text-lg">{term.termName}</span>
                      {getTermStatusBadge(term.status)}
                    </div>
                    <div className="flex flex-wrap gap-2 sm:gap-3 text-xs mt-1">
                      <span className="font-medium">{term.attendedClasses}/{term.totalClasses} classes</span>
                      <span className="text-violet-600 dark:text-violet-400 font-medium">{presentCount} P</span>
                      <span className="text-yellow-600 dark:text-yellow-400 font-medium">{leaveCount} L</span>
                      <span className="text-rose-600 dark:text-rose-400 font-medium">{absentCount} A</span>
                      {warningCount > 0 && <span className="text-orange-600 dark:text-orange-400 font-medium">{warningCount} W</span>}
                    </div>
                  </div>
                </div>
                <div className={`p-1.5 rounded-full transition-transform duration-200 ${expandedTerms.has(term.termName) ? 'rotate-180 bg-primary/10' : 'bg-muted'}`}>
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                </div>
              </button>

              {expandedTerms.has(term.termName) && (
                <div className="border-t p-2 sm:p-4 space-y-2 bg-transparent">
                  {monthlyData.length === 0 ? (
                    <p className="text-center text-muted-foreground py-4">No attendance records for this term</p>
                  ) : (
                    monthlyData.map(({ key, month, year, days, presentCount: mPresent, leaveCount: mLeave, absentCount: mAbsent, warningCount: mWarning }) => (
                      <div key={key} className="border rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleMonth(`${term.termName}-${key}`)}
                          className="w-full flex items-center justify-between p-2 sm:p-3 hover-elevate transition-all duration-200"
                          data-testid={`button-month-${term.termName.replace(/\s+/g, '-').toLowerCase()}-${key}`}
                        >
                          <div className="flex items-center gap-2 sm:gap-3">
                            <div className="p-1.5 rounded-md bg-muted">
                              <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                            </div>
                            <div className="text-left">
                              <span className="font-semibold text-sm">{month} {year}</span>
                              <div className="flex gap-2 text-xs mt-0.5">
                                <span className="text-violet-600 dark:text-violet-400">{mPresent} P</span>
                                <span className="text-yellow-600 dark:text-yellow-400">{mLeave} L</span>
                                <span className="text-rose-600 dark:text-rose-400">{mAbsent} A</span>
                                {mWarning > 0 && <span className="text-orange-600 dark:text-orange-400">{mWarning} W</span>}
                              </div>
                            </div>
                          </div>
                          <div className={`p-1 rounded-full transition-transform duration-200 ${expandedMonths.has(`${term.termName}-${key}`) ? 'rotate-180 bg-primary/10' : 'bg-muted'}`}>
                            <ChevronDown className="w-3 h-3 text-muted-foreground" />
                          </div>
                        </button>
                        
                        {expandedMonths.has(`${term.termName}-${key}`) && (
                          <div className="border-t p-2 sm:p-3 bg-muted/20">
                            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                              {days.map((day, i) => (
                                <div
                                  key={i}
                                  className="text-center p-1 sm:p-1.5 rounded-md bg-background border hover:border-primary/30 transition-colors"
                                >
                                  <p className="text-[10px] sm:text-xs text-muted-foreground mb-0.5 font-medium">{day.dayOfMonth}</p>
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
      <CardHeader className="bg-gradient-to-r from-purple-500/10 to-transparent">
        <CardTitle className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-purple-500/20">
            <Target className="w-5 h-5 text-primary" />
          </div>
          <span>Term-wise Attendance</span>
        </CardTitle>
        <CardDescription className="flex items-center gap-2">
          <span>Requirement: 24 out of 30 classes per term to be marked as Cleared</span>
        </CardDescription>
      </CardHeader>
      <CardContent className="p-3 sm:p-6 space-y-4">
        {terms.map((term, index) => {
          const styles = getStatusStyles(term.status);
          const progressPercent = Math.min((term.attendedClasses / term.requiredClasses) * 100, 100);
          
          return (
            <div key={index} className={`relative glass rounded-xl bg-gradient-to-br ${styles.bg} p-3 sm:p-5 border`} data-testid={`term-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
              <div className="flex flex-wrap items-start justify-between gap-2 sm:gap-4 mb-4">
                <div className="flex items-center gap-2 sm:gap-3 min-w-0">
                  <div className="p-1.5 sm:p-2 rounded-lg bg-background/50 shrink-0">
                    <Award className="w-4 h-4 sm:w-5 sm:h-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h4 className="font-semibold text-base sm:text-lg">{term.termName}</h4>
                    <p className="text-xs sm:text-sm text-muted-foreground">
                      {term.attendedClasses} / {term.totalClasses} classes attended
                    </p>
                  </div>
                </div>
                <Badge className={`${styles.badge} font-semibold shrink-0`} data-testid={`badge-status-${term.termName.replace(/\s+/g, '-').toLowerCase()}`}>
                  {styles.icon}
                  <span className="ml-1.5">{term.status}</span>
                </Badge>
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between gap-2 text-xs sm:text-sm">
                  <span className="text-muted-foreground font-medium">Progress to requirement ({term.requiredClasses} classes)</span>
                  <span className="font-bold">{Math.round(progressPercent)}%</span>
                </div>
                <div className="h-3 rounded-full bg-white/10 overflow-hidden">
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

function AttendanceCalendar({ attendance }: { attendance: Record<string, string> }) {
  const [isOpen, setIsOpen] = useState(false);
  
  const getLatestMonth = useCallback(() => {
    const dates = Object.keys(attendance).map(dateStr => {
      const [m, d, y] = dateStr.split("/").map(Number);
      return new Date(y, m - 1, d);
    }).filter(d => !isNaN(d.getTime()));
    
    if (dates.length > 0) {
      dates.sort((a, b) => b.getTime() - a.getTime());
      return new Date(dates[0].getFullYear(), dates[0].getMonth(), 1);
    }
    return new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  }, [attendance]);

  const [currentDate, setCurrentDate] = useState(getLatestMonth);

  useEffect(() => {
    setCurrentDate(getLatestMonth());
  }, [attendance, getLatestMonth]);

  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const goToPrevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const goToNextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  const getFirstDayOfMonth = (year: number, month: number) => {
    return new Date(year, month, 1).getDay();
  };

  const getAttendanceForDate = (day: number) => {
    const month = currentDate.getMonth() + 1;
    const year = currentDate.getFullYear();
    const dateKey = `${month}/${day}/${year}`;
    return attendance[dateKey]?.toUpperCase() || null;
  };

  const getStatusBadge = (status: string | null) => {
    if (!status) return null;
    switch (status) {
      case "P":
        return <Badge className="bg-violet-500/20 text-violet-700 dark:text-violet-300 border-violet-500/30 text-[10px] font-bold px-1.5 py-0">P</Badge>;
      case "L":
        return <Badge className="bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30 text-[10px] font-bold px-1.5 py-0">L</Badge>;
      case "A":
        return <Badge className="bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px] font-bold px-1.5 py-0">A</Badge>;
      case "W":
        return <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30 text-[10px] font-bold px-1.5 py-0">W</Badge>;
      default:
        return null;
    }
  };

  const getDayBgClass = (status: string | null) => {
    if (!status) return "bg-background";
    switch (status) {
      case "P":
        return "bg-violet-500/10 border-violet-500/30";
      case "L":
        return "bg-yellow-400/10 border-yellow-400/30";
      case "A":
        return "bg-rose-500/10 border-rose-500/30";
      case "W":
        return "bg-orange-500/10 border-orange-500/30";
      default:
        return "bg-background";
    }
  };

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const isCurrentMonth = today.getFullYear() === year && today.getMonth() === month;

  const calendarDays = [];
  for (let i = 0; i < firstDay; i++) {
    calendarDays.push(null);
  }
  for (let day = 1; day <= daysInMonth; day++) {
    calendarDays.push(day);
  }

  const monthStats = useMemo(() => {
    let present = 0, leave = 0, absent = 0, warning = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const status = getAttendanceForDate(day);
      if (status === "P") present++;
      else if (status === "L") leave++;
      else if (status === "A") absent++;
      else if (status === "W") warning++;
    }
    return { present, leave, absent, warning, total: present + leave + absent + warning };
  }, [currentDate, attendance]);

  return (
    <Card className="overflow-hidden" data-testid="card-attendance-calendar">
      <CardHeader 
        className="bg-gradient-to-r from-purple-500/10 to-transparent cursor-pointer hover-elevate"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-purple-500/20">
              <CalendarDays className="w-5 h-5 text-primary" />
            </div>
            <span>Attendance Calendar</span>
          </CardTitle>
          <Button variant="ghost" size="icon" data-testid="button-toggle-calendar" aria-label={isOpen ? "Close calendar" : "Open calendar"}>
            {isOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
          </Button>
        </div>
      </CardHeader>
      
      {isOpen && (
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={(e) => { e.stopPropagation(); goToPrevMonth(); }} data-testid="button-prev-month" aria-label="Previous month">
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="font-semibold min-w-[130px] text-center text-sm sm:text-base">
                {monthNames[month]} {year}
              </span>
              <Button variant="outline" size="icon" onClick={(e) => { e.stopPropagation(); goToNextMonth(); }} data-testid="button-next-month" aria-label="Next month">
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
            <div className="flex items-center gap-3 text-xs sm:text-sm flex-wrap justify-center">
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-violet-500"></div>
                <span className="text-muted-foreground">P: <span className="font-semibold text-foreground">{monthStats.present}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-yellow-400"></div>
                <span className="text-muted-foreground">L: <span className="font-semibold text-foreground">{monthStats.leave}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-rose-500"></div>
                <span className="text-muted-foreground">A: <span className="font-semibold text-foreground">{monthStats.absent}</span></span>
              </span>
              <span className="flex items-center gap-1.5">
                <div className="w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full bg-orange-500"></div>
                <span className="text-muted-foreground">W: <span className="font-semibold text-foreground">{monthStats.warning}</span></span>
              </span>
            </div>
          </div>
          
          <div className="grid grid-cols-7 gap-1 mb-2">
            {dayNames.map(day => (
              <div key={day} className="text-center text-[10px] sm:text-xs font-semibold text-muted-foreground py-1 sm:py-2">
                {day}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
            {calendarDays.map((day, index) => {
              if (day === null) {
                return <div key={`empty-${index}`} className="aspect-square" />;
              }
              const status = getAttendanceForDate(day);
              const isToday = isCurrentMonth && day === today.getDate();
              
              return (
                <div
                  key={day}
                  className={`aspect-square flex flex-col items-center justify-center rounded-md sm:rounded-lg border transition-colors ${getDayBgClass(status)} ${isToday ? 'ring-2 ring-primary ring-offset-1' : ''}`}
                  data-testid={`calendar-day-${day}`}
                >
                  <span className={`text-[10px] sm:text-xs font-medium ${isToday ? 'text-primary font-bold' : 'text-muted-foreground'}`}>
                    {day}
                  </span>
                  {getStatusBadge(status)}
                </div>
              );
            })}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

const SAVED_STUDENT_KEY = "pep_saved_student";

function getSavedStudent(): { rollNo: string; name: string } | null {
  try {
    const saved = localStorage.getItem(SAVED_STUDENT_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Error reading saved student:", e);
  }
  return null;
}

function saveStudent(rollNo: string, name: string) {
  try {
    localStorage.setItem(SAVED_STUDENT_KEY, JSON.stringify({ rollNo, name }));
  } catch (e) {
    console.error("Error saving student:", e);
  }
}

function clearSavedStudent() {
  try {
    localStorage.removeItem(SAVED_STUDENT_KEY);
  } catch (e) {
    console.error("Error clearing saved student:", e);
  }
}

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchType, setSearchType] = useState<"roll" | "name">("roll");
  const [activeSearch, setActiveSearch] = useState("");
  const [selectedRollNo, setSelectedRollNo] = useState<string | null>(null);
  const [isRemembered, setIsRemembered] = useState(false);
  const [isSavedStudent, setIsSavedStudent] = useState(false);

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

  useEffect(() => {
    const saved = getSavedStudent();
    if (saved && !selectedRollNo && !activeSearch) {
      setSelectedRollNo(saved.rollNo);
      setIsRemembered(true);
      setIsSavedStudent(true);
    }
  }, []);

  useEffect(() => {
    if (selectedRollNo) {
      const saved = getSavedStudent();
      if (saved && saved.rollNo === selectedRollNo) {
        setIsRemembered(true);
        setIsSavedStudent(true);
      } else {
        setIsRemembered(false);
        setIsSavedStudent(false);
      }
    }
  }, [selectedRollNo]);

  const handleRememberToggle = () => {
    if (!studentData) return;
    
    if (isRemembered) {
      clearSavedStudent();
      setIsRemembered(false);
      setIsSavedStudent(false);
    } else {
      saveStudent(studentData.student.rollNo, studentData.student.studentName);
      setIsRemembered(true);
      setIsSavedStudent(true);
    }
  };

  const handleLogout = () => {
    clearSavedStudent();
    setIsRemembered(false);
    setIsSavedStudent(false);
    setSelectedRollNo(null);
    setActiveSearch("");
    setSearchQuery("");
  };

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
      case "Warning":
        return <Badge className="bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/30 text-xs font-semibold">W</Badge>;
      case "Future":
        return <Badge variant="secondary" className="text-xs opacity-50">-</Badge>;
      default:
        return <Badge variant="outline" className="text-xs opacity-50">-</Badge>;
    }
  };

  const getStatusText = (s: string) => {
    const u = s.toUpperCase();
    if (u === "P") return "Present";
    if (u === "L") return "Leave";
    if (u === "A") return "Absent";
    if (u === "W") return "Warning";
    return "Not Marked";
  };

  const parseDateSort = (d: string) => {
    const [m, day, y] = d.split("/").map(Number);
    return new Date(y, m - 1, day).getTime();
  };

  const getDayName = (dateStr: string) => {
    const [m, d, y] = dateStr.split("/").map(Number);
    return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(y, m - 1, d).getDay()];
  };

  const handleExportExcel = (data: StudentResponse) => {
    const wb = XLSX.utils.book_new();
    const terms = data.student.terms || [];

    const summaryRows: Record<string, string | number>[] = [
      { "Field": "Student Name", "Value": data.student.studentName },
      { "Field": "Roll No", "Value": data.student.rollNo },
      { "Field": "School", "Value": data.student.school },
      { "Field": "Gender", "Value": data.student.gender },
      { "Field": "", "Value": "" },
    ];

    terms.forEach(term => {
      const p = Object.values(term.attendance).filter(s => s.toUpperCase() === "P").length;
      const l = Object.values(term.attendance).filter(s => s.toUpperCase() === "L").length;
      const a = Object.values(term.attendance).filter(s => s.toUpperCase() === "A").length;
      const w = Object.values(term.attendance).filter(s => s.toUpperCase() === "W").length;
      summaryRows.push(
        { "Field": term.termName, "Value": term.status },
        { "Field": "Attended", "Value": `${term.attendedClasses} / ${term.totalClasses}` },
        { "Field": "Present", "Value": p },
        { "Field": "Leave", "Value": l },
        { "Field": "Absent", "Value": a },
        { "Field": "Warning", "Value": w },
        { "Field": "Remaining to Clear", "Value": term.remaining },
        { "Field": "", "Value": "" },
      );
    });

    const summaryWs = XLSX.utils.json_to_sheet(summaryRows);
    summaryWs["!cols"] = [{ wch: 20 }, { wch: 25 }];
    XLSX.utils.book_append_sheet(wb, summaryWs, "Summary");

    terms.forEach(term => {
      const rows = Object.entries(term.attendance)
        .sort((a, b) => parseDateSort(a[0]) - parseDateSort(b[0]))
        .map(([dateStr, status]) => ({
          "Date": dateStr,
          "Day": getDayName(dateStr),
          "Status": getStatusText(status),
          "Code": status.toUpperCase()
        }));

      if (rows.length > 0) {
        const ws = XLSX.utils.json_to_sheet(rows);
        ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 6 }];
        const sheetName = term.termName.substring(0, 31);
        XLSX.utils.book_append_sheet(wb, ws, sheetName);
      }
    });

    if (terms.length === 0) {
      const rows = Object.entries(data.student.attendance)
        .sort((a, b) => parseDateSort(b[0]) - parseDateSort(a[0]))
        .map(([dateStr, status]) => ({
          "Date": dateStr, "Day": getDayName(dateStr),
          "Status": getStatusText(status), "Code": status.toUpperCase()
        }));
      const ws = XLSX.utils.json_to_sheet(rows);
      ws["!cols"] = [{ wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 6 }];
      XLSX.utils.book_append_sheet(wb, ws, "Attendance");
    }

    XLSX.writeFile(wb, `${data.student.studentName.replace(/\s+/g, "_")}_Attendance.xlsx`);
  };

  const handleExportPDF = (data: StudentResponse) => {
    const doc = new jsPDF();
    const terms = data.student.terms || [];

    doc.setFontSize(20);
    doc.setFont("helvetica", "bold");
    doc.text("PEP Attendance Report", 14, 20);

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Student: ${data.student.studentName}`, 14, 32);
    doc.text(`Roll No: ${data.student.rollNo}`, 14, 38);
    doc.text(`School: ${data.student.school}`, 14, 44);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-IN")}`, 14, 50);

    let yPos = 60;

    if (terms.length > 0) {
      doc.setFontSize(14);
      doc.setFont("helvetica", "bold");
      doc.text("Term-wise Summary", 14, yPos);
      yPos += 4;

      const termSummaryRows = terms.map(term => {
        const p = Object.values(term.attendance).filter(s => s.toUpperCase() === "P").length;
        const l = Object.values(term.attendance).filter(s => s.toUpperCase() === "L").length;
        const a = Object.values(term.attendance).filter(s => s.toUpperCase() === "A").length;
        const w = Object.values(term.attendance).filter(s => s.toUpperCase() === "W").length;
        return [
          term.termName,
          term.status,
          `${term.attendedClasses} / ${term.totalClasses}`,
          String(p), String(l), String(a), String(w),
          term.remaining > 0 ? String(term.remaining) : "-"
        ];
      });

      autoTable(doc, {
        head: [["Term", "Status", "Attended", "P", "L", "A", "W", "Remaining"]],
        body: termSummaryRows,
        startY: yPos,
        theme: "grid",
        headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
        bodyStyles: { fontSize: 9 },
        columnStyles: {
          1: { fontStyle: "bold" },
        },
        didParseCell: (hookData: any) => {
          if (hookData.section === "body" && hookData.column.index === 1) {
            const val = hookData.cell.raw;
            if (val === "Cleared") hookData.cell.styles.textColor = [16, 185, 129];
            else if (val === "Not Cleared") hookData.cell.styles.textColor = [239, 68, 68];
            else hookData.cell.styles.textColor = [245, 158, 11];
          }
        }
      });

      yPos = (doc as any).lastAutoTable.finalY + 12;

      terms.forEach(term => {
        const termRows = Object.entries(term.attendance)
          .sort((a, b) => parseDateSort(a[0]) - parseDateSort(b[0]))
          .map(([dateStr, status]) => [dateStr, getDayName(dateStr), getStatusText(status)]);

        if (termRows.length === 0) return;

        if (yPos > 250) {
          doc.addPage();
          yPos = 20;
        }

        doc.setFontSize(13);
        doc.setFont("helvetica", "bold");
        doc.text(`${term.termName} - ${term.status}`, 14, yPos);
        yPos += 2;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        doc.text(`${term.attendedClasses}/${term.totalClasses} attended | Required: ${term.requiredClasses}`, 14, yPos + 4);
        yPos += 6;

        autoTable(doc, {
          head: [["Date", "Day", "Status"]],
          body: termRows,
          startY: yPos,
          theme: "striped",
          headStyles: { fillColor: [99, 102, 241], fontSize: 9 },
          bodyStyles: { fontSize: 8 },
          didParseCell: (hookData: any) => {
            if (hookData.section === "body" && hookData.column.index === 2) {
              const val = hookData.cell.raw;
              if (val === "Present") hookData.cell.styles.textColor = [124, 58, 237];
              else if (val === "Leave") hookData.cell.styles.textColor = [202, 138, 4];
              else if (val === "Absent") hookData.cell.styles.textColor = [239, 68, 68];
              else if (val === "Warning") hookData.cell.styles.textColor = [234, 88, 12];
            }
          }
        });

        yPos = (doc as any).lastAutoTable.finalY + 12;
      });
    } else {
      const rows = Object.entries(data.student.attendance)
        .sort((a, b) => parseDateSort(b[0]) - parseDateSort(a[0]))
        .map(([dateStr, status]) => [dateStr, getDayName(dateStr), getStatusText(status)]);

      autoTable(doc, {
        head: [["Date", "Day", "Status"]],
        body: rows,
        startY: yPos,
        theme: "grid",
        headStyles: { fillColor: [99, 102, 241] },
      });
    }

    doc.save(`${data.student.studentName.replace(/\s+/g, "_")}_PEP_Report.pdf`);
  };


  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-50 glass-heavy border-b-0">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <div className="relative">
                <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-gradient-to-br from-purple-600 to-purple-500 flex items-center justify-center shadow-lg shadow-primary/25">
                  <GraduationCap className="w-5 h-5 sm:w-6 sm:h-6 text-primary-foreground" />
                </div>
                <div className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-purple-400 border-2 border-background" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-bold text-white bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text">
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

      <main className="container mx-auto px-4 py-4 sm:py-6">
        <div className="max-w-3xl mx-auto space-y-4 sm:space-y-6">
          {cacheStatus && (
            <div className={`flex items-center justify-between text-sm rounded-2xl px-4 py-3 border transition-all ${cacheStatus.isDemoData ? 'glass text-yellow-300 border-yellow-400/20' : 'glass text-muted-foreground border-transparent'}`}>
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

          <Card>
            <CardHeader className="bg-gradient-to-r from-purple-500/10 to-transparent">
              <CardTitle className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-purple-500/20">
                  <Search className="w-5 h-5 text-primary" />
                </div>
                <span>Search Student</span>
              </CardTitle>
              <CardDescription>
                Search by Roll Number or Student Name
              </CardDescription>
            </CardHeader>
            <CardContent className="p-3 sm:p-6">
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
                  <div className="w-16 h-16 rounded-full bg-purple-500/20 flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  </div>
                </div>
                <p className="text-muted-foreground font-medium">Searching for student...</p>
              </CardContent>
            </Card>
          )}

          {searchResults && !selectedRollNo && searchResults.count === 0 && (
            <Card className="border-rose-500/30">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 text-destructive">
                  <div className="p-2 rounded-lg bg-rose-500/20">
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
                  <div className="p-2 rounded-lg bg-purple-500/20">
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
                      className="w-full flex items-center justify-between p-4 hover-elevate transition-all duration-200 text-left"
                      data-testid={`button-student-${student.rollNo}`}
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center border border-purple-500/20">
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
              {isSavedStudent && !activeSearch && (
                <div className="flex items-center gap-3 p-4 rounded-xl glass border border-purple-500/20" data-testid="welcome-back-banner">
                  <div className="p-2 rounded-lg bg-purple-500/20">
                    <Heart className="w-5 h-5 text-primary fill-primary" />
                  </div>
                  <div>
                    <p className="font-semibold text-primary">Welcome back, {studentData.student.studentName.split(' ')[0]}!</p>
                    <p className="text-sm text-muted-foreground">Your attendance is auto-loaded</p>
                  </div>
                </div>
              )}
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
                <div className="h-2 bg-gradient-to-r from-purple-600 via-purple-500 to-purple-400 " />
                <CardHeader className="pb-4 px-3 sm:px-6">
                  <div className="flex items-start justify-between gap-2 sm:gap-4">
                    <div className="flex items-center gap-2 sm:gap-4 min-w-0">
                      <div className="relative  shrink-0">
                        <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-purple-500/5 flex items-center justify-center border border-purple-500/20">
                          <User className="w-6 h-6 sm:w-8 sm:h-8 text-primary" />
                        </div>
                        <div className={`absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-background flex items-center justify-center ${studentData.todayStatus === 'Present' ? 'bg-violet-500' : studentData.todayStatus === 'Leave' ? 'bg-yellow-400' : studentData.todayStatus === 'Absent' ? 'bg-rose-500' : studentData.todayStatus === 'Warning' ? 'bg-orange-500' : 'bg-muted'}`}>
                          {studentData.todayStatus === 'Present' && <CheckCircle2 className="w-3 h-3 text-white" />}
                          {studentData.todayStatus === 'Leave' && <Clock className="w-3 h-3 text-white" />}
                          {studentData.todayStatus === 'Absent' && <XCircle className="w-3 h-3 text-white" />}
                          {studentData.todayStatus === 'Warning' && <AlertCircle className="w-3 h-3 text-white" />}
                        </div>
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-base sm:text-xl" data-testid="text-student-name">
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
                    <div className=" flex items-center gap-2">
                      <Button
                        variant={isRemembered ? "default" : "outline"}
                        size="sm"
                        onClick={handleRememberToggle}
                        className="gap-1.5"
                        data-testid="button-remember-me"
                      >
                        {isRemembered ? (
                          <>
                            <Heart className="w-4 h-4 fill-current" />
                            <span className="hidden sm:inline">Saved</span>
                          </>
                        ) : (
                          <>
                            <HeartOff className="w-4 h-4" />
                            <span className="hidden sm:inline">Remember</span>
                          </>
                        )}
                      </Button>
                      {isSavedStudent && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleLogout}
                          className="gap-1.5 text-muted-foreground hover:text-destructive"
                          data-testid="button-logout"
                        >
                          <LogOut className="w-4 h-4" />
                          <span className="hidden sm:inline">Switch</span>
                        </Button>
                      )}
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
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4 sm:space-y-6 pb-4 sm:pb-6 px-3 sm:px-6">
                  <div className="grid gap-3 sm:gap-4 sm:grid-cols-2">
                    <div className="relative rounded-xl glass p-3 sm:p-5 border">
                      <p className="text-sm text-muted-foreground font-medium mb-2">Today ({studentData.todayDate})</p>
                      <div className="flex items-center gap-3">
                        {getStatusIcon(studentData.todayStatus)}
                        <span className="text-lg font-bold" data-testid="text-today-status">{studentData.todayStatus}</span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2" data-testid="text-today-marked">
                        {studentData.isTodayMarked ? "Attendance marked" : "Attendance not marked yet"}
                      </p>
                    </div>

                    <div className="relative rounded-xl glass p-3 sm:p-5 border">
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
                    <div className="grid grid-cols-5 gap-1 sm:gap-2">
                      {studentData.weeklyBreakdown.map((day, i) => (
                        <div
                          key={i}
                          className="text-center p-1.5 sm:p-3 rounded-xl glass hover:border-primary/30 transition-colors"
                          data-testid={`day-${day.day.toLowerCase()}`}
                        >
                          <p className="text-[10px] sm:text-xs font-bold text-muted-foreground">{day.day}</p>
                          <p className="text-[10px] sm:text-xs text-muted-foreground/70 mb-1 sm:mb-2">{day.date}</p>
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
                  <AttendanceCalendar attendance={studentData.student.attendance} />
                  <TermwiseAttendanceHistory terms={studentData.student.terms} />
                </>
              )}
            </div>
          )}

          {!activeSearch && !isLoading && (
            <Card className="glass border-dashed border">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center">
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
