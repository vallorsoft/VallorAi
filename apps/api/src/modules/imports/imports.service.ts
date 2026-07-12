import { Injectable, BadRequestException, ServiceUnavailableException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { prisma } from '@ai-home-designer/database'

interface ExtractedRoom {
  type: string
  area_sqm: number
  floor: number
}

interface ExtractedFloorPlan {
  rooms: ExtractedRoom[]
  floors: number
  notes?: string
}

const VISION_PROMPT = `You are a Romanian residential floor-plan analyzer.
Analyze this floor-plan image and extract all rooms with their types and estimated areas.

Return ONLY valid JSON (no markdown, no prose) matching this schema:
{
  "rooms": [
    { "type": "LIVING_ROOM", "area_sqm": 25, "floor": 0 }
  ],
  "floors": 1,
  "notes": "optional observations"
}

Room type values (use exact strings): LIVING_ROOM, BEDROOM, BATHROOM, KITCHEN, HALL,
DINING_ROOM, STUDY, LAUNDRY, STORAGE, GARAGE, BALCONY, TERRACE, STAIRCASE, CORRIDOR, OTHER.

floor 0 = parter/ground floor, floor 1 = first floor, floor -1 = basement.
Estimate area_sqm from visual proportion if no dimension labels are visible.
`

@Injectable()
export class ImportsService {
  private readonly geminiApiKey: string

  constructor(private readonly config: ConfigService) {
    this.geminiApiKey = this.config.get('GEMINI_API_KEY') ?? ''
  }

  async importFloorPlan(opts: {
    imageBase64: string
    mimeType: string
    projectId: string
    userId: string
  }): Promise<{ roomsCreated: number; message: string }> {
    if (!this.geminiApiKey) {
      throw new ServiceUnavailableException('AI provider not configured')
    }

    // Validate mime type (only images)
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif']
    if (!allowed.includes(opts.mimeType)) {
      throw new BadRequestException('Only JPEG, PNG, WebP or GIF images are supported')
    }

    // Fetch project + house (or create house if missing)
    const project = await prisma.project.findUniqueOrThrow({
      where: { id: opts.projectId, userId: opts.userId },
      include: { house: true },
    })

    // Call Gemini vision API
    const extracted = await this.callGeminiVision(opts.imageBase64, opts.mimeType)

    // Ensure the house exists
    let houseId = project.house?.id
    if (!houseId) {
      const house = await prisma.house.create({
        data: {
          projectId: opts.projectId,
          floors: extracted.floors ?? 1,
        },
      })
      houseId = house.id
    } else {
      // Update floor count if it increased
      const newFloors = Math.max(project.house!.floors ?? 1, extracted.floors ?? 1)
      await prisma.house.update({
        where: { id: houseId },
        data: { floors: newFloors },
      })
    }

    // Create rooms
    let x = 0
    const SPACING = 0.5
    const rooms = extracted.rooms ?? []

    for (const r of rooms) {
      const side = Math.sqrt(r.area_sqm)
      const width = parseFloat((side * 1.3).toFixed(2))
      const depth = parseFloat((r.area_sqm / width).toFixed(2))

      await prisma.room.create({
        data: {
          houseId,
          type: r.type ?? 'OTHER',
          area: r.area_sqm,
          posX: x,
          posY: 0,
          width,
          depth,
          floor: r.floor ?? 0,
          height: 2.7,
        },
      })

      x += width + SPACING
    }

    return {
      roomsCreated: rooms.length,
      message: extracted.notes ?? `${rooms.length} cameră(e) importată(e) din imaginea planului`,
    }
  }

  private async callGeminiVision(imageBase64: string, mimeType: string): Promise<ExtractedFloorPlan> {
    const model = 'gemini-2.0-flash'
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.geminiApiKey}`

    const body = {
      contents: [
        {
          parts: [
            { text: VISION_PROMPT },
            { inlineData: { mimeType, data: imageBase64 } },
          ],
        },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })

    if (!res.ok) {
      const err = await res.text()
      throw new ServiceUnavailableException(`Gemini vision error: ${res.status} ${err.slice(0, 200)}`)
    }

    const data = (await res.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[]
    }
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''

    try {
      // Strip possible markdown code fences
      const clean = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      return JSON.parse(clean) as ExtractedFloorPlan
    } catch {
      throw new BadRequestException('AI could not parse the floor plan image')
    }
  }
}
