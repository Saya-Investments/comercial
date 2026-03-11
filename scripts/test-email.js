const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,
  secure: false,
  auth: {
    user: 'yomiraslzr@gmail.com',
    pass: 'aret asut ppdl ojom',
  },
})

async function main() {
  console.log('Enviando email de prueba...')

  const info = await transporter.sendMail({
    from: '"CRM Comercial" <yomiraslzr@gmail.com>',
    to: 'yomiraslzr@gmail.com',
    subject: '📞 Prueba CRM - Recordatorio de Llamada',
    html: `
      <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; border: 1px solid #e5e7eb;">
        <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 28px 24px; text-align: center;">
          <h1 style="color: #ffffff; margin: 0; font-size: 20px; font-weight: 600;">
            📞 Recordatorio de Llamada
          </h1>
        </div>
        <div style="padding: 28px 24px;">
          <p style="color: #374151; font-size: 15px; margin: 0 0 20px;">
            Hola <strong>Yomira</strong>, tienes una llamada en los proximos minutos:
          </p>
          <div style="background: #f8fafc; border-radius: 8px; padding: 20px; border-left: 4px solid #14b8a6;">
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px; width: 110px;">Lead</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">Juan Perez (PRUEBA)</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Fecha</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">martes, 11 de marzo de 2026</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px;">Hora</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px; font-weight: 600;">15:30 hrs</td>
              </tr>
              <tr>
                <td style="padding: 6px 0; color: #6b7280; font-size: 13px; vertical-align: top;">Notas</td>
                <td style="padding: 6px 0; color: #111827; font-size: 14px;">Este es un email de prueba del CRM</td>
              </tr>
            </table>
          </div>
        </div>
        <div style="padding: 16px 24px; background: #f9fafb; text-align: center; border-top: 1px solid #e5e7eb;">
          <p style="color: #9ca3af; font-size: 11px; margin: 0;">CRM Comercial - SAYA Investments</p>
        </div>
      </div>
    `,
  })

  console.log('Email enviado exitosamente!')
  console.log('Message ID:', info.messageId)
  console.log('Revisa la bandeja de entrada de yomiraslzr@gmail.com')
}

main().catch((err) => {
  console.error('Error enviando email:', err.message)
  process.exit(1)
})
