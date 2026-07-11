import PDFDocument from 'pdfkit'

export interface FloorPlanRoom {
  id: string
  type: string
  posX: number
  posY: number
  width: number
  area: number
  floor: number
}

export interface FloorPlanWall {
  startX: number
  startY: number
  endX: number
  endY: number
  thickness: number
  exterior: boolean
  floor: number
}

export interface FloorPlanData {
  projectName: string
  houseName?: string
  date: string
  floors: number
  rooms: FloorPlanRoom[]
  walls: FloorPlanWall[]
}

export async function generateFloorPlanPdf(data: FloorPlanData): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      layout: 'landscape',
      margin: 40,
      info: { Title: `Alaprajz — ${data.projectName}`, Author: 'VallorAI' },
    })

    const chunks: Buffer[] = []
    doc.on('data', (chunk: Buffer) => chunks.push(chunk))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const pageW = doc.page.width
    const pageH = doc.page.height
    const margin = 40
    const titleH = 60
    const footerH = 40
    const drawW = pageW - 2 * margin
    const drawH = pageH - 2 * margin - titleH - footerH

    // Title block
    doc
      .fontSize(18)
      .font('Helvetica-Bold')
      .fillColor('#1a1a1a')
      .text('VallorAI — Alaprajz', margin, margin, { width: drawW })
    doc
      .fontSize(11)
      .font('Helvetica')
      .fillColor('#555')
      .text(
        `Projekt: ${data.projectName}  |  Dátum: ${data.date}  |  Méretarány: 1:100`,
        margin,
        margin + 24,
        { width: drawW },
      )
    doc
      .moveTo(margin, margin + titleH - 8)
      .lineTo(margin + drawW, margin + titleH - 8)
      .strokeColor('#aaa')
      .lineWidth(0.5)
      .stroke()

    const drawOriginY = margin + titleH

    if (data.rooms.length === 0 && data.walls.length === 0) {
      doc
        .fontSize(12)
        .font('Helvetica')
        .fillColor('#666')
        .text('Nincs elérhető alaprajz adat.', margin, drawOriginY + 40)
      doc.end()
      return
    }

    // Gather unique floors
    const uniqueFloors = [
      ...new Set([...data.rooms.map((r) => r.floor), ...data.walls.map((w) => w.floor)]),
    ].sort((a, b) => a - b)

    const floorCount = uniqueFloors.length || 1
    const floorPanelW = drawW / floorCount

    uniqueFloors.forEach((floor, fi) => {
      const floorRooms = data.rooms.filter((r) => r.floor === floor)
      const floorWalls = data.walls.filter((w) => w.floor === floor)

      const panelX = margin + fi * floorPanelW
      const panelW = floorPanelW - 10

      // Compute bounding box of this floor's geometry
      let minX = Infinity
      let minY = Infinity
      let maxX = -Infinity
      let maxY = -Infinity

      floorRooms.forEach((r) => {
        const h = r.width > 0 ? r.area / r.width : Math.sqrt(Math.max(r.area, 1))
        minX = Math.min(minX, r.posX)
        minY = Math.min(minY, r.posY)
        maxX = Math.max(maxX, r.posX + r.width)
        maxY = Math.max(maxY, r.posY + h)
      })
      floorWalls.forEach((w) => {
        minX = Math.min(minX, w.startX, w.endX)
        minY = Math.min(minY, w.startY, w.endY)
        maxX = Math.max(maxX, w.startX, w.endX)
        maxY = Math.max(maxY, w.startY, w.endY)
      })

      // Fallback when no geometry exists on this floor
      if (!isFinite(minX)) {
        minX = 0
        minY = 0
        maxX = 10
        maxY = 8
      }

      const spanX = maxX - minX || 10
      const spanY = maxY - minY || 8
      const scale = Math.min(panelW / spanX, (drawH - 24) / spanY) * 0.85

      const toScreenX = (x: number) =>
        panelX + (x - minX) * scale + (panelW - spanX * scale) / 2
      const toScreenY = (y: number) => drawOriginY + 20 + (y - minY) * scale

      // Floor label
      let floorLabel: string
      if (floor === 0) floorLabel = 'Parter'
      else if (floor < 0) floorLabel = `Subsol ${Math.abs(floor)}`
      else floorLabel = `Etaj ${floor}`

      doc
        .fontSize(9)
        .font('Helvetica-Bold')
        .fillColor('#555')
        .text(floorLabel, panelX, drawOriginY + 4, { width: panelW, align: 'center' })

      // Draw rooms
      floorRooms.forEach((r) => {
        const h = r.width > 0 ? r.area / r.width : Math.sqrt(Math.max(r.area, 1))
        const sx = toScreenX(r.posX)
        const sy = toScreenY(r.posY)
        const sw = r.width * scale
        const sh = h * scale

        doc
          .rect(sx, sy, sw, sh)
          .fillColor('#F5F0E8')
          .strokeColor('#777')
          .lineWidth(0.75)
          .fillAndStroke()

        const label = r.type
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/\b\w/g, (c) => c.toUpperCase())
        const areaLabel = `${r.area.toFixed(1)} m²`
        const maxFontSize = 8
        const fittedFont = Math.min(maxFontSize, (sw / Math.max(label.length, 1)) * 1.4)

        doc
          .fontSize(Math.max(fittedFont, 5))
          .font('Helvetica')
          .fillColor('#333')
          .text(label, sx + 2, sy + sh / 2 - 8, { width: sw - 4, align: 'center' })
        doc
          .fontSize(6)
          .fillColor('#666')
          .text(areaLabel, sx + 2, sy + sh / 2 + 1, { width: sw - 4, align: 'center' })
      })

      // Draw walls
      floorWalls.forEach((w) => {
        const thickness = Math.max(w.thickness * scale, 1.5)
        doc
          .moveTo(toScreenX(w.startX), toScreenY(w.startY))
          .lineTo(toScreenX(w.endX), toScreenY(w.endY))
          .lineWidth(thickness)
          .strokeColor(w.exterior ? '#1a1a1a' : '#666')
          .stroke()
      })

      // North arrow (top-right corner of panel)
      const nX = panelX + panelW - 16
      const nY = drawOriginY + 14
      doc
        .fontSize(7)
        .font('Helvetica-Bold')
        .fillColor('#444')
        .text('É', nX - 3, nY + 10)
      doc
        .moveTo(nX, nY + 8)
        .lineTo(nX, nY)
        .lineWidth(1)
        .strokeColor('#444')
        .stroke()
      doc
        .moveTo(nX - 4, nY + 4)
        .lineTo(nX, nY)
        .lineTo(nX + 4, nY + 4)
        .lineWidth(0.8)
        .stroke()
    })

    // Footer
    const footerY = pageH - margin - footerH + 10
    doc
      .moveTo(margin, footerY - 5)
      .lineTo(margin + drawW, footerY - 5)
      .lineWidth(0.5)
      .strokeColor('#aaa')
      .stroke()
    doc
      .fontSize(7.5)
      .font('Helvetica')
      .fillColor('#999')
      .text(
        `VallorAI Platform  |  Generálva: ${data.date}  |  Csak tájékoztató jellegű, nem engedélyezési terv`,
        margin,
        footerY,
        { width: drawW, align: 'center' },
      )

    doc.end()
  })
}
