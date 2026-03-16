import { google } from 'googleapis'

const SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export function getOAuth2Client() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/google-calendar/callback`
  )
}

export function getAuthUrl(userId: string) {
  const oauth2Client = getOAuth2Client()
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    state: userId,
  })
}

export async function getAuthenticatedClient(refreshToken: string) {
  const oauth2Client = getOAuth2Client()
  oauth2Client.setCredentials({ refresh_token: refreshToken })
  return oauth2Client
}

interface CalendarEventParams {
  title: string
  description?: string
  date: string        // YYYY-MM-DD
  time: string        // HH:MM
  type: string        // llamada | reunion | video
  location?: string
  leadName?: string
}

export async function createCalendarEvent(
  refreshToken: string,
  params: CalendarEventParams
): Promise<string | null> {
  try {
    const auth = await getAuthenticatedClient(refreshToken)
    const calendar = google.calendar({ version: 'v3', auth })

    const startDateTime = `${params.date}T${params.time}:00`
    const [hours, minutes] = params.time.split(':').map(Number)
    const endHour = hours + 1
    const endTime = `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
    const endDateTime = `${params.date}T${endTime}:00`

    const typeEmoji = params.type === 'llamada' ? '📞' : params.type === 'video' ? '📹' : '🤝'

    const event = await calendar.events.insert({
      calendarId: 'primary',
      requestBody: {
        summary: `${typeEmoji} ${params.title}`,
        description: [
          params.leadName ? `Lead: ${params.leadName}` : '',
          params.description || '',
          '',
          'Creado desde CRM Comercial - SAYA',
        ].filter(Boolean).join('\n'),
        start: {
          dateTime: startDateTime,
          timeZone: 'America/Lima',
        },
        end: {
          dateTime: endDateTime,
          timeZone: 'America/Lima',
        },
        location: params.location || undefined,
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'popup', minutes: 15 },
            { method: 'popup', minutes: 5 },
          ],
        },
      },
    })

    return event.data.id || null
  } catch (error) {
    console.error('Error creating Google Calendar event:', error)
    return null
  }
}

export async function updateCalendarEvent(
  refreshToken: string,
  eventId: string,
  params: Partial<CalendarEventParams>
): Promise<boolean> {
  try {
    const auth = await getAuthenticatedClient(refreshToken)
    const calendar = google.calendar({ version: 'v3', auth })

    const updateBody: Record<string, unknown> = {}

    if (params.title) {
      const typeEmoji = params.type === 'llamada' ? '📞' : params.type === 'video' ? '📹' : '🤝'
      updateBody.summary = `${typeEmoji} ${params.title}`
    }

    if (params.date && params.time) {
      const startDateTime = `${params.date}T${params.time}:00`
      const [hours, minutes] = params.time.split(':').map(Number)
      const endHour = hours + 1
      const endTime = `${String(endHour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
      const endDateTime = `${params.date}T${endTime}:00`

      updateBody.start = { dateTime: startDateTime, timeZone: 'America/Lima' }
      updateBody.end = { dateTime: endDateTime, timeZone: 'America/Lima' }
    }

    if (params.description !== undefined) updateBody.description = params.description
    if (params.location !== undefined) updateBody.location = params.location

    await calendar.events.patch({
      calendarId: 'primary',
      eventId,
      requestBody: updateBody,
    })

    return true
  } catch (error) {
    console.error('Error updating Google Calendar event:', error)
    return false
  }
}

export async function cancelCalendarEvent(
  refreshToken: string,
  eventId: string
): Promise<boolean> {
  try {
    const auth = await getAuthenticatedClient(refreshToken)
    const calendar = google.calendar({ version: 'v3', auth })

    await calendar.events.delete({
      calendarId: 'primary',
      eventId,
    })

    return true
  } catch (error) {
    console.error('Error cancelling Google Calendar event:', error)
    return false
  }
}
