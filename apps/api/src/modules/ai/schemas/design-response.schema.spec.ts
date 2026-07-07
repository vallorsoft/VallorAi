import { parseDesignResponse, stripCodeFences } from './design-response.schema'

const VALID_RESPONSE = {
  message: 'Salut! Hai să începem.',
  design_update: {
    action: 'ADD_ROOM',
    data: { type: 'LIVING_ROOM', area: 20 },
  },
  next_question: 'Care este suprafața terenului?',
  ai_justification: 'Am adăugat camera de zi conform cerințelor.',
}

describe('parseDesignResponse', () => {
  it('parses and validates plain valid JSON', () => {
    const result = parseDesignResponse(JSON.stringify(VALID_RESPONSE))

    expect(result.success).toBe(true)
    expect(result.data).toEqual(VALID_RESPONSE)
    expect(result.error).toBeUndefined()
  })

  it('parses and validates valid JSON wrapped in a ```json code fence', () => {
    const wrapped = '```json\n' + JSON.stringify(VALID_RESPONSE, null, 2) + '\n```'
    const result = parseDesignResponse(wrapped)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(VALID_RESPONSE)
  })

  it('parses and validates valid JSON wrapped in a plain ``` code fence', () => {
    const wrapped = '```\n' + JSON.stringify(VALID_RESPONSE) + '\n```'
    const result = parseDesignResponse(wrapped)

    expect(result.success).toBe(true)
    expect(result.data).toEqual(VALID_RESPONSE)
  })

  it('accepts a null design_update', () => {
    const withNullUpdate = { ...VALID_RESPONSE, design_update: null }
    const result = parseDesignResponse(JSON.stringify(withNullUpdate))

    expect(result.success).toBe(true)
    expect(result.data?.design_update).toBeNull()
  })

  it('degrades gracefully (no throw) on malformed JSON', () => {
    expect(() => parseDesignResponse('{ this is not valid json')).not.toThrow()

    const result = parseDesignResponse('{ this is not valid json')
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid JSON/)
    expect(result.data).toBeUndefined()
  })

  it('degrades gracefully (no throw) on JSON that violates the schema', () => {
    const badShape = { message: 'hello' } // missing required fields

    expect(() => parseDesignResponse(JSON.stringify(badShape))).not.toThrow()

    const result = parseDesignResponse(JSON.stringify(badShape))
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Schema validation failed/)
    expect(result.data).toBeUndefined()
  })

  it('degrades gracefully on a plain conversational (non-JSON) reply', () => {
    const result = parseDesignResponse('Salut! Ce suprafață are terenul tău?')

    expect(result.success).toBe(false)
    expect(result.error).toMatch(/Invalid JSON/)
  })
})

describe('stripCodeFences', () => {
  it('leaves unfenced content untouched', () => {
    expect(stripCodeFences('{"a":1}')).toBe('{"a":1}')
  })

  it('strips a ```json fence', () => {
    expect(stripCodeFences('```json\n{"a":1}\n```')).toBe('{"a":1}')
  })

  it('strips a plain ``` fence', () => {
    expect(stripCodeFences('```\n{"a":1}\n```')).toBe('{"a":1}')
  })
})
