"use client";

import { useEffect, useMemo, useState } from "react";

type Command = { command: string; cwd: string; status: string; exitCode: number; durationMs: number };
type Log = {
  timestamp: string; task: string; approvalPolicy: string; success: boolean; project: string;
  taskId: string; threadId: string; turnId: string; status: string; durationMs: number;
  codexActiveMs: number; approvalWaitMs: number; approvalCount: number; output: string;
  diff: string; commands: Command[]; error: string;
};

const formatDuration = (ms: number) => ms >= 60000 ? `${(ms / 60000).toFixed(1)}m` : `${(ms / 1000).toFixed(1)}s`;
const formatTime = (value: string) => new Intl.DateTimeFormat("en", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date(value));
const formatDate = (value: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));

export default function Home() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [selected, setSelected] = useState<Log | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/logs.json").then((response) => response.json()).then((data: Log[]) => {
      const sorted = [...data].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
      setLogs(sorted); setSelected(sorted[0] ?? null); setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => logs.filter((log) => {
    const matchesText = `${log.task} ${log.project} ${log.taskId}`.toLowerCase().includes(query.toLowerCase());
    const matchesStatus = status === "all" || (status === "success" ? log.success : !log.success);
    return matchesText && matchesStatus;
  }), [logs, query, status]);

  const success = logs.filter((log) => log.success).length;
  const avg = logs.length ? logs.reduce((sum, log) => sum + log.durationMs, 0) / logs.length : 0;
  const totalCommands = logs.reduce((sum, log) => sum + log.commands.length, 0);

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">L</span><span>Logwise</span></div>
        <nav aria-label="Main navigation">
          <button className="navItem active"><span>◫</span> Overview</button>
          <button className="navItem"><span>↗</span> Live tail <em>Soon</em></button>
          <button className="navItem"><span>⌁</span> Projects</button>
        </nav>
        <div className="sidebarBottom">
          <div className="sourceCard"><span className="pulse"/><div><b>Source connected</b><small>codex-cli-runner / logs</small></div></div>
          <button className="navItem"><span>⚙</span> Settings</button>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div><p className="eyebrow">OPERATIONS / OVERVIEW</p><h1>Runner activity</h1></div>
          <div className="headerActions"><span className="lastSync">● Synced just now</span><button className="iconButton" aria-label="Notifications">♢</button><div className="avatar">AB</div></div>
        </header>

        <section className="metrics" aria-label="Log metrics">
          <article><div className="metricTop"><span>Total runs</span><span className="metricIcon blue">↗</span></div><strong>{logs.length}</strong><small>All recorded executions</small></article>
          <article><div className="metricTop"><span>Success rate</span><span className="metricIcon green">✓</span></div><strong>{logs.length ? Math.round(success / logs.length * 100) : 0}%</strong><small><i className="dot greenDot"/> {success} completed successfully</small></article>
          <article><div className="metricTop"><span>Average duration</span><span className="metricIcon amber">◷</span></div><strong>{formatDuration(avg)}</strong><small>Across all recorded runs</small></article>
          <article><div className="metricTop"><span>Commands executed</span><span className="metricIcon violet">›_</span></div><strong>{totalCommands}</strong><small>Across {logs.length} task sessions</small></article>
        </section>

        <section className="workspace">
          <div className="runsPanel">
            <div className="panelHeader"><div><h2>Recent runs</h2><p>Inspect task history and execution health.</p></div><button className="exportButton" onClick={() => navigator.clipboard?.writeText(JSON.stringify(filtered, null, 2))}>Copy JSON</button></div>
            <div className="filters"><label className="search"><span>⌕</span><input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search task, project, or ID…" aria-label="Search logs"/></label><select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status"><option value="all">All statuses</option><option value="success">Successful</option><option value="failed">Failed</option></select></div>
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
