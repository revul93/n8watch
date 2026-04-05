import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";

const SEVERITY_COLORS = {
  critical: [211, 47, 47],
  warning: [245, 124, 0],
  info: [25, 118, 210],
};

function fmt(val, decimals = 1) {
  if (val === null || val === undefined) return "N/A";
  const n = Number(val);
  return isNaN(n) ? "N/A" : n.toFixed(decimals);
}

function fmtPct(val) {
  if (val === null || val === undefined) return "N/A";
  return `${fmt(val, 1)}%`;
}

function fmtDate(ts) {
  if (!ts) return "N/A";
  return new Date(Number(ts)).toLocaleString();
}

/** Escape a value for inclusion in a CSV field, wrapping in quotes if needed. */
function csvField(val) {
  if (val === null || val === undefined) return "";
  const str = String(val);
  return str.includes(",") || str.includes('"') || str.includes("\n")
    ? `"${str.replace(/"/g, '""')}"`
    : str;
}

/**
 * Draws a simple line chart inside the PDF document.
 *
 * @param {jsPDF} doc
 * @param {number[]} values  - y-axis data points
 * @param {number} x         - left edge (mm)
 * @param {number} y         - top edge (mm)
 * @param {number} w         - width (mm)
 * @param {number} h         - height (mm)
 * @param {string} label     - y-axis label
 * @param {[r,g,b]} color
 */
function drawLineChart(doc, values, x, y, w, h, label, color = [59, 130, 246]) {
  const valid = values.filter(
    (v) => v !== null && v !== undefined && !isNaN(Number(v)),
  );
  if (valid.length < 2) {
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text("No data", x + w / 2, y + h / 2, { align: "center" });
    return;
  }

  const nums = valid.map(Number);
  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const range = max - min || 1;

  // Background
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(x, y, w, h, 2, 2, "F");

  // Chart area insets
  const pad = 4;
  const cx = x + pad;
  const cy = y + pad;
  const cw = w - 2 * pad;
  const ch = h - 2 * pad;

  // Draw grid lines
  doc.setDrawColor(55, 65, 81);
  doc.setLineWidth(0.2);
  for (let i = 0; i <= 4; i++) {
    const gy = cy + (ch / 4) * i;
    doc.line(cx, gy, cx + cw, gy);
  }

  // Draw data line
  doc.setDrawColor(...color);
  doc.setLineWidth(0.6);
  const step = cw / (nums.length - 1);
  for (let i = 1; i < nums.length; i++) {
    const x1 = cx + step * (i - 1);
    const y1 = cy + ch - ((nums[i - 1] - min) / range) * ch;
    const x2 = cx + step * i;
    const y2 = cy + ch - ((nums[i] - min) / range) * ch;
    doc.line(x1, y1, x2, y2);
  }

  // Labels
  doc.setFontSize(6);
  doc.setTextColor(156, 163, 175);
  doc.text(label, x + 2, y + 3.5);
  doc.text(fmt(max, 0), x + w - 1, y + pad + 2, { align: "right" });
  doc.text(fmt(min, 0), x + w - 1, y + h - 1.5, { align: "right" });
}

/**
 * generatePDFReport - builds and downloads a PDF report for a target.
 *
 * @param {object} reportData - data returned from GET /api/targets/:id/report
 */
