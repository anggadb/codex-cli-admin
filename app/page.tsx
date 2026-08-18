"use client";

import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";

type Command = { command: string; cwd: string; status: string; exitCode: number; durationMs: number };
type Theme = "light" | "dark";
type Log = {
  timestamp: string; task: string; approvalPolicy: string; success: boolean; project: string;
  taskId: string; threadId: string; turnId: string; status: string; durationMs: number;
  codexActiveMs: number; approvalWaitMs: number; approvalCount: number; output: string;
  diff: string; commands: Command[]; error: string;
};

const formatDuration = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
const formatTime = (value: string) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
const parseDateTime = (value: string) => {
  const match = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2})$/);
  if (!match) return null;
  const [, month, day, year, hour, minute] = match.map(Number);
  const parsed = new Date(year, month - 1, day, hour, minute);
  return parsed.getFullYear() === year && parsed.getMonth() === month - 1 && parsed.getDate() === day && parsed.getHours() === hour && parsed.getMinutes() === minute
    ? parsed.getTime()
    : null;
};
const formatDateTimeInput = (value: string) => {
  const raw = value.replace(/\D/g, "").slice(0, 12);
  const bound = (segment: string, minimum: number, maximum: number) => segment.length === 2
    ? String(Math.min(maximum, Math.max(minimum, Number(segment)))).padStart(2, "0")
    : segment;
  const month = bound(raw.slice(0, 2), 1, 12);
  const day = bound(raw.slice(2, 4), 1, 31);
  const year = raw.slice(4, 8);
  const hour = bound(raw.slice(8, 10), 0, 23);
  const minute = bound(raw.slice(10, 12), 0, 59);
  const digits = `${month}${day}${year}${hour}${minute}`;
  if (digits.length <= 2) return digits.length === 2 ? `${digits}/` : digits;
  if (digits.length <= 4) return digits.length === 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}/` : `${digits.slice(0, 2)}/${digits.slice(2)}`;
  if (digits.length <= 8) return digits.length === 8 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)} ` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
  if (digits.length <= 10) return digits.length === 10 ? `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8)}:` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)} ${digits.slice(8, 10)}:${digits.slice(10)}`;
};

export default function Home() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [selected, setSelected] = useState<Log | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [syncMessage, setSyncMessage] = useState("Loaded from local cache");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [theme, setTheme] = useState<Theme>("light");
  const datePickerRef = useRef<HTMLDivElement>(null);

  const handleTimestampBackspace = (event: KeyboardEvent<HTMLInputElement>, value: string, update: (next: string) => void) => {
    const atEnd = event.currentTarget.selectionStart === value.length && event.currentTarget.selectionEnd === value.length;
    if (event.key === "Backspace" && atEnd && /[\/: ]$/.test(value)) {
      event.preventDefault();
      update(formatDateTimeInput(value.slice(0, -2)));
    }
  };

  const applyLogs = (data: Log[]) => {
    const sorted = [...data].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
    setLogs(sorted);
    setSelected((current) => sorted.find((log) => log.taskId === current?.taskId) ?? sorted[0] ?? null);
  };

  useEffect(() => {
    fetch("/logs.json").then((response) => response.json()).then((data: Log[]) => {
      applyLogs(data); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!datePickerOpen) return;
    const dismiss = (event: PointerEvent) => {
      if (!datePickerRef.current?.contains(event.target as Node)) setDatePickerOpen(false);
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDatePickerOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [datePickerOpen]);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("sidebar-collapsed") === "true");
    const savedTheme = localStorage.getItem("theme");
    const nextTheme: Theme = savedTheme === "dark" || savedTheme === "light"
      ? savedTheme
      : window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.dataset.theme = nextTheme;
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed((current) => {
      const next = !current;
      localStorage.setItem("sidebar-collapsed", String(next));
      return next;
    });
  };

  const toggleTheme = () => {
    setTheme((current) => {
      const next = current === "light" ? "dark" : "light";
      localStorage.setItem("theme", next);
      document.documentElement.dataset.theme = next;
      return next;
    });
  };

  const syncLogs = async () => {
    setSyncing(true);
    setSyncMessage("Syncing source logs…");
    try {
      const response = await fetch("/api/logs", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Sync failed");
      applyLogs(result.logs);
      const skipped = result.skipped.length ? ` · ${result.skipped.length} skipped` : "";
      setSyncMessage(`Synced ${result.logs.length} logs just now${skipped}`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Unable to sync logs");
    } finally {
      setSyncing(false);
    }
  };

  const exportExcel = async () => {
    setExporting(true);
    try {
      const response = await fetch("/api/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logs: filtered }),
      });
      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || "Excel export failed");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `codex-runner-logs-${new Date().toISOString().slice(0, 10)}.xlsx`;
      link.click();
      URL.revokeObjectURL(url);
      setSyncMessage(`Exported ${filtered.length} logs to Excel`);
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Unable to export logs");
    } finally {
      setExporting(false);
    }
  };

  const filtered = useMemo(() => {
    const matches = logs.filter((log) => {
      const matchesText = `${log.task} ${log.project} ${log.taskId}`.toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || (status === "success" ? log.success : !log.success);
      const timestamp = new Date(log.timestamp).getTime();
      const parsedFrom = parseDateTime(dateFrom);
      const parsedTo = parseDateTime(dateTo);
      const from = parsedFrom ?? Number.NEGATIVE_INFINITY;
      const to = parsedTo !== null ? parsedTo + 59999 : Number.POSITIVE_INFINITY;
      const matchesDate = timestamp >= from && timestamp <= to;
      return matchesText && matchesStatus && matchesDate;
    });

    return matches.sort((a, b) => {
      if (sort === "duration-desc") return b.durationMs - a.durationMs;
      if (sort === "duration-asc") return a.durationMs - b.durationMs;
      return +new Date(b.timestamp) - +new Date(a.timestamp);
    });
  }, [logs, query, status, sort, dateFrom, dateTo]);

  const success = logs.filter((log) => log.success).length;
  const avg = logs.length ? logs.reduce((sum, log) => sum + log.durationMs, 0) / logs.length : 0;
  const totalCommands = logs.reduce((sum, log) => sum + log.commands.length, 0);

  return (
    <main className={`shell ${sidebarCollapsed ? "sidebarCollapsed" : ""}`}>
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">C</span><span className="brandLabel">Codex Admin</span></div>
        <button className="sidebarToggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}>{sidebarCollapsed ? "›" : "‹"}</button>
        <nav aria-label="Main navigation">
          <button className="navItem active"><span>◫</span> Overview</button>
          <button className="navItem"><span>↗</span> Live tail <em>Soon</em></button>
          <button className="navItem"><span>⌁</span> Projects</button>
        </nav>
        <div className="sidebarBottom">
          <div className="sourceCard"><span className="pulse"/><div><b>Source connected</b><small>codex-cli-runner / logs</small></div></div>
          <button className="navItem themeToggle" onClick={toggleTheme} aria-label={`Switch to ${theme === "light" ? "dark" : "light"} theme`} title={`Switch to ${theme === "light" ? "dark" : "light"} theme`}><span aria-hidden="true">{theme === "light" ? "☾" : "☀"}</span><span className="navLabel">{theme === "light" ? "Dark theme" : "Light theme"}</span></button>
          <button className="navItem"><span>⚙</span> Settings</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">OPERATIONS / OVERVIEW</p><h1>Runner activity</h1></div>
          <div className="headerActions"><span className="lastSync" role="status">● {syncMessage}</span><button className="syncButton" onClick={syncLogs} disabled={syncing}><span className={syncing ? "spinning" : ""}>↻</span>{syncing ? "Syncing…" : "Sync logs"}</button><div className="avatar">AB</div></div>
        </header>

        <section className="metrics" aria-label="Log metrics">
          <article><div className="metricTop"><span>Total runs</span><span className="metricIcon blue">↗</span></div><strong>{logs.length}</strong><small>All recorded executions</small></article>
          <article><div className="metricTop"><span>Success rate</span><span className="metricIcon green">✓</span></div><strong>{logs.length ? Math.round(success / logs.length * 100) : 0}%</strong><small><i className="dot greenDot"/> {success} completed successfully</small></article>
          <article><div className="metricTop"><span>Average duration</span><span className="metricIcon amber">◷</span></div><strong>{formatDuration(avg)}</strong><small>Across all recorded runs</small></article>
          <article><div className="metricTop"><span>Commands executed</span><span className="metricIcon violet">›_</span></div><strong>{totalCommands}</strong><small>Across {logs.length} task sessions</small></article>
        </section>

        <section className="workspace">
          <div className="runsPanel">
            <div className="panelHeader"><div><h2>Recent runs</h2><p>Inspect task history and execution health.</p></div><button className="exportButton" onClick={exportExcel} disabled={exporting}>{exporting ? "Exporting…" : "Export Excel"}</button></div>
            <div className="filters">
              <label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search task, project, or ID…" aria-label="Search logs"/></label>
              <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="success">Successful</option><option value="failed">Failed</option></select>
              <select value={sort} onChange={(e) => setSort(e.target.value)} aria-label="Sort runs"><option value="newest">Newest first</option><option value="duration-desc">Duration: longest</option><option value="duration-asc">Duration: shortest</option></select>
              <div ref={datePickerRef} className={`datePicker ${dateFrom || dateTo ? "active" : ""} ${datePickerOpen ? "open" : ""}`}>
                <button type="button" className="datePickerButton" onClick={() => setDatePickerOpen((open) => !open)} aria-label="Filter by timestamp" title="Filter by timestamp" aria-expanded={datePickerOpen} aria-haspopup="dialog">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>
                  {(dateFrom || dateTo) && <i/>}
                </button>
                {datePickerOpen && <div className="datePopover" role="dialog" aria-label="Filter by log timestamp">
                  <div className="datePopoverHeader"><b>Date range</b><span>Filter by log timestamp</span></div>
                  <label><span>From</span><input type="text" inputMode="numeric" maxLength={16} value={dateFrom} onChange={(e) => setDateFrom(formatDateTimeInput(e.target.value))} onKeyDown={(e) => handleTimestampBackspace(e, dateFrom, setDateFrom)} placeholder="MM/DD/YYYY HH:mm" aria-label="Logs from timestamp" aria-invalid={dateFrom !== "" && parseDateTime(dateFrom) === null}/></label>
                  <label><span>To</span><input type="text" inputMode="numeric" maxLength={16} value={dateTo} onChange={(e) => setDateTo(formatDateTimeInput(e.target.value))} onKeyDown={(e) => handleTimestampBackspace(e, dateTo, setDateTo)} placeholder="MM/DD/YYYY HH:mm" aria-label="Logs to timestamp" aria-invalid={dateTo !== "" && parseDateTime(dateTo) === null}/></label>
                  {(dateFrom || dateTo) && <button type="button" className="clearDates" onClick={() => { setDateFrom(""); setDateTo(""); }} aria-label="Clear date range">Clear range</button>}
                </div>}
              </div>
            </div>
            <div className="tableWrap">
              <table><thead><tr><th>STATUS</th><th>TASK</th><th>PROJECT</th><th>DURATION</th><th>STARTED</th><th></th></tr></thead>
                <tbody>{filtered.map((log) => <tr key={log.taskId} className={selected?.taskId === log.taskId ? "selected" : ""} onClick={() => setSelected(log)}>
                  <td><span className={`statusBadge ${log.success ? "ok" : "fail"}`}><i/>{log.success ? "Completed" : "Failed"}</span></td>
                  <td><b>{log.task}</b><small>{log.taskId.slice(0, 8)}</small></td><td><span className="projectTag">{log.project}</span></td><td className="mono">{formatDuration(log.durationMs)}</td><td><b>{formatTime(log.timestamp)}</b><small>{formatDate(log.timestamp)}</small></td><td className="chevron">›</td>
                </tr>)}</tbody>
              </table>
              {!loading && filtered.length === 0 && <div className="empty">No runs match those filters.</div>}
            </div>
          </div>

          <aside className="detailPanel">
            {selected ? <>
              <div className="detailHeader"><div><span className={`statusBadge ${selected.success ? "ok" : "fail"}`}><i/>{selected.status}</span><p>{formatDate(selected.timestamp)} · {formatTime(selected.timestamp)}</p></div><button className="closeButton" aria-label="Close details" onClick={() => setSelected(null)}>×</button></div>
              <div className="detailBody"><p className="detailLabel">TASK PROMPT</p><h3>{selected.task}</h3>
                <div className="timingGrid"><div><span>Total duration</span><b>{formatDuration(selected.durationMs)}</b></div><div><span>Codex active</span><b>{formatDuration(selected.codexActiveMs)}</b></div><div><span>Approval wait</span><b>{formatDuration(selected.approvalWaitMs)}</b></div><div><span>Approvals</span><b>{selected.approvalCount}</b></div></div>
                <div className="detailSection"><p className="detailLabel">EXECUTION</p><dl><div><dt>Project</dt><dd>{selected.project}</dd></div><div><dt>Policy</dt><dd>{selected.approvalPolicy}</dd></div><div><dt>Thread</dt><dd className="mono copyValue">{selected.threadId.slice(0, 13)}…</dd></div></dl></div>
                <div className="detailSection"><p className="detailLabel">COMMANDS <span>{selected.commands.length}</span></p>{selected.commands.length ? selected.commands.map((command, index) => <div className="command" key={index}><div><span>›_</span><b>Command {index + 1}</b><em>{formatDuration(command.durationMs)}</em></div><code>{command.command}</code></div>) : <p className="muted">No shell commands recorded.</p>}</div>
                <div className="detailSection output"><p className="detailLabel">OUTPUT</p><p>{selected.output || "No output recorded."}</p></div>
              </div>
            </> : <div className="detailEmpty"><span>↖</span><h3>Select a run</h3><p>Choose a task to inspect its timing, commands, and output.</p></div>}
          </aside>
        </section>
      </section>
    </main>
  );
}
