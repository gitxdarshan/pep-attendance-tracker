# PEP Attendance Tracker

## Overview

A web application for tracking PEP (Physical Education Program) attendance for UG 2025 Batch students. The system scrapes attendance data from a SharePoint Excel file, caches it locally, and provides a searchable interface for students to check their attendance status, weekly breakdowns, and historical records. Features include student search by roll number or name, real-time attendance status display, and an admin panel for viewing students with pending attendance requirements.

## User Preferences

Preferred communication style: Simple, everyday language.

## System Architecture

### Frontend Architecture
- **Framework**: React 18 with TypeScript
- **Routing**: Wouter (lightweight React router)
- **State Management**: TanStack React Query for server state and caching
- **UI Components**: shadcn/ui component library built on Radix UI primitives
- **Styling**: Tailwind CSS with custom theme configuration supporting light/dark modes
- **Build Tool**: Vite with React plugin

### Backend Architecture
- **Runtime**: Node.js with Express.js
- **Language**: TypeScript (ESM modules)
- **API Pattern**: REST endpoints under `/api/` prefix
- **Data Scraping**: Puppeteer-core for headless browser automation to download Excel files from SharePoint
- **Excel Parsing**: xlsx library for reading attendance spreadsheets

### Data Flow
1. **Scraper** (`server/scraper.ts`): Downloads Excel file from SharePoint using Puppeteer, parses it with xlsx, and maintains an in-memory cache
2. **Cache Strategy**: 10-minute cache duration with automatic cleanup of old files every 30 minutes
3. **API Layer**: Express routes expose cached attendance data through REST endpoints
4. **Client**: React Query fetches and caches API responses, with 30-second refresh intervals for status

### Key Design Decisions

**In-Memory Caching Over Database**
- Problem: Need fast access to attendance data that updates frequently
- Solution: In-memory cache (`attendanceCache`) with periodic refresh from SharePoint
- Rationale: Attendance data is transient, sourced externally, and doesn't need persistence

**Puppeteer for SharePoint Access**
- Problem: SharePoint requires authentication and JavaScript rendering
- Solution: Headless Chromium browser automation
- Trade-off: Higher resource usage but reliable access to protected content

**Monorepo Structure**
- `client/`: React frontend application
- `server/`: Express backend with scraping logic
- `shared/`: Zod schemas shared between frontend and backend for type safety

### Database Schema
The application uses Drizzle ORM configured for PostgreSQL, though current implementation relies on in-memory storage. The schema in `shared/schema.ts` defines TypeScript/Zod types for:
- `Student`: Core student record with attendance map
- `AttendanceData`: Collection of students with metadata
- `StudentResponse`: API response format with weekly breakdowns
- `PendingStudent`: Students needing additional attendance

## External Dependencies

### Third-Party Services
- **SharePoint**: External data source for attendance Excel files (Microsoft 365)
- **Chromium**: Headless browser for web scraping (Puppeteer-core)

### Database
- **PostgreSQL**: Configured via `DATABASE_URL` environment variable (Drizzle ORM ready)
- **Current Storage**: In-memory cache (no persistent database operations implemented)

### Key NPM Packages
- **Backend**: express, puppeteer-core, xlsx, luxon (timezone handling), drizzle-orm, zod
- **Frontend**: @tanstack/react-query, wouter, jspdf + jspdf-autotable (PDF export), xlsx (client-side export)
- **UI**: Full shadcn/ui component set with Radix UI primitives

### Environment Variables Required
- `DATABASE_URL`: PostgreSQL connection string
- `PUPPETEER_EXECUTABLE_PATH`: Optional path to Chromium binary