import PDFDocument from 'pdfkit'

export interface PermitDocViolation {
  ruleId: string
  message: string
  severity: 'ERROR' | 'WARNING'
}

export interface PermitDocPassedRule {
  ruleId: string
  message: string
}

export interface PermitDocData {
  projectName: string
  ownerName: string
  projectAddress: string
  date: string
  houseData: {
    totalAreaSqm: number
    floorCount: number
    roomCount: number
    wallCount: number
  }
  rooms: Array<{
    type: string
    name: string
    areaSqm: number
    floor: number
  }>
  validationResult: {
    permitReadiness: number
    violations: PermitDocViolation[]
    passedRules: PermitDocPassedRule[]
  }
}

// ── Layout constants ──────────────────────────────────────────────────────────

const MARGIN = 50
const SECTION_HEADER_H = 22
const SECTION_BG_COLOR = '#f0f0f0'
const SECTION_TEXT_COLOR = '#333333'
const BODY_TEXT_COLOR = '#222222'
const MUTED_TEXT_COLOR = '#666666'
const ERROR_COLOR = '#c0392b'
const WARNING_COLOR = '#e67e22'
const PASS_COLOR = '#27ae60'
const HEADER_BG_COLOR = '#2c3e50'
const HEADER_TEXT_COLOR = '#ffffff'
const TABLE_STRIPE_COLOR = '#f9f9f9'
const BORDER_COLOR = '#dddddd'

function sectionHeader(doc: InstanceType<typeof PDFDocument>, title: string, y: number): number {
  const w = doc.page.width - 2 * MARGIN
  doc.rect(MARGIN, y, w, SECTION_HEADER_H).fill(SECTION_BG_COLOR)
  doc
    .fontSize(9)
    .font('Helvetica-Bold')
    .fillColor(SECTION_TEXT_COLOR)
    .text(title.toUpperCase(), MARGIN + 8, y + 7, { width: w - 16 })
  return y + SECTION_HEADER_H
}

function hLine(doc: InstanceType<typeof PDFDocument>, y: number): void {
  doc
    .moveTo(MARGIN, y)
    .lineTo(doc.page.width - MARGIN, y)
    .lineWidth(0.4)
    .strokeColor(BORDER_COLOR)
    .stroke()
}

function ensureRoom(doc: InstanceType<typeof PDFDocument>, needed: number, y: number): number {
  if (y + needed > doc.page.height - MARGIN - 60) {
    doc.addPage()
    return MARGIN
  }
  return y
}

