import { jsPDF } from 'jspdf';
import type { LandingResult, ThrowRecord } from '../types/biomechanics';

const LANDING_LABELS: Record<LandingResult, string> = {
  T20: 'On Target / T20',
  HIGH: 'Missed High',
  LOW: 'Missed Low',
  LEFT: 'Missed Left',
  RIGHT: 'Missed Right',
};

export function exportSessionPdfReport(throws: ThrowRecord[], isPro: boolean): void {
  if (throws.length === 0) return;

  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const bottomLimit = pageHeight - 18;

  // Chronological order (#1 -> #N)
  const orderedThrows = [...throws].sort((a, b) => a.throwNumber - b.throwNumber);
  const now = new Date();
  const generatedLabel = now.toLocaleString([], {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  // Top Header Banner
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, 34, 'F');
  doc.setFillColor(34, 197, 94); // Electric green accent strip
  doc.rect(0, 32.5, pageWidth, 1.5, 'F');

  doc.setTextColor(248, 250, 252);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('DartForm AI — Biomechanical Session Report', margin, 15);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(148, 163, 184);
  doc.text(
    `Generated: ${generatedLabel}  |  Tier: ${isPro ? 'Match Ready Pro' : 'Practice Board'}  |  Throws Analyzed: ${orderedThrows.length}`,
    margin,
    24
  );

  // Aggregate Session Summary Metrics
  const optimalCount = orderedThrows.filter((t) => t.overallStatus === 'optimal').length;
  const avgExtension =
    orderedThrows.reduce((sum, t) => sum + t.maxExtensionAngle, 0) / orderedThrows.length;
  const avgDrift =
    orderedThrows.reduce((sum, t) => sum + Math.abs(t.elbowDriftPct), 0) / orderedThrows.length;
  const avgRelease =
    orderedThrows.reduce((sum, t) => sum + t.releaseAngle, 0) / orderedThrows.length;

  let y = 44;

  // Summary Box
  doc.setFillColor(241, 245, 249);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(margin, y, contentWidth, 22, 2.5, 2.5, 'FD');

  const colW = contentWidth / 4;
  const summaryItems = [
    { label: 'Optimal Throws', value: `${optimalCount} / ${orderedThrows.length}` },
    { label: 'Avg Follow-Through', value: `${avgExtension.toFixed(1)} deg` },
    { label: 'Avg Release Angle', value: `${avgRelease.toFixed(1)} deg` },
    { label: 'Avg Elbow Drift', value: `${avgDrift.toFixed(1)}%` },
  ];

  summaryItems.forEach((item, idx) => {
    const x = margin + idx * colW + 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, x, y + 7.5);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(item.value, x, y + 15.5);
  });

  y += 31;

  // Section Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text('Throw-by-Throw Biomechanics & Coaching Insights', margin, y);
  y += 6;

  orderedThrows.forEach((item) => {
    // Pre-calculate insight line heights to determine card height & page breaks
    const flagLines: { title: string; severity: 'good' | 'warning'; lines: string[] }[] =
      item.flags.map((flag) => ({
        title: flag.title,
        severity: flag.severity,
        lines: doc.splitTextToSize(flag.detail, contentWidth - 12) as string[],
      }));

    const totalInsightLines = flagLines.reduce((acc, f) => acc + f.lines.length + 1, 0);
    const cardHeight = 25 + totalInsightLines * 4.4 + 4;

    if (y + cardHeight > bottomLimit) {
      doc.addPage();
      y = 18;
    }

    const isOptimal = item.overallStatus === 'optimal';

    // Card Background & Hairline Border
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(margin, y, contentWidth, cardHeight, 2.5, 2.5, 'FD');

    // Card Header Strip
    doc.setFillColor(248, 250, 252);
    doc.roundedRect(margin, y, contentWidth, 9.5, 2.5, 2.5, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.line(margin, y + 9.5, margin + contentWidth, y + 9.5);

    // Throw # & Metadata
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    const landingLabel = item.landingResult ? LANDING_LABELS[item.landingResult] : 'Unlogged';
    const handedLabel = item.handedness === 'right' ? 'Right-Handed' : 'Left-Handed';
    const sourceLabel = item.source === 'camera' ? 'Live Camera' : 'Uploaded Video';

    doc.text(
      `Throw #${item.throwNumber}  ·  ${landingLabel}`,
      margin + 4,
      y + 6.4
    );

    // Status Tag on Right
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    if (isOptimal) {
      doc.setTextColor(22, 163, 74); // Green 600
      doc.text('OPTIMAL FORM', margin + contentWidth - 4, y + 6.4, { align: 'right' });
    } else {
      doc.setTextColor(217, 119, 6); // Amber 600
      doc.text('ADJUSTMENT NEEDED', margin + contentWidth - 4, y + 6.4, { align: 'right' });
    }

    // Metrics Line
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(71, 85, 105);
    const metricsSummary = `${item.timestamp}  |  ${handedLabel} (${sourceLabel})  |  Drawback: ${
      item.minDrawbackAngle
    } deg  |  Release: ${item.releaseAngle} deg  |  Follow-Through: ${
      item.maxExtensionAngle
    } deg  |  Drift: ${item.elbowDriftPct > 0 ? '+' : ''}${item.elbowDriftPct.toFixed(1)}% (${
      item.elbowDriftPx
    }px)  |  Sway: ${item.shoulderSwayPct.toFixed(1)}%`;

    const wrappedMetrics = doc.splitTextToSize(metricsSummary, contentWidth - 8) as string[];
    doc.text(wrappedMetrics, margin + 4, y + 14.5);

    let innerY = y + 14.5 + wrappedMetrics.length * 4.2 + 2.5;

    // Coaching Insights
    flagLines.forEach((f) => {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      if (f.severity === 'good') {
        doc.setTextColor(21, 128, 61);
      } else {
        doc.setTextColor(180, 83, 9);
      }
      doc.text(`• ${f.title}:`, margin + 5, innerY);
      innerY += 4.2;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8.5);
      doc.setTextColor(51, 65, 85);
      doc.text(f.lines, margin + 8, innerY);
      innerY += f.lines.length * 4.2 + 1;
    });

    y += cardHeight + 4.5;
  });

  // Footer page numbering
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `DartForm AI · 100% On-Device Biomechanical Analysis · Page ${p} of ${totalPages}`,
      pageWidth / 2,
      pageHeight - 8,
      { align: 'center' }
    );
  }

  const dateSlug = now.toISOString().slice(0, 10);
  doc.save(`dartform-session-report-${dateSlug}.pdf`);
}
