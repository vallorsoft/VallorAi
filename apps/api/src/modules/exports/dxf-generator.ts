/** Minimal R2000-compatible DXF generator — no external dependencies.
 *  Produces LINE entities for walls and TEXT entities for room labels. */

export interface DxfWall {
  startX: number
  startY: number
  endX: number
  endY: number
  layer?: string
}

export interface DxfRoom {
  posX: number
  posY: number
  width: number
  depth: number
  label: string
  floor: number
}

function entity(type: string, pairs: [number, string | number][]): string {
  const lines: string[] = ['0', type]
  for (const [code, value] of pairs) {
    lines.push(String(code))
    lines.push(String(value))
  }
  return lines.join('\n')
}

function dxfLine(x1: number, y1: number, x2: number, y2: number, layer: string): string {
  return entity('LINE', [
    [8, layer],
    [10, x1.toFixed(4)],
    [20, y1.toFixed(4)],
    [30, '0.0'],
    [11, x2.toFixed(4)],
    [21, y2.toFixed(4)],
    [31, '0.0'],
  ])
}

function dxfText(x: number, y: number, text: string, layer: string, height = 0.3): string {
  return entity('TEXT', [
    [8, layer],
    [10, x.toFixed(4)],
    [20, y.toFixed(4)],
    [30, '0.0'],
    [40, height.toFixed(4)],
    [1, text],
    [72, 1], // horizontal center
  ])
}

/** Scale: 1 unit in DXF = 1 metre */
export function generateDxf(walls: DxfWall[], rooms: DxfRoom[]): string {
  const entities: string[] = []

  // Layer: one per floor (PARTER, ETAJ_1, …)
  const floorLabels: Record<number, string> = { 0: 'PARTER', '-1': 'SUBSOL' }
  const floorLabel = (f: number) => floorLabels[f] ?? `ETAJ_${f}`

  for (const w of walls) {
    const layer = w.layer ?? 'PERETI'
    entities.push(dxfLine(w.startX, w.startY, w.endX, w.endY, layer))
  }

  for (const r of rooms) {
    const layer = `CAMERE_${floorLabel(r.floor)}`
    const cx = r.posX + r.width / 2
    const cy = r.posY + r.depth / 2
    // Room outline as 4 lines
    entities.push(dxfLine(r.posX, r.posY, r.posX + r.width, r.posY, layer))
    entities.push(dxfLine(r.posX + r.width, r.posY, r.posX + r.width, r.posY + r.depth, layer))
    entities.push(dxfLine(r.posX + r.width, r.posY + r.depth, r.posX, r.posY + r.depth, layer))
    entities.push(dxfLine(r.posX, r.posY + r.depth, r.posX, r.posY, layer))
    entities.push(dxfText(cx, cy, r.label, `ETICHETE_${floorLabel(r.floor)}`))
  }

  const header = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015', // R2000
    '9', '$INSUNITS',
    '70', '6', // metres
    '0', 'ENDSEC',
  ].join('\n')

  const body = [
    '0', 'SECTION',
    '2', 'ENTITIES',
    entities.join('\n'),
    '0', 'ENDSEC',
    '0', 'EOF',
  ].join('\n')

  return `${header}\n${body}`
}