export async function generatePermitDocPdf(data: PermitDocData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'portrait',
      margin: 0,
      info: {
        Title: `DTAC Rezumat — ${data.projectName}`,
        Author: 'VallorAI Platform',
        Subject: 'Documentatie Tehnica pentru Autorizarea Construirii — Rezumat',
      },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width

    // ── Cover / title block ───────────────────────────────────────────────────

    // Dark header band
    doc.rect(0, 0, pageW, 88).fill(HEADER_BG_COLOR)

    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .fillColor(HEADER_TEXT_COLOR)
      .text(
        'DOCUMENTATIE TEHNICA PENTRU AUTORIZAREA CONSTRUIRII (DTAC)',
        MARGIN,
        20,
        { width: pageW - 2 * MARGIN },
      )
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor('#a0b4c8')
      .text('REZUMAT / OSSZEFOGLALO — generat de VallorAI', MARGIN, 44, {
        width: pageW - 2 * MARGIN,
      })

    // Meta row under header band
    let y = 100

    // Left column: project name + address
    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(MUTED_TEXT_COLOR)
      .text('PROIECT', MARGIN, y)
    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor(BODY_TEXT_COLOR)
      .text(data.projectName || '—', MARGIN, y + 13, { width: (pageW - 2 * MARGIN) * 0.62 })

    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(MUTED_TEXT_COLOR)
      .text(data.projectAddress || '—', MARGIN, y + 29, {
        width: (pageW - 2 * MARGIN) * 0.62,
      })

    // Right column: beneficiar + date
    const rightX = MARGIN + (pageW - 2 * MARGIN) * 0.65
    const rightW = (pageW - 2 * MARGIN) * 0.35
    doc.fontSize(9).font('Helvetica-Bold').fillColor(MUTED_TEXT_COLOR).text('BENEFICIAR', rightX, y)
    doc
      .fontSize(10)
      .font('Helvetica')
      .fillColor(BODY_TEXT_COLOR)
      .text(data.ownerName || '—', rightX, y + 13, { width: rightW })

    doc
      .fontSize(9)
      .font('Helvetica-Bold')
      .fillColor(MUTED_TEXT_COLOR)
      .text('DATA', rightX, y + 33)
    doc
      .fontSize(9)
      .font('Helvetica')
      .fillColor(BODY_TEXT_COLOR)
      .text(data.date, rightX, y + 43, { width: rightW })

    y += 65
    hLine(doc, y)
    y += 14

    // ── Section 1: Technical data ─────────────────────────────────────────────

    y = sectionHeader(doc, 'Date tehnice / Muszaki adatok', y)
    y += 12

    const col1X = MARGIN
    const col2X = MARGIN + (pageW - 2 * MARGIN) / 2

    const techRows: Array<[string, string, string, string]> = [
      [
        'Suprafata utila totala',
        `${data.houseData.totalAreaSqm.toFixed(1)} m²`,
        'Numar niveluri',
        String(data.houseData.floorCount),
      ],
      [
        'Numar camere',
        String(data.houseData.roomCount),
        'Numar pereti',
        String(data.houseData.wallCount),
      ],
    ]

    for (const [l1, v1, l2, v2] of techRows) {
      doc.fontSize(8).font('Helvetica').fillColor(MUTED_TEXT_COLOR).text(l1, col1X, y)
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(BODY_TEXT_COLOR)
        .text(v1, col1X, y + 12, { width: (pageW - 2 * MARGIN) / 2 - 4 })

      doc.fontSize(8).font('Helvetica').fillColor(MUTED_TEXT_COLOR).text(l2, col2X, y)
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .fillColor(BODY_TEXT_COLOR)
        .text(v2, col2X, y + 12, { width: (pageW - 2 * MARGIN) / 2 - 4 })
      y += 30
    }

    y += 6
    hLine(doc, y)
    y += 14

    // ── Section 2: Room list ──────────────────────────────────────────────────

    y = ensureRoom(doc, 60, y)
    y = sectionHeader(doc, 'Lista incaperilor / Helyisegek listaja', y)
    y += 8

    if (data.rooms.length === 0) {
      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor(MUTED_TEXT_COLOR)
        .text('Nicio camera definita.', MARGIN + 4, y)
      y += 18
    } else {
      // Table header row
      const tableW = pageW - 2 * MARGIN
      const cols = {
        nr:   { x: MARGIN,           w: 28 },
        tip:  { x: MARGIN + 28,      w: Math.floor(tableW * 0.30) },
        nume: { x: MARGIN + 28 + Math.floor(tableW * 0.30), w: Math.floor(tableW * 0.30) },
        etaj: { x: MARGIN + 28 + Math.floor(tableW * 0.60), w: Math.floor(tableW * 0.18) },
        sup:  { x: MARGIN + 28 + Math.floor(tableW * 0.78), w: Math.floor(tableW * 0.22) - 28 },
      }
      const colKeys = Object.keys(cols) as Array<keyof typeof cols>
      const headerLabels: Record<keyof typeof cols, string> = {
        nr:   'Nr.',
        tip:  'Tip',
        nume: 'Denumire',
        etaj: 'Nivel',
        sup:  'Suprafata (m²)',
      }
      doc.rect(MARGIN, y, tableW, 16).fill('#e8e8e8')
      for (const key of colKeys) {
        const { x, w } = cols[key]
        doc
          .fontSize(7.5)
          .font('Helvetica-Bold')
          .fillColor(SECTION_TEXT_COLOR)
          .text(headerLabels[key], x + 3, y + 5, { width: w - 4 })
      }
      y += 16

      for (let i = 0; i < data.rooms.length; i++) {
        const r = data.rooms[i]
        y = ensureRoom(doc, 18, y)
        if (i % 2 === 0) {
          doc.rect(MARGIN, y, tableW, 15).fill(TABLE_STRIPE_COLOR)
        }

        const floorLabel =
          r.floor === 0 ? 'Parter' : r.floor < 0 ? `Subsol ${Math.abs(r.floor)}` : `Etaj ${r.floor}`

        const rowVals: Record<keyof typeof cols, string> = {
          nr:   String(i + 1),
          tip:  r.type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()),
          nume: r.name || '—',
          etaj: floorLabel,
          sup:  r.areaSqm.toFixed(1),
        }
        for (const key of colKeys) {
          const { x, w } = cols[key]
          doc
            .fontSize(8)
            .font('Helvetica')
            .fillColor(BODY_TEXT_COLOR)
            .text(rowVals[key], x + 3, y + 4, { width: w - 4, ellipsis: true })
        }
        y += 15
      }
    }

    y += 8
    hLine(doc, y)
    y += 14

    // ── Section 3: Compliance check ───────────────────────────────────────────

    y = ensureRoom(doc, 60, y)
    y = sectionHeader(doc, 'Verificare conformitate / Megfeleloseg-ellenorzes', y)
    y += 12

    // Permit-readiness meter
    const readiness = Math.max(0, Math.min(100, data.validationResult.permitReadiness))
    const meterW = pageW - 2 * MARGIN - 160
    const meterH = 14
    const meterX = MARGIN

    // Background track
    doc.rect(meterX, y, meterW, meterH).fill('#e0e0e0')
    // Fill
    const fillColor = readiness >= 80 ? PASS_COLOR : readiness >= 50 ? WARNING_COLOR : ERROR_COLOR
    if (readiness > 0) {
      doc.rect(meterX, y, (meterW * readiness) / 100, meterH).fill(fillColor)
    }

    // Label next to meter
    doc
      .fontSize(8)
      .font('Helvetica')
      .fillColor(MUTED_TEXT_COLOR)
      .text('Grad de pregatire pentru autorizare:', meterX + meterW + 10, y)
    doc
      .fontSize(22)
      .font('Helvetica-Bold')
      .fillColor(fillColor)
      .text(`${readiness}%`, meterX + meterW + 10, y + 10, { width: 120 })

    y += meterH + 24

    const { violations, passedRules } = data.validationResult
    const errors = violations.filter((v) => v.severity === 'ERROR')
    const warnings = violations.filter((v) => v.severity === 'WARNING')

    // Errors
    if (errors.length > 0) {
      y = ensureRoom(doc, 30, y)
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(ERROR_COLOR)
        .text(`Erori (${errors.length}) — trebuie remediate inainte de depunere:`, MARGIN, y)
      y += 15
      for (const v of errors) {
        y = ensureRoom(doc, 26, y)
        doc.circle(MARGIN + 6, y + 5, 3).fill(ERROR_COLOR)
        doc
          .fontSize(8.5)
          .font('Helvetica')
          .fillColor(BODY_TEXT_COLOR)
          .text(v.message, MARGIN + 15, y, { width: pageW - 2 * MARGIN - 15 })
        doc
          .fontSize(7)
          .font('Helvetica-Oblique')
          .fillColor(MUTED_TEXT_COLOR)
          .text(`[${v.ruleId}]`, MARGIN + 15, doc.y + 1, { width: pageW - 2 * MARGIN - 15 })
        y = doc.y + 6
      }
      y += 4
    }

    // Warnings
    if (warnings.length > 0) {
      y = ensureRoom(doc, 30, y)
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(WARNING_COLOR)
        .text(`Avertismente (${warnings.length}) — recomandat de remediat:`, MARGIN, y)
      y += 15
      for (const v of warnings) {
        y = ensureRoom(doc, 26, y)
        doc.circle(MARGIN + 6, y + 5, 3).fill(WARNING_COLOR)
        doc
          .fontSize(8.5)
          .font('Helvetica')
          .fillColor(BODY_TEXT_COLOR)
          .text(v.message, MARGIN + 15, y, { width: pageW - 2 * MARGIN - 15 })
        doc
          .fontSize(7)
          .font('Helvetica-Oblique')
          .fillColor(MUTED_TEXT_COLOR)
          .text(`[${v.ruleId}]`, MARGIN + 15, doc.y + 1, { width: pageW - 2 * MARGIN - 15 })
        y = doc.y + 6
      }
      y += 4
    }

    // Passed rules
    if (passedRules.length > 0) {
      y = ensureRoom(doc, 30, y)
      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor(PASS_COLOR)
        .text(`Reguli respectate (${passedRules.length}):`, MARGIN, y)
      y += 14
      for (const r of passedRules) {
        y = ensureRoom(doc, 16, y)
        doc.circle(MARGIN + 6, y + 5, 3).fill(PASS_COLOR)
        doc
          .fontSize(8.5)
          .font('Helvetica')
          .fillColor(BODY_TEXT_COLOR)
          .text(r.message, MARGIN + 15, y, { width: pageW - 2 * MARGIN - 15 })
        y = doc.y + 4
      }
    }

    if (errors.length === 0 && warnings.length === 0 && passedRules.length === 0) {
      doc
        .fontSize(9)
        .font('Helvetica-Oblique')
        .fillColor(MUTED_TEXT_COLOR)
        .text(
          'Nu exista date de validare. Adauga camere si pereti pentru a activa verificarea.',
          MARGIN + 4,
          y,
        )
      y = doc.y + 8
    }

    y = doc.y + 10
    hLine(doc, y)
    y += 10

    // ── Disclaimer ────────────────────────────────────────────────────────────

    y = ensureRoom(doc, 80, y)
    const disclaimerW = pageW - 2 * MARGIN
    doc
      .fontSize(7)
      .font('Helvetica-BoldOblique')
      .fillColor(MUTED_TEXT_COLOR)
      .text('NOTA IMPORTANTA / FONTOS MEGJEGYZES / IMPORTANT NOTE', MARGIN, y, {
        width: disclaimerW,
      })
    y = doc.y + 4

    doc
      .fontSize(7)
      .font('Helvetica-Oblique')
      .fillColor(MUTED_TEXT_COLOR)
      .text(
        'Acest document este generat automat de sistemul VallorAI si NU inlocuieste documentatia ' +
          'tehnica semnata si stampilata de un arhitect sau inginer autorizat (Legea 184/2001 privind ' +
          'exercitarea profesiei de arhitect; Legea 10/1995 privind calitatea in constructii). Toate ' +
          'valorile tehnice, calculele structurale si verificarile normative prezentate trebuie ' +
          'confirmate de un specialist autorizat inainte de depunerea documentatiei pentru autorizatie ' +
          'de construire (Legea 50/1991). VallorAI nu raspunde de corectitudinea sau completitudinea ' +
          'informatiilor fata de cerintele specifice ale proiectului sau ale autoritatilor locale.',
        MARGIN,
        y,
        { width: disclaimerW },
      )

    y = doc.y + 8
    hLine(doc, y)
    y += 6

    // Footer
    doc
      .fontSize(7)
      .font('Helvetica')
      .fillColor('#aaaaaa')
      .text(
        `VallorAI Platform  |  Generat: ${data.date}  |  DTAC Rezumat — doar uz informativ`,
        MARGIN,
        y,
        { width: disclaimerW, align: 'center' },
      )

    doc.end()
  })
}