export function generatePDFReport(reportData) {
  const { target, uptime, metrics, ping_results, alerts, generated_at } =
    reportData;

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 14;
  let curY = margin;

  // ── Header ────────────────────────────────────────────────────────────────
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pageW, 28, "F");

  doc.setFontSize(18);
  doc.setTextColor(255, 255, 255);
  doc.text("n8watch", margin, 12);

  doc.setFontSize(10);
  doc.setTextColor(148, 163, 184);
  doc.text("Network Monitoring Report", margin, 19);

  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  doc.text(
    `Generated: ${new Date(generated_at).toLocaleString()}`,
    pageW - margin,
    12,
    { align: "right" },
  );

  const isUp = target.is_alive;
  doc.setFillColor(
    ...(isUp ? [34, 197, 94] : isUp === 0 ? [239, 68, 68] : [107, 114, 128]),
  );
  doc.circle(pageW - margin - 3, 21, 2.5, "F");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(
    isUp ? "UP" : isUp === 0 ? "DOWN" : "UNKNOWN",
    pageW - margin - 7,
    21.5,
  );

  curY = 36;

  // ── Target Info ───────────────────────────────────────────────────────────
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text(target.name, margin, curY);
  doc.setFontSize(9);
  doc.setTextColor(148, 163, 184);
  const targetMeta = [
    `${target.ip}`,
    target.group ? `Group: ${target.group}` : null,
    target.interface_alias ? `Interface: ${target.interface_alias}` : null,
  ]
    .filter(Boolean)
    .join("  ·  ");
  doc.text(targetMeta, margin, curY + 5);

  curY += 14;

  // ── Availability Summary Table ────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("AVAILABILITY", margin, curY);
  curY += 4;

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    head: [["Period", "Uptime %"]],
    body: [
      ["Last 1 hour", fmtPct(uptime.uptime_1h)],
      ["Last 24 hours", fmtPct(uptime.uptime_24h)],
      ["Last 7 days", fmtPct(uptime.uptime_7d)],
      ["Last 30 days", fmtPct(uptime.uptime_30d)],
      ["Overall", fmtPct(uptime.uptime_overall)],
    ],
    styles: {
      fontSize: 8,
      textColor: [226, 232, 240],
      fillColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [148, 163, 184],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [30, 41, 59] },
    tableLineColor: [55, 65, 81],
    tableLineWidth: 0.2,
  });

  curY = doc.lastAutoTable.finalY + 8;

  // ── Current Metrics ───────────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("CURRENT METRICS", margin, curY);
  curY += 4;

  autoTable(doc, {
    startY: curY,
    margin: { left: margin, right: margin },
    head: [["Metric", "Value"]],
    body: [
      [
        "Avg Latency",
        target.avg_latency !== null && target.avg_latency !== undefined
          ? `${fmt(target.avg_latency)} ms`
          : "N/A",
      ],
      ["Packet Loss", fmtPct(target.packet_loss)],
    ],
    styles: {
      fontSize: 8,
      textColor: [226, 232, 240],
      fillColor: [30, 41, 59],
    },
    headStyles: {
      fillColor: [15, 23, 42],
      textColor: [148, 163, 184],
      fontStyle: "bold",
    },
    alternateRowStyles: { fillColor: [30, 41, 59] },
    tableLineColor: [55, 65, 81],
    tableLineWidth: 0.2,
  });

  curY = doc.lastAutoTable.finalY + 8;

  // ── Charts ────────────────────────────────────────────────────────────────
  const chartW = (pageW - 2 * margin - 6) / 2;
  const chartH = 30;

  if (metrics && metrics.length > 0) {
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("LATENCY TREND (24h)", margin, curY);
    curY += 4;

    const latencyValues = metrics.map((m) => m.avg_latency);
    const lossValues = metrics.map((m) => m.packet_loss);

    drawLineChart(
      doc,
      latencyValues,
      margin,
      curY,
      chartW,
      chartH,
      "Avg Latency (ms)",
      [59, 130, 246],
    );
    drawLineChart(
      doc,
      lossValues,
      margin + chartW + 6,
      curY,
      chartW,
      chartH,
      "Packet Loss (%)",
      [239, 68, 68],
    );

    curY += chartH + 8;
  }

  // ── Recent Ping Results ───────────────────────────────────────────────────
  if (ping_results && ping_results.length > 0) {
    // Check if we need a new page
    if (curY > 220) {
      doc.addPage();
      curY = margin;
    }

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("RECENT PING RESULTS (last 50)", margin, curY);
    curY += 4;

    const pingRows = ping_results
      .slice(0, 50)
      .map((r) => [
        fmtDate(r.created_at),
        r.is_alive ? "UP" : "DOWN",
        r.avg_latency !== null ? `${fmt(r.avg_latency)} ms` : "N/A",
        fmtPct(r.packet_loss),
        r.jitter !== null ? `${fmt(r.jitter)} ms` : "N/A",
      ]);

    autoTable(doc, {
      startY: curY,
      margin: { left: margin, right: margin },
      head: [["Time", "Status", "Avg Latency", "Packet Loss", "Jitter"]],
      body: pingRows,
      styles: {
        fontSize: 7,
        textColor: [226, 232, 240],
        fillColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [148, 163, 184],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [30, 41, 59] },
      tableLineColor: [55, 65, 81],
      tableLineWidth: 0.2,
      didParseCell: (data) => {
        if (data.column.index === 1 && data.section === "body") {
          data.cell.styles.textColor =
            data.cell.raw === "UP" ? [34, 197, 94] : [239, 68, 68];
        }
      },
    });

    curY = doc.lastAutoTable.finalY + 8;
  }

  // ── Alerts History ────────────────────────────────────────────────────────
  if (alerts && alerts.length > 0) {
    if (curY > 220) {
      doc.addPage();
      curY = margin;
    }

    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text("ALERT HISTORY", margin, curY);
    curY += 4;

    const alertRows = alerts.map((a) => [
      fmtDate(a.created_at),
      a.rule_name || "",
      String(a.severity || "").toUpperCase(),
      a.resolved ? "Resolved" : "Active",
    ]);

    autoTable(doc, {
      startY: curY,
      margin: { left: margin, right: margin },
      head: [["Time", "Rule", "Severity", "Status"]],
      body: alertRows,
      styles: {
        fontSize: 7,
        textColor: [226, 232, 240],
        fillColor: [30, 41, 59],
      },
      headStyles: {
        fillColor: [15, 23, 42],
        textColor: [148, 163, 184],
        fontStyle: "bold",
      },
      alternateRowStyles: { fillColor: [30, 41, 59] },
      tableLineColor: [55, 65, 81],
      tableLineWidth: 0.2,
      didParseCell: (data) => {
        if (data.column.index === 2 && data.section === "body") {
          const sev = String(data.cell.raw).toLowerCase();
          data.cell.styles.textColor = SEVERITY_COLORS[sev] || [226, 232, 240];
          data.cell.styles.fontStyle = "bold";
        }
        if (data.column.index === 3 && data.section === "body") {
          data.cell.styles.textColor =
            data.cell.raw === "Active" ? [239, 68, 68] : [34, 197, 94];
        }
      },
    });
  }

  // ── Footer on all pages ───────────────────────────────────────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `n8watch · Page ${i} of ${totalPages}`,
      pageW / 2,
      doc.internal.pageSize.getHeight() - 6,
      { align: "center" },
    );
  }

  const filename = `${target.name.replace(/\s+/g, "_")}_report_${Date.now()}.pdf`;
  doc.save(filename);
}

