import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: process.env.SMTP_SECURE === 'true',  // true para puerto 465, false para 587
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
})

interface ReminderEmailParams {
  to: string
  advisorName: string
  leadName: string
  type: 'llamada' | 'cita'
  date: string       // YYYY-MM-DD
  time: string       // HH:MM
  notes?: string
}

export async function sendAppointmentReminder(params: ReminderEmailParams) {
  const { to, advisorName, leadName, type, date, time, notes } = params

  const typeLabel = type === 'llamada' ? 'Recordatorio de Llamada' : 'Recordatorio de Cita'
  const dateFormatted = new Date(date + 'T00:00:00').toLocaleDateString('es-PE', {
    weekday: 'long',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  })

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 28px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
          ${type === 'llamada' ? '📞' : '🤝'} ${typeLabel}
        </h1>
      </div>

      <div style="padding: 28px 24px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
          Hola <strong>${advisorName}</strong>, tienes una ${type === 'llamada' ? 'llamada' : 'cita'} en los proximos minutos:
        </p>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; border-left: 4px solid #14b8a6;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 110px;">Lead</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${leadName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Fecha</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${dateFormatted}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Hora</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${time} hrs</td>
            </tr>
            ${notes ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px; vertical-align: top;">Notas</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px;">${notes}</td>
            </tr>
            ` : ''}
          </table>
        </div>
      </div>

      <div style="padding: 16px 24px; background: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">CRM Comercial - SAYA Investments</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: `"CRM Comercial" <${process.env.SMTP_USER}>`,
    to,
    subject: `${type === 'llamada' ? '📞' : '🤝'} ${typeLabel} - ${leadName} | ${dateFormatted} ${time}`,
    html,
  })
}

interface LeadAssignedEmailParams {
  to: string
  advisorName: string
  leadName: string
  producto: string
  scoring: number
  telefono: string
  esReasignacion: boolean
  crmUrl?: string
}

export async function sendLeadAssignedNotification(params: LeadAssignedEmailParams) {
  const { to, advisorName, leadName, producto, scoring, telefono, esReasignacion, crmUrl } = params

  const titulo = esReasignacion ? 'Lead Reasignado' : 'Nuevo Lead Asignado'
  const emoji = esReasignacion ? '🔄' : '🆕'
  const mensaje = esReasignacion
    ? `Se te ha reasignado un lead que requiere tu atención:`
    : `Se te ha asignado un nuevo lead:`

  const scoringColor = scoring >= 70 ? '#16a34a' : scoring >= 40 ? '#ca8a04' : '#dc2626'
  const scoringLabel = scoring >= 70 ? 'Alta' : scoring >= 40 ? 'Media' : 'Baja'

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
      <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 28px 24px; text-align: center;">
        <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
          ${emoji} ${titulo}
        </h1>
      </div>

      <div style="padding: 28px 24px;">
        <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
          Hola <strong>${advisorName}</strong>, ${mensaje}
        </p>

        <div style="background: #f8fafc; border-radius: 8px; padding: 20px; border-left: 4px solid #14b8a6;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 110px;">Lead</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${leadName}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Producto</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${producto || 'No especificado'}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Scoring</td>
              <td style="padding: 6px 0;">
                <span style="display: inline-block; padding: 2px 10px; border-radius: 12px; font-size: 13px; font-weight: 600; color: #fff; background: ${scoringColor};">
                  ${scoring}% — ${scoringLabel}
                </span>
              </td>
            </tr>
            ${telefono ? `
            <tr>
              <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Teléfono</td>
              <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">${telefono}</td>
            </tr>
            ` : ''}
          </table>
        </div>

        ${crmUrl ? `
        <div style="text-align: center; margin-top: 24px;">
          <a href="${crmUrl}" style="display: inline-block; padding: 12px 28px; background: #0f766e; color: #ffffff; text-decoration: none; border-radius: 8px; font-size: 14px; font-weight: 600;">
            Gestionar Lead en el CRM
          </a>
        </div>
        ` : ''}
      </div>

      <div style="padding: 16px 24px; background: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
        <p style="color: #9ca3af; font-size: 11px; margin: 0;">CRM Comercial - SAYA Investments</p>
      </div>
    </div>
  `

  await transporter.sendMail({
    from: `"CRM Comercial" <${process.env.SMTP_USER}>`,
    to,
    subject: `${emoji} ${titulo} — ${leadName} | ${producto || 'Sin producto'}`,
    html,
  })
}
