import { NextResponse } from 'next/server';
import { db } from '@/db';
import {
  reports,
  reportLocations,
  users,
  endorsements,
  comments,
  reportStatusHistory,
} from '@/db/schema';
import { eq, desc, and } from 'drizzle-orm';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

async function fetchImageBytes(
  url: string
): Promise<{ bytes: ArrayBuffer; type: 'jpg' | 'png' } | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    const buffer = await res.arrayBuffer();
    if (contentType.includes('png')) return { bytes: buffer, type: 'png' };
    return { bytes: buffer, type: 'jpg' };
  } catch {
    return null;
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const reportRows = await db
      .select()
      .from(reports)
      .where(eq(reports.id, id))
      .limit(1);

    const report = reportRows[0];
    if (!report || report.isHidden) {
      return NextResponse.json({ error: 'Report not found' }, { status: 404 });
    }

    const [locationRows, submitterRows, endorsementRows, commentRows, historyRows] =
      await Promise.all([
        db.select().from(reportLocations).where(eq(reportLocations.reportId, id)).limit(1),
        db.select().from(users).where(eq(users.id, report.submitterId)).limit(1),
        db
          .select({
            id: endorsements.id,
            severityLevel: endorsements.severityLevel,
            note: endorsements.note,
            createdAt: endorsements.createdAt,
            expertName: users.displayName,
          })
          .from(endorsements)
          .leftJoin(users, eq(endorsements.expertUserId, users.id))
          .where(eq(endorsements.reportId, id))
          .orderBy(desc(endorsements.createdAt)),
        db
          .select({
            id: comments.id,
            body: comments.body,
            createdAt: comments.createdAt,
            userName: users.displayName,
          })
          .from(comments)
          .leftJoin(users, eq(comments.userId, users.id))
          .where(and(eq(comments.reportId, id), eq(comments.isHidden, false)))
          .orderBy(desc(comments.createdAt))
          .limit(10),
        db
          .select()
          .from(reportStatusHistory)
          .where(eq(reportStatusHistory.reportId, id))
          .orderBy(desc(reportStatusHistory.createdAt))
          .limit(10),
      ]);

    const location = locationRows[0];
    const submitter = submitterRows[0];

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const sanitize = (text: string): string =>
      text
        .replace(/[^\x00-\x7F]/g, '')
        .replace(/[—–]/g, '-')
        .replace(/[""]/g, '"')
        .replace(/['']/g, "'")
        .replace(/…/g, '...');

    let page = pdfDoc.addPage([612, 792]);
    const { width, height } = page.getSize();
    let y = height - 50;

    const writeLine = (
      text: string,
      options?: { bold?: boolean; size?: number; color?: [number, number, number] }
    ) => {
      const size = options?.size || 11;
      const f = options?.bold ? boldFont : font;
      const c = options?.color || [0, 0, 0];

      // Add new page if we're out of space
      if (y < 60) {
        page = pdfDoc.addPage([612, 792]);
        y = height - 50;
      }

      page.drawText(sanitize(text), {
        x: 50,
        y,
        size,
        font: f,
        color: rgb(c[0], c[1], c[2]),
      });
      y -= size + 6;
    };

    const writeDivider = () => {
      page.drawLine({
        start: { x: 50, y },
        end: { x: width - 50, y },
        thickness: 0.5,
        color: rgb(0.7, 0.7, 0.7),
      });
      y -= 12;
    };

    writeLine('FixMyDistrict - Incident Report', { bold: true, size: 18 });
    writeLine(`Reference: ${report.referenceNo}`, { size: 12, color: [0.3, 0.3, 0.3] });
    y -= 8;
    writeDivider();

    writeLine(report.title, { bold: true, size: 14 });
    y -= 4;

    writeLine(`Status: ${report.status.replace(/_/g, ' ')}`);
    writeLine(`Severity: ${report.severity || 'N/A'}`);
    writeLine(
      `Category: ${report.category || 'N/A'}${report.subcategory ? ' / ' + report.subcategory : ''}`
    );
    writeLine(`Failure Type: ${report.failureType || 'N/A'}`);
    writeLine(`Reported by: ${submitter?.displayName || 'Anonymous'}`);
    writeLine(`Reported on: ${new Date(report.createdAt).toLocaleDateString()}`);
    y -= 8;

    // ✅ PHOTO EVIDENCE
    if (report.imageUrl) {
      writeDivider();
      writeLine('Photo Evidence', { bold: true, size: 12 });
      try {
        const img = await fetchImageBytes(report.imageUrl);
        if (img) {
          const embeddedImage =
            img.type === 'png'
              ? await pdfDoc.embedPng(img.bytes)
              : await pdfDoc.embedJpg(img.bytes);

          const maxWidth = width - 100;
          const maxHeight = 300;
          const scale = Math.min(
            maxWidth / embeddedImage.width,
            maxHeight / embeddedImage.height,
            1
          );

          const imgWidth = embeddedImage.width * scale;
          const imgHeight = embeddedImage.height * scale;

          if (y - imgHeight < 60) {
            page = pdfDoc.addPage([612, 792]);
            y = height - 50;
          }

          page.drawImage(embeddedImage, {
            x: 50,
            y: y - imgHeight,
            width: imgWidth,
            height: imgHeight,
          });

          y -= imgHeight + 12;
        }
      } catch (err) {
        console.error('Failed to embed photo:', err);
      }
    }

    // ✅ VIDEO / AUDIO LINKS
    if (report.videoUrl || report.audioUrl) {
      writeDivider();
      writeLine('Additional Media', { bold: true, size: 12 });
      if (report.videoUrl)
        writeLine(`Video: ${report.videoUrl}`, { size: 9, color: [0.3, 0.3, 0.8] });
      if (report.audioUrl)
        writeLine(`Audio: ${report.audioUrl}`, { size: 9, color: [0.3, 0.3, 0.8] });
      y -= 8;
    }

    // LOCATION
    writeDivider();
    writeLine('Location', { bold: true, size: 12 });
    writeLine(`Coordinates: ${report.latitude.toFixed(6)}, ${report.longitude.toFixed(6)}`);
    if (location) {
      if (location.addressLine) writeLine(`Address: ${location.addressLine}`);
      if (location.city) writeLine(`City: ${location.city}`);
      if (location.stateProvince) writeLine(`State: ${location.stateProvince}`);
      if (location.postalCode) writeLine(`ZIP: ${location.postalCode}`);
      if (location.county) writeLine(`County: ${location.county}`);
      if (location.congressionalDistrict) {
        writeLine(`Congressional District: ${location.congressionalDistrict}`);
      }
    }
    y -= 8;

    // DESCRIPTION
    writeDivider();
    writeLine('Description', { bold: true, size: 12 });
    const descLines = wrapText(report.description || 'No description', 90);
    descLines.forEach((line) => writeLine(line));
    y -= 8;

    // AI SUMMARY
    if (report.aiSummary) {
      writeDivider();
      writeLine('AI Summary', { bold: true, size: 12 });
      const summaryLines = wrapText(report.aiSummary, 90);
      summaryLines.forEach((line) => writeLine(line, { color: [0.4, 0.4, 0.4] }));
      y -= 8;
    }

    // ENDORSEMENTS
    if (endorsementRows.length > 0) {
      writeDivider();
      writeLine(`Expert Endorsements (${endorsementRows.length})`, { bold: true, size: 12 });
      endorsementRows.forEach((e) => {
        writeLine(`- ${e.expertName || 'Expert'} - Severity ${e.severityLevel}`, { size: 10 });
        if (e.note) {
          const noteLines = wrapText(e.note, 85);
          noteLines.forEach((line) => writeLine(`  ${line}`, { size: 9, color: [0.4, 0.4, 0.4] }));
        }
      });
      y -= 8;
    }

    // STATUS TIMELINE
    if (historyRows.length > 0) {
      writeDivider();
      writeLine('Status Timeline', { bold: true, size: 12 });
      historyRows.forEach((h) => {
        const date = new Date(h.createdAt).toLocaleDateString();
        writeLine(`${date}: ${h.fromStatus || 'new'} -> ${h.toStatus}`, { size: 10 });
      });
      y -= 8;
    }

    // COMMENTS
    if (commentRows.length > 0) {
      writeDivider();
      writeLine(`Comments (showing ${commentRows.length})`, { bold: true, size: 12 });
      commentRows.forEach((c) => {
        writeLine(
          `${c.userName || 'User'} - ${new Date(c.createdAt).toLocaleDateString()}`,
          { size: 10, bold: true }
        );
        const bodyLines = wrapText(c.body, 85);
        bodyLines.slice(0, 2).forEach((line) => writeLine(`  ${line}`, { size: 9 }));
        y -= 4;
      });
    }

    // FOOTER ON ALL PAGES
    const pages = pdfDoc.getPages();
    pages.forEach((p, i) => {
      p.drawText(
        `Generated ${new Date().toISOString()} - Page ${i + 1} of ${pages.length}`,
        {
          x: 50,
          y: 30,
          size: 8,
          font,
          color: rgb(0.5, 0.5, 0.5),
        }
      );
    });

    const pdfBytes = await pdfDoc.save();

    return new NextResponse(pdfBytes as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="incident-${report.referenceNo || id}.pdf"`,
      },
    });
  } catch (error) {
    console.error('PDF generation error:', error);
    return NextResponse.json({ error: 'Failed to generate PDF' }, { status: 500 });
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    if ((current + ' ' + word).length > maxChars) {
      lines.push(current.trim());
      current = word;
    } else {
      current += ' ' + word;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}