/**
 * generateCSVReport - builds and downloads a CSV report from the report data.
 *
 * @param {object} reportData - data returned from GET /api/targets/:id/report
 */
export function generateCSVReport(reportData) {
  const { target, uptime, ping_results, alerts, generated_at } = reportData;

  const lines = [];

  // Header metadata
  lines.push(`# n8watch Report`);
  lines.push(`# Generated At,${generated_at}`);
  lines.push(`# Target,${target.name}`);
  lines.push(`# IP,${target.ip}`);
  lines.push(`# Group,${target.group || ""}`);
  if (target.interface_alias) {
    lines.push(
      `# Interface,${target.interface_alias}${target.interface ? ` (${target.interface})` : ""}`,
    );
  }
  lines.push("");

  // Availability
  lines.push("## Availability");
  lines.push("Period,Uptime %");
  lines.push(`Last 1 hour,${uptime.uptime_1h ?? ""}`);
  lines.push(`Last 24 hours,${uptime.uptime_24h ?? ""}`);
  lines.push(`Last 7 days,${uptime.uptime_7d ?? ""}`);
  lines.push(`Last 30 days,${uptime.uptime_30d ?? ""}`);
  lines.push(`Overall,${uptime.uptime_overall ?? ""}`);
  lines.push("");

  // Ping results
  if (ping_results && ping_results.length > 0) {
    lines.push("## Ping Results");
    lines.push(
      "Time,Status,Avg Latency (ms),Min Latency (ms),Max Latency (ms),Jitter (ms),Packet Loss (%),Packets Sent,Packets Received",
    );
    for (const r of ping_results) {
      lines.push(
        [
          new Date(Number(r.created_at)).toISOString(),
          r.is_alive ? "UP" : "DOWN",
          r.avg_latency ?? "",
          r.min_latency ?? "",
          r.max_latency ?? "",
          r.jitter ?? "",
          r.packet_loss ?? "",
          r.packets_sent ?? "",
          r.packets_received ?? "",
        ].join(","),
      );
    }
    lines.push("");
  }

  // Alerts
  if (alerts && alerts.length > 0) {
    lines.push("## Alerts");
    lines.push("Time,Rule,Severity,Condition,Status,Resolved At");
    for (const a of alerts) {
      lines.push(
        [
          new Date(Number(a.created_at)).toISOString(),
          csvField(a.rule_name),
          a.severity || "",
          csvField(a.condition),
          a.resolved ? "Resolved" : "Active",
          a.resolved_at ? new Date(Number(a.resolved_at)).toISOString() : "",
        ].join(","),
      );
    }
  }

  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${target.name.replace(/\s+/g, "_")}_report_${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
