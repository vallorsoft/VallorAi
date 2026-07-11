/**
 * IFC2x3 STEP Physical File generator — pure text, no external library.
 *
 * Specification: ISO 16739-1 / IFC2x3 Final (BuildingSMART International)
 * File format: ISO 10303-21 (STEP Physical File)
 *
 * Entity parameter counts verified against the IFC2x3 schema and cross-checked
 * against multiple open-source IFC parsers. A BIM coordinator should run the
 * output through an IFC conformance checker (e.g. ifcOpenShell) before
 * construction use.
 */

export interface IfcRoom {
  id: string
  type: string
  posX: number
  posY: number
  width: number
  area: number
  floor: number
  height?: number
}

export interface IfcWall {
  id: string
  startX: number
  startY: number
  endX: number
  endY: number
  thickness: number
  height: number
  exterior: boolean
  floor: number
}

export interface IfcExportData {
  projectName: string
  date: string
  rooms: IfcRoom[]
  walls: IfcWall[]
  floors: number
}

/** IFC GUID character set (base-64 subset per ISO 10303-21 §6.4) */
const IFC_GUID_CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz_$'

function makeGuid(): string {
  let g = ''
  for (let i = 0; i < 22; i++) {
    g += IFC_GUID_CHARS[Math.floor(Math.random() * 64)]
  }
  return g
}

/** Format a JS number as an IFC REAL literal (must always contain a decimal point). */
function fr(n: number): string {
  if (!isFinite(n) || isNaN(n)) return '0.'
  if (Number.isInteger(n)) return `${n}.`
  // Remove trailing zeros but keep at least one decimal digit
  return n.toFixed(6).replace(/(\.\d*?)0+$/, '$1')
}

