import nodemailer from 'nodemailer'

const transporter = nodemailer.createTransport({
  service: 'gmail',
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: Bun.env.MAILER_USER,
    pass: Bun.env.MAILER_PASS,
  },
})

export function sendEmail(to: string, type: 'verification' | 'passwordReset') {
  const mailOptions = {
    from: Bun.env.MAILER_USER,
    to,
    subject: type === 'verification' ? 'Email Verification' : 'Password Reset',
    text:
      type === 'verification'
        ? 'Please verify your email'
        : 'Please reset your password',
  }

  return transporter.sendMail(mailOptions)
}
