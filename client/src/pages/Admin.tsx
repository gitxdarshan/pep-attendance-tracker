import { useQuery } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Users, AlertTriangle, CheckCircle2, Clock, Loader2, XCircle, GraduationCap, TrendingUp } from "lucide-react";
import type { PendingStudent, CacheStatus } from "@shared/schema";
import { Link } from "wouter";

export default function Admin() {
  const { data: cacheStatus } = useQuery<CacheStatus>({
    queryKey: ["/api/status"],
    refetchInterval: 30000,
  });

  const { data: pendingStudents, isLoading, isError } = useQuery<PendingStudent[]>({
    queryKey: ["/api/admin/pending"],
  });

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

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-muted/30">
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-lg">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="ghost" size="icon" className="rounded-xl" data-testid="button-back">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div className="flex items-center gap-4">
                <div className="relative">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-yellow-400 to-yellow-600 flex items-center justify-center shadow-lg shadow-yellow-400/25">
                    <AlertTriangle className="w-6 h-6 text-white" />
                  </div>
                </div>
                <div>
                  <h1 className="text-xl font-bold">Admin Dashboard</h1>
                  <p className="text-xs text-muted-foreground font-medium">Pending Attendance</p>
                </div>
              </div>
            </div>
            {pendingStudents && (
              <Badge className="text-sm px-4 py-1.5 bg-yellow-400/20 text-yellow-700 dark:text-yellow-300 border-yellow-400/30" data-testid="text-pending-count">
                {pendingStudents.length} pending
              </Badge>
            )}
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <div className="max-w-5xl mx-auto space-y-6">
          {cacheStatus && (
            <div className="flex items-center text-sm rounded-xl px-4 py-3 border bg-muted/50">
              <span className="flex items-center gap-2">
                {cacheStatus.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Loading data...</span>
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

          <Card className="overflow-hidden border-yellow-400/20 bg-gradient-to-r from-yellow-400/5 to-transparent">
            <CardContent className="p-5">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-xl bg-yellow-400/10">
                  <Clock className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <h2 className="text-lg font-bold">Students Below Requirement</h2>
                  <p className="text-sm text-muted-foreground">
                    Students with less than 3 attendance this week (Mon-Fri, max 3 counted per week)
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <Card>
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
                <p className="text-muted-foreground font-medium">Loading pending students...</p>
              </CardContent>
            </Card>
          )}

          {isError && (
            <Card className="border-destructive/50 bg-destructive/5">
              <CardContent className="py-6">
                <div className="flex items-center gap-3 text-destructive">
                  <div className="p-2 rounded-lg bg-destructive/10">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <span className="font-medium">Failed to load pending students</span>
                </div>
              </CardContent>
            </Card>
          )}

          {pendingStudents && pendingStudents.length === 0 && (
            <Card className="border-violet-500/20 bg-gradient-to-r from-violet-500/5 to-transparent overflow-hidden">
              <CardContent className="py-16 flex flex-col items-center justify-center gap-4">
                <div className="relative">
                  <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-violet-500/20 to-violet-500/5 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-violet-500" />
                  </div>
                </div>
                <div className="text-center">
                  <p className="text-violet-700 dark:text-violet-400 font-bold text-lg">
                    All students on track!
                  </p>
                  <p className="text-violet-600/70 dark:text-violet-400/70 text-sm mt-1">
                    Everyone has met the weekly attendance requirement
                  </p>
                </div>
              </CardContent>
            </Card>
          )}

          {pendingStudents && pendingStudents.length > 0 && (
            <div className="grid gap-3">
              {pendingStudents.map((student, index) => (
                <Card key={student.rollNo} className="overflow-hidden hover:border-primary/30 transition-colors" data-testid={`card-student-${index}`}>
                  <CardContent className="p-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                      <div className="flex items-center gap-4 flex-1">
                        <div className="relative">
                          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center border border-primary/20">
                            <GraduationCap className="w-6 h-6 text-primary" />
                          </div>
                          <div className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full bg-yellow-400 border-2 border-background flex items-center justify-center">
                            <Clock className="w-3 h-3 text-white" />
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold truncate" data-testid={`text-name-${index}`}>
                            {student.studentName}
                          </p>
                          <div className="flex flex-wrap items-center gap-2 mt-1">
                            <Badge variant="secondary" className="font-mono text-xs" data-testid={`text-roll-${index}`}>
                              {student.rollNo}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {student.gender}
                            </Badge>
                            <Badge variant="outline" className="text-xs truncate max-w-32">
                              {student.school}
                            </Badge>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 flex-shrink-0">
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <TrendingUp className="w-4 h-4 text-yellow-400" />
                            <span className="font-bold text-lg" data-testid={`text-present-${index}`}>
                              {student.daysPresent}/3
                            </span>
                          </div>
                          <p className="text-xs text-yellow-600 dark:text-yellow-400 font-medium" data-testid={`text-remaining-${index}`}>
                            {student.daysRemaining} more needed
                          </p>
                        </div>

                        <div className="flex gap-1.5 p-2 rounded-lg bg-muted/50">
                          {student.weeklyBreakdown.map((day, i) => (
                            <div key={i} className="text-center" title={`${day.day} - ${day.date}`}>
                              {getStatusBadge(day.status)}
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