/** Escape single quotes for IFC string literals (doubled per ISO 10303-21). */
function esc(s: string): string {
  return (s ?? '').replace(/'/g, "''")
}

/** Convert a snake_case room type to a readable label. */
function roomLabel(type: string): string {
  return (type ?? 'Room')
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Generate a complete, schema-valid IFC2x3 STEP file.
 *
 * Rooms   → IFCSPACE  with rectangular IFCEXTRUDEDAREASOLID footprint
 * Walls   → IFCWALL   with rectangular swept solid along the wall direction
 * Floors  → IFCBUILDINGSTOREY, one per unique floor index, elevated at
 *            floor × 2.7 m (LEVEL_HEIGHT_M, matching bim-engine constant)
 */
export function generateIfcContent(data: IfcExportData): string {
  const lines: string[] = []
  let counter = 0
  const next = () => ++counter
  const g = makeGuid
  const entity = (id: number, def: string) => lines.push(`#${id} = ${def};`)

  const LEVEL_HEIGHT_M = 2.7

  // ── 1. Admin / ownership ──────────────────────────────────────────────────
  const orgId = next()
  const personId = next()
  const personOrgId = next()
  const appId = next()
  const ownerHistId = next()

  entity(orgId, `IFCORGANIZATION($,'VallorAI SRL','vallorai.ro',$,$)`)
  entity(personId, `IFCPERSON($,'VallorAI','Platform',$,$,$,$,$)`)
  entity(personOrgId, `IFCPERSONANDORGANIZATION(#${personId},#${orgId},$)`)
  entity(appId, `IFCAPPLICATION(#${orgId},'1.0','VallorAI','vallorai')`)
  entity(ownerHistId, `IFCOWNERHISTORY(#${personOrgId},#${appId},$,.ADDED.,$,$,$,0)`)

  // ── 2. World coordinate system, geometry context and units ────────────────
  const worldOriginId = next()
  const worldZId = next()
  const worldXId = next()
  const worldPlaceId = next()
  const geomCtxId = next()
  const siLengthId = next()
  const unitAssId = next()

  entity(worldOriginId, `IFCCARTESIANPOINT((0.,0.,0.))`)
  entity(worldZId, `IFCDIRECTION((0.,0.,1.))`)
  entity(worldXId, `IFCDIRECTION((1.,0.,0.))`)
  entity(worldPlaceId, `IFCAXIS2PLACEMENT3D(#${worldOriginId},#${worldZId},#${worldXId})`)
  entity(
    geomCtxId,
    `IFCGEOMETRICREPRESENTATIONCONTEXT('Plan','Model',3,1.E-05,#${worldPlaceId},$)`,
  )
  entity(siLengthId, `IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)`)
  entity(unitAssId, `IFCUNITASSIGNMENT((#${siLengthId}))`)

  // ── 3. Project ─────────────────────────────────────────────────────────────
  const projectId = next()
  entity(
    projectId,
    `IFCPROJECT('${g()}',#${ownerHistId},'${esc(data.projectName)}',$,$,$,$,(#${geomCtxId}),#${unitAssId})`,
  )

  // ── 4. Shared identity solid placement (origin, no rotation) ───────────────
  // All IFCEXTRUDEDAREASOLID entities reference this shared placement entity;
  // sharing a stateless reference entity is valid IFC2x3.
  const sharedSolidOriginId = next()
  const sharedSolidPlaceId = next()
  entity(sharedSolidOriginId, `IFCCARTESIANPOINT((0.,0.,0.))`)
  entity(sharedSolidPlaceId, `IFCAXIS2PLACEMENT3D(#${sharedSolidOriginId},$,$)`)

  // ── 5. Site ────────────────────────────────────────────────────────────────
  const siteOriginId = next()
  const sitePlaceId = next()
  const siteLocalPlaceId = next()
  const siteId = next()
  entity(siteOriginId, `IFCCARTESIANPOINT((0.,0.,0.))`)
  entity(sitePlaceId, `IFCAXIS2PLACEMENT3D(#${siteOriginId},$,$)`)
  entity(siteLocalPlaceId, `IFCLOCALPLACEMENT($,#${sitePlaceId})`)
  // 14 params: GlobalId OwnerHistory Name Description ObjectType
  //            ObjectPlacement Representation LongName CompositionType
  //            RefLatitude RefLongitude RefElevation LandTitleNumber SiteAddress
  entity(
    siteId,
    `IFCSITE('${g()}',#${ownerHistId},'Site',$,$,#${siteLocalPlaceId},$,$,.ELEMENT.,$,$,$,$,$)`,
  )

  // ── 6. Building ────────────────────────────────────────────────────────────
  const bldgOriginId = next()
  const bldgPlaceId = next()
  const bldgLocalPlaceId = next()
  const buildingId = next()
  entity(bldgOriginId, `IFCCARTESIANPOINT((0.,0.,0.))`)
  entity(bldgPlaceId, `IFCAXIS2PLACEMENT3D(#${bldgOriginId},$,$)`)
  entity(bldgLocalPlaceId, `IFCLOCALPLACEMENT(#${siteLocalPlaceId},#${bldgPlaceId})`)
  // 12 params: …CompositionType ElevationOfRefHeight ElevationOfTerrain BuildingAddress
  entity(
    buildingId,
    `IFCBUILDING('${g()}',#${ownerHistId},'${esc(data.projectName)}',$,$,#${bldgLocalPlaceId},$,$,.ELEMENT.,$,$,$)`,
  )

  // ── 7. Building storeys — one per unique floor index ───────────────────────
  const allFloors = [
    ...new Set([
      ...data.rooms.map((r) => r.floor ?? 0),
      ...data.walls.map((w) => w.floor ?? 0),
    ]),
  ].sort((a, b) => a - b)
  if (allFloors.length === 0) allFloors.push(0)

  const storeyIds = new Map<number, number>()
  const storeyLocalPlaceIds = new Map<number, number>()

  for (const floor of allFloors) {
    const elev = floor * LEVEL_HEIGHT_M
    const storeyOriginId = next()
    const storeyPlaceId = next()
    const storeyLocalPlaceId = next()
    const storeyId = next()
    const floorName =
      floor === 0 ? 'Parter' : floor < 0 ? `Subsol ${Math.abs(floor)}` : `Etaj ${floor}`

    entity(storeyOriginId, `IFCCARTESIANPOINT((0.,0.,${fr(elev)}))`)
    entity(storeyPlaceId, `IFCAXIS2PLACEMENT3D(#${storeyOriginId},$,$)`)
    entity(storeyLocalPlaceId, `IFCLOCALPLACEMENT(#${bldgLocalPlaceId},#${storeyPlaceId})`)
    // 10 params: …CompositionType Elevation
    entity(
      storeyId,
      `IFCBUILDINGSTOREY('${g()}',#${ownerHistId},'${esc(floorName)}',$,$,#${storeyLocalPlaceId},$,$,.ELEMENT.,${fr(elev)})`,
    )

    storeyIds.set(floor, storeyId)
    storeyLocalPlaceIds.set(floor, storeyLocalPlaceId)
  }

  // ── 8. Rooms → IFCSPACE ────────────────────────────────────────────────────
  const floorSpaceIds = new Map<number, number[]>()

  for (const room of data.rooms) {
    const floor = room.floor ?? 0
    const storeyLocalPlaceId = storeyLocalPlaceIds.get(floor)!

    const w = Math.max(Math.abs(room.width ?? 1), 0.01)
    const d = Math.max(room.area > 0 ? room.area / w : w, 0.01)
    const h = Math.max(room.height ?? LEVEL_HEIGHT_M, 0.01)

    // Placement in storey local coords (storey is already at floor elevation)
    const originId = next()
    const placeId = next()
    const localPlaceId = next()
    entity(originId, `IFCCARTESIANPOINT((${fr(room.posX)},${fr(room.posY)},0.))`)
    entity(placeId, `IFCAXIS2PLACEMENT3D(#${originId},$,$)`)
    entity(localPlaceId, `IFCLOCALPLACEMENT(#${storeyLocalPlaceId},#${placeId})`)

    // Rectangular body: center of profile at (w/2, d/2) so corner is at local origin
    const profOriginId = next()
    const profPlaceId = next()
    const profId = next()
    const extDirId = next()
    const solidId = next()
    const shapeRepId = next()
    const shapeId = next()

    entity(profOriginId, `IFCCARTESIANPOINT((${fr(w / 2)},${fr(d / 2)}))`)
    entity(profPlaceId, `IFCAXIS2PLACEMENT2D(#${profOriginId},$)`)
    entity(profId, `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${profPlaceId},${fr(w)},${fr(d)})`)
    entity(extDirId, `IFCDIRECTION((0.,0.,1.))`)
    entity(
      solidId,
      `IFCEXTRUDEDAREASOLID(#${profId},#${sharedSolidPlaceId},#${extDirId},${fr(h)})`,
    )
    entity(
      shapeRepId,
      `IFCSHAPEREPRESENTATION(#${geomCtxId},'Body','SweptSolid',(#${solidId}))`,
    )
    entity(shapeId, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${shapeRepId}))`)

    // IFCSPACE — 11 params: …LongName CompositionType InteriorOrExteriorSpace ElevationWithFlooringM
    const spaceId = next()
    const typeName = esc((room.type ?? 'ROOM').replace(/[^A-Za-z0-9_]/g, '_').toUpperCase())
    const longName = esc(roomLabel(room.type ?? 'Room'))
    entity(
      spaceId,
      `IFCSPACE('${g()}',#${ownerHistId},'${typeName}',$,'${typeName}',#${localPlaceId},#${shapeId},'${longName}',.ELEMENT.,.INTERNAL.,$)`,
    )

    if (!floorSpaceIds.has(floor)) floorSpaceIds.set(floor, [])
    floorSpaceIds.get(floor)!.push(spaceId)
  }

  // ── 9. Walls → IFCWALL ─────────────────────────────────────────────────────
  const floorWallIds = new Map<number, number[]>()

  for (const wall of data.walls) {
    const floor = wall.floor ?? 0
    const storeyLocalPlaceId = storeyLocalPlaceIds.get(floor)!

    const dx = wall.endX - wall.startX
    const dy = wall.endY - wall.startY
    const length = Math.sqrt(dx * dx + dy * dy)
    if (length < 0.001) continue // skip degenerate walls

    const ux = dx / length
    const uy = dy / length
    const h = Math.max(wall.height ?? LEVEL_HEIGHT_M, 0.01)
    const t = Math.max(wall.thickness ?? 0.3, 0.01)

    // Placement: origin at wall start, local X along wall direction, local Z up.
    // IFCAXIS2PLACEMENT3D(Location, Axis=Z, RefDirection=X)
    const wallOriginId = next()
    const wallXDirId = next()
    const wallZDirId = next()
    const wallPlaceId = next()
    const wallLocalPlaceId = next()

    entity(wallOriginId, `IFCCARTESIANPOINT((${fr(wall.startX)},${fr(wall.startY)},0.))`)
    entity(wallXDirId, `IFCDIRECTION((${fr(ux)},${fr(uy)},0.))`)
    entity(wallZDirId, `IFCDIRECTION((0.,0.,1.))`)
    entity(wallPlaceId, `IFCAXIS2PLACEMENT3D(#${wallOriginId},#${wallZDirId},#${wallXDirId})`)
    entity(wallLocalPlaceId, `IFCLOCALPLACEMENT(#${storeyLocalPlaceId},#${wallPlaceId})`)

    // Body: rectangle (length × thickness) extruded upward in local Z.
    // Profile center at (length/2, thickness/2).
    const wallProfOriginId = next()
    const wallProfPlaceId = next()
    const wallProfId = next()
    const wallExtDirId = next()
    const wallSolidId = next()
    const wallShapeRepId = next()
    const wallShapeId = next()

    entity(wallProfOriginId, `IFCCARTESIANPOINT((${fr(length / 2)},${fr(t / 2)}))`)
    entity(wallProfPlaceId, `IFCAXIS2PLACEMENT2D(#${wallProfOriginId},$)`)
    entity(
      wallProfId,
      `IFCRECTANGLEPROFILEDEF(.AREA.,$,#${wallProfPlaceId},${fr(length)},${fr(t)})`,
    )
    entity(wallExtDirId, `IFCDIRECTION((0.,0.,1.))`)
    entity(
      wallSolidId,
      `IFCEXTRUDEDAREASOLID(#${wallProfId},#${sharedSolidPlaceId},#${wallExtDirId},${fr(h)})`,
    )
    entity(
      wallShapeRepId,
      `IFCSHAPEREPRESENTATION(#${geomCtxId},'Body','SweptSolid',(#${wallSolidId}))`,
    )
    entity(wallShapeId, `IFCPRODUCTDEFINITIONSHAPE($,$,(#${wallShapeRepId}))`)

    // IFCWALL — 8 params: GlobalId OwnerHistory Name Description ObjectType
    //                     ObjectPlacement Representation Tag
    const wallEntityId = next()
    const wallName = esc(wall.exterior ? 'Perete exterior' : 'Perete interior')
    entity(
      wallEntityId,
      `IFCWALL('${g()}',#${ownerHistId},'Wall_${wall.id.slice(-6)}',$,'${wallName}',#${wallLocalPlaceId},#${wallShapeId},$)`,
    )

    if (!floorWallIds.has(floor)) floorWallIds.set(floor, [])
    floorWallIds.get(floor)!.push(wallEntityId)
  }

  // ── 10. Spatial relationships ──────────────────────────────────────────────
  // Project → Site → Building → Storeys
  entity(
    next(),
    `IFCRELAGGREGATES('${g()}',#${ownerHistId},$,$,#${projectId},(#${siteId}))`,
  )
  entity(
    next(),
    `IFCRELAGGREGATES('${g()}',#${ownerHistId},$,$,#${siteId},(#${buildingId}))`,
  )
  const storeyRefList = allFloors.map((floorNum) => `#${storeyIds.get(floorNum)}`).join(',')
  entity(
    next(),
    `IFCRELAGGREGATES('${g()}',#${ownerHistId},$,$,#${buildingId},(${storeyRefList}))`,
  )

  // Storey → Spaces + Walls (one IFCRELCONTAINEDINSPATIALSTRUCTURE per floor)
  for (const floor of allFloors) {
    const contained = [
      ...(floorSpaceIds.get(floor) ?? []),
      ...(floorWallIds.get(floor) ?? []),
    ]
    if (contained.length === 0) continue
    const containedList = contained.map((id) => `#${id}`).join(',')
    entity(
      next(),
      `IFCRELCONTAINEDINSPATIALSTRUCTURE('${g()}',#${ownerHistId},$,$,(${containedList}),#${storeyIds.get(floor)})`,
    )
  }

  // ── 11. Assemble STEP file ─────────────────────────────────────────────────
  const now = new Date().toISOString().slice(0, 19)
  const safeProjectName = data.projectName.replace(/['"\\]/g, '_').slice(0, 80)

  const header = [
    'ISO-10303-21;',
    'HEADER;',
    `FILE_DESCRIPTION(('VallorAI IFC2x3 Export'),'2;1');`,
    `FILE_NAME('${safeProjectName}.ifc','${now}',('VallorAI Platform'),('vallorai.fly.dev'),'IFC2X3','VallorAI 1.0','');`,
    `FILE_SCHEMA(('IFC2X3'));`,
    'ENDSEC;',
    'DATA;',
  ].join('\n')

  return `${header}\n${lines.join('\n')}\nENDSEC;\nEND-ISO-10303-21;`
}
